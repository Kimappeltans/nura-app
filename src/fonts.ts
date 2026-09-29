/**
 * The web: Inter Tight comes with the page itself (public/index.html), small
 * woff2 cuts under the same family names as the phone's TTFs
 * (fonts.native.ts), preloaded before the app's script has even arrived. So
 * there's nothing to wait for here: the app draws at once, in them.
 */
export function useAppFonts(): [loaded: boolean, error: Error | null] {
  return [true, null];
}
