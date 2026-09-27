import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

/** Where the legal and help pages live. On the web they sit next to the app. */
const SITE = process.env.EXPO_PUBLIC_SITE_URL ?? 'https://app.risewithnura.com';

export const LINKS = {
  privacy: '/privacy.html',
  terms: '/terms.html',
  support: '/support.html',
} as const;

export function openLink(key: keyof typeof LINKS) {
  const path = LINKS[key];
  if (Platform.OS === 'web') {
    window.open(path, '_blank', 'noopener');
    return;
  }
  WebBrowser.openBrowserAsync(SITE + path);
}
