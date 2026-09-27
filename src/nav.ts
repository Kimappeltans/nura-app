import { router } from 'expo-router';

/**
 * Back, or home when there's nothing behind this screen — a screen opened
 * straight from a link or a notification, or the web after a reload. A bare
 * router.back() there does nothing but warn ("GO_BACK was not handled").
 */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Back into the session that's already running: what the pill does, and
 *  what Begin becomes on the task it's for. */
export function backToSession(r: { id: string; endAt: number | null; span: number }) {
  router.push({ pathname: '/timer', params: { id: r.id, mins: String(r.endAt ? Math.round(r.span / 60) : 0) } });
}
