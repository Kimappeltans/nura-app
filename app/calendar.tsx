import { useEffect } from 'react';
import { router } from 'expo-router';
import { useStore } from '../src/store';

/** /calendar (a link, a notification) — the Calendar is a room now: show that tab. */
export default function CalendarLink() {
  useEffect(() => {
    useStore.setState({ tab: 'day' });
    if (router.canDismiss()) router.dismissAll();
    else router.replace('/');
  }, []);
  return null;
}
