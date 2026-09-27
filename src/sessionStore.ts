import AsyncStorage from '@react-native-async-storage/async-storage';

/** Where the web keeps the Supabase session (src/supabase.ts): the browser's
 *  localStorage, through AsyncStorage. The phone encrypts it instead
 *  (sessionStore.native.ts). */
export const sessionStore = AsyncStorage;
