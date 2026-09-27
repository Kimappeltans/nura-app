import { inWorld } from '../src/world';
import { readable } from '../src/components/Desk';
import { goBack } from '../src/nav';
import Connect from '../src/screens/Connect';

/**
 * The Connect screen (calendar and reminders), reachable from Settings and
 * You. ← Back is the one way out, top left; the button at the bottom says Done.
 */
function Integrations() {
  return <Connect onDone={() => goBack()} onBack={() => goBack()} />;
}

export default inWorld('utility', readable(Integrations));
