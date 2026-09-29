import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Web: is this the first time Nura has been opened in this browser? Then
 * there's nothing to wait for before the opening: no database yet (so not
 * onboarded, and no one's data), no saved session, no link to act on. The
 * opening can start while the database opens behind it (app/index.tsx),
 * instead of after, which is most of the first visit's wait on a phone.
 *
 * Only when all of these are certain, otherwise the usual startup:
 *   - the page is the home address, with nothing after it (no ?code=, no
 *     token, no error, no #): a link, a reset, the way back from Google
 *   - no Supabase session or sign-in in progress in localStorage (sb-…)
 *   - no database in this browser: expo-sqlite keeps it in the "expo-sqlite"
 *     folder of the origin's private file system, made the first time any
 *     tab opens it. Any tab that has had Nura open has made it, so a second
 *     tab never counts as a first visit.
 * The database waits for this answer before it opens (src/db.ts), so its own
 * folder can't be mistaken for an earlier visit's.
 *
 * The phone: never; it opens its database in a moment.
 */
async function check(): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    const { pathname, search, hash } = window.location;
    if (pathname !== '/' || search || hash) return false;
    for (let i = 0; i < window.localStorage.length; i++) {
      if (window.localStorage.key(i)?.startsWith('sb-')) return false;
    }
    const storage = navigator.storage as StorageManager & { getDirectory?: () => Promise<FileSystemDirectoryHandle> };
    if (!storage?.getDirectory) return false;
    const root = await storage.getDirectory();
    try {
      await root.getDirectoryHandle('expo-sqlite');
      return false;                       // a database is here: an earlier visit
    } catch (e) {
      return (e as { name?: string })?.name === 'NotFoundError';
    }
  } catch {
    return false;                         // can't tell: the usual startup
  }
}

let known = false;
/** Settles once, early (this module loads with the app). Never rejects. */
export const firstVisit: Promise<boolean> = check().then(v => (known = v), () => false);

/** The answer for a screen: false until it's known. */
export function useFirstVisit(): boolean {
  const [v, setV] = useState(known);
  useEffect(() => {
    let on = true;
    firstVisit.then(x => { if (on) setV(x); });
    return () => { on = false; };
  }, []);
  return v;
}
