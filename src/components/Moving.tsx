import { type ImageStyle, type StyleProp } from 'react-native';
import { Image } from 'expo-image';
import { useReducedMotion, decorative } from '../a11y';

/**
 * THE MOVING CHARACTERS (guidelines/components/overview.md). A real clip,
 * cut out of its background, that plays once when its moment arrives and
 * then rests on its last pose — never a loop, and one per screen. With
 * Reduce Motion on, only the last pose.
 */
const CLIPS = {
  // Done: Ra holds up a tiny pebble — the thing you just finished
  'ra-pebble': {
    clip: require('../../assets/story/ra-pebble.webp'),
    still: require('../../assets/story/ra-pebble-still.webp'),
  },
  // New habit: Ra's rays pulse, and he settles on a smile
  'ra-rays': {
    clip: require('../../assets/story/ra-rays.webp'),
    still: require('../../assets/story/ra-rays-still.webp'),
  },
  // Plan a project: Nu breathes, turns, and settles on a smile, listening
  'nu-breathe': {
    clip: require('../../assets/story/nu-breathe.webp'),
    still: require('../../assets/story/nu-breathe-still.webp'),
  },
} as const;

export type ClipName = keyof typeof CLIPS;

export function Moving({ name, style }: { name: ClipName; style: StyleProp<ImageStyle> }) {
  // known before the first frame on the web and early on a phone
  const still = useReducedMotion();
  const c = CLIPS[name];
  return <Image source={still ? c.still : c.clip} style={style} contentFit="contain" autoplay={!still}
    accessibilityIgnoresInvertColors {...decorative} />;
}
