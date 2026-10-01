import {
  useFonts, InterTight_400Regular, InterTight_500Medium, InterTight_600SemiBold,
} from '@expo-google-fonts/inter-tight';

/**
 * The phone: Inter Tight's three weights (src/theme.ts, `type`) from the full
 * TTFs, loaded before the app draws. The web has its own (fonts.ts).
 */
export function useAppFonts(): [loaded: boolean, error: Error | null] {
  return useFonts({ InterTight_400Regular, InterTight_500Medium, InterTight_600SemiBold });
}
