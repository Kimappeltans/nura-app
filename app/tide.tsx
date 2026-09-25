import { inWorld } from '../src/world';
import Tide from '../src/screens/Tide';

/** Your day, opened on its own (a link, a notification) — the same screen as
 *  the Your day tab, with a way back instead of the tab's top bar. */
function TideRoute() {
  return <Tide />;
}

export default inWorld('mixed', TideRoute);
