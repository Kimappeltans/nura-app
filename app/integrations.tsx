import { router } from 'expo-router';
import Connect from '../src/screens/Connect';

/**
 * The same Connect screen, reachable from Settings.
 *
 * Every one of those services is something people connect weeks in, not on day
 * one — and until now the ONLY time it was ever shown was during onboarding,
 * which meant tapping "Skip for now" put them permanently out of reach.
 */
export default function Integrations() {
  return <Connect onDone={() => router.back()} />;
}
