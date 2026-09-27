import { useEffect, useRef } from 'react';
import { View, Text, Animated } from 'react-native';
import { type as T } from '../theme';
import { useReducedMotion } from '../a11y';

/**
 * A character saying one line — how Nu and Ra introduce themselves on the
 * welcome screen, the way Duolingo's owl does: the two modes explained by the
 * characters who ARE the modes, instead of by an explanation screen.
 *
 * Each speaks in its own mode's colours: Nu in indigo on the water, Ra in
 * cream on the light. Positioned in the coordinates of the clip it sits over,
 * with the tail pointing at `tailX` (the character's head).
 */
const MAX_W = 176;
const TAIL = 9;

export function SpeechBubble({ text, tone, tailX, tipY, clipW, delay = 0 }: {
  text: string;
  tone: 'nu' | 'ra';
  /** where the tail points, in clip coordinates */
  tailX: number; tipY: number;
  clipW: number;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const v = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) { v.setValue(1); return; }
    const a = Animated.sequence([
      Animated.delay(delay),
      Animated.spring(v, { toValue: 1, friction: 6, tension: 110, useNativeDriver: true }),
    ]);
    a.start();
    return () => a.stop();
  }, [v, delay, reduce]);

  // two bubbles share the clip, so each gets at most half of it; kept on the
  // clip, with the tail still pointing at the head
  const WIDTH = Math.min(MAX_W, clipW / 2 - 6);
  const left = Math.max(0, Math.min(clipW - WIDTH, tailX - WIDTH / 2));
  const bg = tone === 'nu' ? '#4F5FE0' : '#FFF3EA';
  const fg = tone === 'nu' ? '#F7F8FF' : '#171313';

  return (
    <Animated.View pointerEvents="none" accessibilityRole="text" style={{
      position: 'absolute', left, top: 0, width: WIDTH,
      // the tip sits at tipY; the bubble grows upward from there
      transform: [
        { translateY: tipY },
        { translateY: -TAIL },
        { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
        { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
      ],
      opacity: v,
    }}>
      {/* anchored by its bottom edge: an absolutely placed wrapper of zero
          height at the tip, with the bubble hanging above it */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, width: WIDTH }}>
        <View style={{
          backgroundColor: bg, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 9,
        }}>
          <Text style={{ color: fg, fontSize: 13.5, lineHeight: 18, fontFamily: T.brand }}>{text}</Text>
        </View>
        <View style={{
          position: 'absolute', bottom: -TAIL + 2, left: tailX - left - TAIL,
          width: TAIL * 2, height: TAIL * 2, backgroundColor: bg,
          transform: [{ rotate: '45deg' }], borderRadius: 3,
        }} />
      </View>
    </Animated.View>
  );
}
