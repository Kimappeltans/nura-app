import { useEffect, useRef } from 'react';
import { View, Image, Text, Animated, Easing, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../store';
import { type as T } from '../theme';
import { Mica } from '../ui';
import { useReducedMotion, decorative } from '../a11y';

const mark = require('../../assets/brand/nura-logo-tight.webp');

/**
 * Shown before we know anything — fonts still loading, or the single query
 * that decides "intro or app" hasn't resolved. Usually one frame on native;
 * on web it can be a beat longer while the bundle parses.
 *
 * It used to show the logo, BOTH mascots at 60px, and three bouncing dots —
 * three competing focal points and a spinner, in a screen that is on for under
 * a second. That reads as a broken page, not a fast one. One mark, breathing.
 * Nothing else — except `note`, for the one wait that isn't a beat long: on
 * web, Nura open in another tab (with `action`: Use it here).
 */
export default function Loading({ note, action }: { note?: string; action?: { label: string; onPress: () => void } }) {
  const t = useTheme();
  const fade = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const still = useReducedMotion();

  useEffect(() => {
    // Reduce Motion: the mark, there and still
    if (still) { fade.setValue(1); pulse.setValue(0.5); return; }
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [fade, pulse, still]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Mica />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        accessible accessibilityRole="progressbar" aria-busy
        accessibilityLabel={note ? `Loading. ${note}` : 'Loading'}>
        <Animated.View {...decorative} style={{
          opacity: fade,
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.03] }) }],
        }}>
          <Image source={mark} style={{ width: 92, height: 104 }} resizeMode="contain" />
        </Animated.View>
        {note ? (
          <Text style={{ color: t.ink2, fontSize: 15, lineHeight: 22, fontFamily: T.displayLight, textAlign: 'center', marginTop: 28, paddingHorizontal: 40 }}>
            {note}
          </Text>
        ) : null}
        {/* the one way on from a wait, when there is one (Use it here) */}
        {action ? (
          <Pressable onPress={action.onPress} accessibilityRole="button"
            style={({ pressed }) => ({
              marginTop: 22, height: 48, paddingHorizontal: 28, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: t.stroke, backgroundColor: pressed ? t.subtle : t.card,
            })}>
            <Text style={{ color: t.ink, fontSize: 15, fontFamily: T.display }}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
