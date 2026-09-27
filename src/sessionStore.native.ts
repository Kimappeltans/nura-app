import 'react-native-get-random-values';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as aesjs from 'aes-js';

/**
 * Where the phone keeps the Supabase session (src/supabase.ts): Supabase's
 * "LargeSecureStore". A whole session is too big for the Keychain, so the
 * Keychain holds only a fresh 256-bit AES key for each value, and
 * AsyncStorage holds the value encrypted with it (AES-CTR). The web keeps
 * using the browser's localStorage (sessionStore.ts).
 *
 * AFTER_FIRST_UNLOCK: readable in the background once the phone has been
 * unlocked since it started, as AsyncStorage's file is, so a refresh while
 * the phone is locked doesn't find the key missing and sign out.
 *
 * A session an older build saved in plain text has no key: it's read as it
 * is once, and saved again encrypted.
 */
const KEYCHAIN = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

/** UTF-8 back to text. Not aes-js's own utf8.fromBytes: it breaks anything
 *  outside the Basic Multilingual Plane, like an emoji in a name. */
const fromUtf8 = (bytes: Uint8Array) =>
  decodeURIComponent(Array.from(bytes, b => `%${b.toString(16).padStart(2, '0')}`).join(''));

async function encrypt(key: string, value: string): Promise<string> {
  const aesKey = crypto.getRandomValues(new Uint8Array(256 / 8));
  const cipher = new aesjs.ModeOfOperation.ctr(aesKey, new aesjs.Counter(1));
  const bytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
  await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(aesKey), KEYCHAIN);
  return aesjs.utils.hex.fromBytes(bytes);
}

/** Null when it won't decrypt (a key that doesn't match): no session, not a crash. */
function decrypt(aesKeyHex: string, value: string): string | null {
  try {
    const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(aesKeyHex), new aesjs.Counter(1));
    return fromUtf8(cipher.decrypt(aesjs.utils.hex.toBytes(value)));
  } catch { return null; }
}

export const sessionStore = {
  async getItem(key: string): Promise<string | null> {
    const stored = await AsyncStorage.getItem(key);
    if (!stored) return null;
    const aesKey = await SecureStore.getItemAsync(key, KEYCHAIN);
    if (aesKey) return decrypt(aesKey, stored);
    // no key: a plain-text session from before, or nothing usable
    if (!stored.startsWith('{')) return null;
    await sessionStore.setItem(key, stored).catch(() => {});
    return stored;
  },
  async setItem(key: string, value: string): Promise<void> {
    await AsyncStorage.setItem(key, await encrypt(key, value));
  },
  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key, KEYCHAIN);
  },
};
