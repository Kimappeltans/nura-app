import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

/**
 * One client, module-scoped — the same shape as getDb() in db.ts being one
 * connection. This is the ONLY place that talks to Supabase directly; every
 * screen and src/sync.ts go through this.
 *
 * PKCE + AsyncStorage session persistence is the standard native-app
 * pattern: detectSessionInUrl is off because there's no browser address bar
 * on native to read a session out of. AsyncStorage over expo-secure-store
 * deliberately — SecureStore's ~2KB per-value iOS Keychain ceiling is a
 * known trap for a full session payload (access + refresh JWT + user
 * metadata), and everything else this app persists is already plaintext
 * local SQLite, so this introduces no new class of risk.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — ' +
    'copy .env.example to .env and fill in your Supabase project values.',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});
