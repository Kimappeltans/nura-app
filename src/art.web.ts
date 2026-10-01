/**
 * The web's copies of art.ts: the same pictures, scaled from the full size
 * files (assets/web). The web shows the story poses at most 170 px and the
 * stone at most 150 px wide, so 520 and 490 px wide stay sharp at 3x.
 * The phone keeps the full size files, which a 3x screen needs.
 */
export const STONE = require('../assets/web/brand/nura-logo-tight.webp');

export const STORY = {
  'nu-surface': require('../assets/web/story/nu-surface.webp'),
  'nu-hello': require('../assets/web/story/nu-hello.webp'),
  'ra-sun': require('../assets/web/story/ra-sun.webp'),
  'ra-hello': require('../assets/web/story/ra-hello.webp'),
};
