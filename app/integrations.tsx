import { inWorld } from '../src/world';
import { goBack } from '../src/nav';
import Connect from '../src/screens/Connect';

/**
 * The Connect screen (calendar and reminders), reachable from Settings and
 * You. ← Back is the one way out, top left; the button at the bottom says Done.
 */
function Integrations() {
  return <Connect onDone={() => goBack()} onBack={() => goBack()} />;
}

export default inWorld('utility', Integrations);
