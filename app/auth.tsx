import { router } from 'expo-router';
import Auth from '../src/screens/Auth';

/** Sign-in, reachable from Settings as well as from the welcome screen. */
export default function AuthRoute() {
  return <Auth onClose={() => router.back()} />;
}
