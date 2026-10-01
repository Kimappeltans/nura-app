/**
 * The opening's biggest images: the stone (the logo) and the four story poses
 * it shows at its largest. The phone gets the full size files here; the web
 * build picks up art.web.ts instead, with smaller copies sized for how large
 * the web shows them. Both files export the same names.
 */
export const STONE = require('../assets/brand/nura-logo-tight.webp');

export const STORY = {
  'nu-surface': require('../assets/story/nu-surface.webp'),
  'nu-hello': require('../assets/story/nu-hello.webp'),
  'ra-sun': require('../assets/story/ra-sun.webp'),
  'ra-hello': require('../assets/story/ra-hello.webp'),
};
