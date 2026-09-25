import { router } from 'expo-router';
import { Benben } from '../src/components/Benben';

/** The story on its own — Settings → "Watch the opening again". Nothing
 *  else is reset; it ends on Done, back where you were (or home, when it
 *  was opened straight from a link). */
export default function Opening() {
  return <Benben replay onDone={() => (router.canGoBack() ? router.back() : router.replace('/'))} />;
}
