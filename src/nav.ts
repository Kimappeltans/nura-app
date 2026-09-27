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
