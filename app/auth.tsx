import { inWorld } from '../src/world';
import { goBack } from '../src/nav';
import { router } from 'expo-router';
import Auth from '../src/screens/Auth';

/** Sign-in, reachable from Settings as well as from the welcome screen. */
function AuthRoute() {
  return <Auth onClose={() => goBack()} />;
}

export default inWorld('utility', AuthRoute);
