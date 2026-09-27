import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

/**
 * One client, module-scoped — the same shape as getDb() in db.ts being one
 * connection. This is the ONLY place that talks to Supabase directly; every
 * screen and src/sync.ts go through this.
 *
 * PKCE + AsyncStorage session persistence is the standard native-app
 * pattern. detectSessionInUrl is on for the web only: a Google sign-in, a
 * magic link or a password reset comes back to the page with a code in the
 * address, and the client swaps it for the session. The phone has no address
 * bar; its links come back through the nura:// scheme instead. AsyncStorage over expo-secure-store
 * deliberately — SecureStore's ~2KB per-value iOS Keychain ceiling is a
 * known trap for a full session payload (access + refresh JWT + user
 * metadata), and everything else this app persists is already plaintext
 * local SQLite, so this introduces no new class of risk.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
    'Copy .env.example to .env and fill in your Supabase project values.',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
    flowType: 'pkce',
  },
});
