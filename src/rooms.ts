import { useEffect, useState } from 'react';
import { firstVisit } from './firstVisit';
import type * as all from './roomsAll';

/**
 * The web: the rooms past the sign-in (src/roomsAll.ts) come in their own
 * file, after the app's first one, so someone signed out, on the opening or
 * the sign-in, doesn't download and run them first. Someone who has been
 * here before gets them straight away, alongside the database opening, so
 * they're there by the time Home is; on the browser's first visit they come
 * once the opening is showing. The phone has them from the start
 * (rooms.native.ts).
 */
export type Rooms = typeof all;

let rooms: Rooms | null = null;
let loading: Promise<Rooms> | null = null;

function load(): Promise<Rooms> {
  if (!loading) {
    const started = import('./roomsAll').then(m => (rooms = m));
    loading = started;
    // a failed fetch (the network dropped) is tried again next time
    started.catch(() => { if (loading === started) loading = null; });
  }
  return loading;
}

if (typeof window !== 'undefined') {
  firstVisit.then(fresh => {
    if (!fresh) { load().catch(() => {}); return; }
    // first visit: after the opening's own pictures, when the page is quiet
    const later = () => setTimeout(() => load().catch(() => {}), 1500);
    if (document.readyState === 'complete') later(); else window.addEventListener('load', later, { once: true });
  });
}

/**
 * The rooms, or null while they're on their way; `wanted` once a room is to
 * be shown (before that, they come as above). A fetch that fails shows as a
 * screen that failed (Try again).
 */
export function useRooms(wanted: boolean): Rooms | null {
  const [got, setGot] = useState<Rooms | null>(rooms);
  const [failed, setFailed] = useState<unknown>(null);
  useEffect(() => {
    if (got || rooms || !wanted) return;
    let on = true;
    load().then(r => { if (on) setGot(r); }, e => { if (on) setFailed(e ?? new Error('the rooms did not load')); });
    return () => { on = false; };
  }, [got, wanted]);
  if (failed) throw failed;
  return got ?? rooms;   // fetched ahead (above): no wait at all
}
