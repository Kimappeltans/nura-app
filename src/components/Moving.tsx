import { useEffect, useState } from 'react';
import { AccessibilityInfo, type ImageStyle, type StyleProp } from 'react-native';
import { Image } from 'expo-image';

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
  const [still, setStill] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(r => { if (alive) setStill(r); }, () => { if (alive) setStill(false); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setStill);
    return () => { alive = false; sub.remove(); };
  }, []);
  // until we know, nothing — so the clip never starts on its last pose
  if (still === null) return null;
  const c = CLIPS[name];
  return <Image source={still ? c.still : c.clip} style={style} contentFit="contain" autoplay={!still} accessibilityIgnoresInvertColors />;
}
