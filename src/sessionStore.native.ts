import 'react-native-get-random-values';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as aesjs from 'aes-js';

/**
 * Where the phone keeps the Supabase session (src/supabase.ts). A whole
 * session is too big for the Keychain, so the Keychain holds one 256-bit AES
 * key for this device, and AsyncStorage holds each value encrypted with it
 * (AES-CTR, a fresh random counter per write): `v2:<counter>:<ciphertext>`.
 * A save is one AsyncStorage write, so the key and what it opens can't fall
 * out of step. The web keeps using the browser's localStorage (sessionStore.ts).
 *
 * AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: readable in the background once the
 * phone has been unlocked since it started, as AsyncStorage's file is (so a
 * refresh while the phone is locked doesn't find the key missing and sign
 * out), and never carried to another phone in a backup, so a restored
 * backup can't sign in anywhere else.
 *
 * Older builds kept a key per value (Supabase's LargeSecureStore, under the
 * value's own name, allowed into backups), and before that plain text: both
 * are read once and saved again the new way.
 */
const KEYCHAIN = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
const DEVICE_KEY = 'nura.session-key';
const LEGACY = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

/** UTF-8 back to text. Not aes-js's own utf8.fromBytes: it breaks anything
 *  outside the Basic Multilingual Plane, like an emoji in a name. */
const fromUtf8 = (bytes: Uint8Array) =>
  decodeURIComponent(Array.from(bytes, b => `%${b.toString(16).padStart(2, '0')}`).join(''));

/** Only a session (JSON) or the PKCE verifier (plain text) is ever stored:
 *  a wrong key or a changed byte gives neither, and is no session. */
const readable = (text: string) => {
  if (!text.startsWith('{')) return /^[\x20-\x7e]*$/.test(text);
  try { JSON.parse(text); return true; } catch { return false; }
};

/** This device's key, made once. A Keychain that can't be read throws, and
 *  is never taken for a missing key (that would replace it). */
let deviceKey: Promise<Uint8Array> | null = null;
function keyOfDevice(): Promise<Uint8Array> {
  deviceKey ??= (async () => {
    const hex = await SecureStore.getItemAsync(DEVICE_KEY, KEYCHAIN);
    if (hex) return aesjs.utils.hex.toBytes(hex);
    const made = crypto.getRandomValues(new Uint8Array(256 / 8));
    await SecureStore.setItemAsync(DEVICE_KEY, aesjs.utils.hex.fromBytes(made), KEYCHAIN);
    return made;
  })().catch(e => { deviceKey = null; throw e; });
  return deviceKey;
}

async function encrypt(value: string): Promise<string> {
  const counter = crypto.getRandomValues(new Uint8Array(16));
  const cipher = new aesjs.ModeOfOperation.ctr(await keyOfDevice(), new aesjs.Counter(counter));
  const bytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
  return `v2:${aesjs.utils.hex.fromBytes(counter)}:${aesjs.utils.hex.fromBytes(bytes)}`;
}

/** Null when it won't decrypt: no session, not a crash. */
function decrypt(key: Uint8Array, counter: number | Uint8Array, hex: string): string | null {
  try {
    const cipher = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(counter));
    const text = fromUtf8(cipher.decrypt(aesjs.utils.hex.toBytes(hex)));
    return readable(text) ? text : null;
  } catch { return null; }
}

export const sessionStore = {
  async getItem(key: string): Promise<string | null> {
    const stored = await AsyncStorage.getItem(key);
    if (!stored) return null;
    const v2 = /^v2:([0-9a-f]{32}):([0-9a-f]*)$/.exec(stored);
    if (v2) return decrypt(await keyOfDevice(), aesjs.utils.hex.toBytes(v2[1]), v2[2]);
    // from an older build: its own key under its own name, or plain text
    const legacyKey = await SecureStore.getItemAsync(key, LEGACY);
    const value = legacyKey ? decrypt(aesjs.utils.hex.toBytes(legacyKey), 1, stored)
      : stored.startsWith('{') ? stored : null;
    if (value) await sessionStore.setItem(key, value).catch(() => {});
    return value;
  },
  async setItem(key: string, value: string): Promise<void> {
    await AsyncStorage.setItem(key, await encrypt(value));
    // an older build's key for this value, no longer needed
    await SecureStore.deleteItemAsync(key, LEGACY).catch(() => {});
  },
  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key, LEGACY).catch(() => {});
  },
};
