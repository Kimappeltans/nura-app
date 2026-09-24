import { useEffect, useMemo, useRef } from 'react';
import { View, Text, Pressable, Animated, Easing, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { type as T, radius } from '../theme';
import { Primary, Character, IconDoc, IconCalendar, IconClock, IconHeart, IconSearch } from '../ui';

/**
 * The one screen this app never had: an explanation of its own metaphor.
 *
 * Nu and Ra are used everywhere the moment onboarding ends — Home is Nu,
 * Focus is Ra, the mode switch is the whole navigation model — but nothing
 * before this ever said so in plain words. This screen exists to say it
 * once, visually, before the names start doing real work.
 *
 * These colours are a one-off: a literal sunrise-over-water illustration
 * that doesn't recur anywhere else in the app, so they live here rather
 * than in theme.ts. Everything that DOES recur (the CTA, the type, the
 * mascots) still comes from the shared system.
 */

const SKY: readonly [string, string, ...string[]] = [
  '#1A1B47', '#33265E', '#7A3F63', '#C25A4E', '#FF8A5C',
  '#3A4CA8', '#22307C', '#141C46', '#080D24',
];
const SKY_STOPS = [0, 0.21, 0.36, 0.44, 0.5, 0.61, 0.71, 0.86, 1] as const;

/** A falling "sinker" — one of the small things that lands in the water
 *  before Ra ever lifts it back out. Purely decorative, so it's built from
 *  scratch here rather than asking the icon set to carry a new meaning. */
function Sinker(
  { icon, left, delay, size }: { icon: React.ReactNode; left: number; delay: number; size: number },
) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(v, { toValue: 1, duration: 3400, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
      Animated.delay(600),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v, delay]);

  return (
    <Animated.View style={{
      position: 'absolute', left: `${left}%`, top: -18,
      opacity: v.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 0.85, 0.55, 0] }),
      transform: [
        { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, 210] }) },
        { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '26deg'] }) },
      ],
    }}>
      <View style={{
        width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
      }}>{icon}</View>
    </Animated.View>
  );
}

/** Two horizon waves, parallax by speed — a static illustration would read
 *  as a photo of water; even a slow, looping drift reads as water. */
function Waves({ width }: { width: number }) {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const run = (v: Animated.Value, ms: number) => Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: -width, duration: ms, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    const l1 = run(a, 9000), l2 = run(b, 15000);
    l1.start(); l2.start();
    return () => { l1.stop(); l2.stop(); };
  }, [a, b, width]);

  const wavePath =
    `M0 30 Q ${width * 0.125} 12 ${width * 0.25} 30 T ${width * 0.5} 30 T ${width * 0.75} 30 T ${width} 30 V 60 H 0 Z`;

  return (
    <View style={{ height: 56, overflow: 'hidden' }} pointerEvents="none">
      <Animated.View style={{ flexDirection: 'row', transform: [{ translateX: a }] }}>
        {[0, 1].map(i => (
          <Svg key={i} width={width} height={56}>
            <Path d={wavePath} fill="rgba(34,48,124,0.85)" />
          </Svg>
        ))}
      </Animated.View>
      <Animated.View style={{ flexDirection: 'row', marginTop: -40, transform: [{ translateX: b }] }}>
        {[0, 1].map(i => (
          <Svg key={i} width={width} height={56}>
            <Path d={wavePath} fill="#1B2560" />
          </Svg>
        ))}
      </Animated.View>
    </View>
  );
}

export default function HowItWorks({ onNext }: { onNext: () => void }) {
  const W = Dimensions.get('window').width;
  const sun = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(sun, { toValue: 1, duration: 1400, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [sun]);

  const sinkers = useMemo(() => ([
    { icon: <IconDoc size={16} color="#F2F4FB" />, left: 10, delay: 0 },
    { icon: <IconCalendar size={16} color="#F2F4FB" />, left: 32, delay: 700 },
    { icon: <IconClock size={16} color="#F2F4FB" />, left: 58, delay: 1500 },
    { icon: <IconHeart size={16} color="#F2F4FB" />, left: 76, delay: 400 },
    { icon: <IconSearch size={15} color="#F2F4FB" />, left: 92, delay: 1100 },
  ]), []);

  return (
    <View style={{ flex: 1, backgroundColor: '#080D24' }}>
      <LinearGradient colors={SKY} locations={SKY_STOPS} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', inset: 0 }} />

      {/* The sun, rising once on arrival, resting where sky meets sea. */}
      <Animated.View pointerEvents="none" style={{
        position: 'absolute', left: 24, top: 176, width: 132, height: 132, borderRadius: 66,
        opacity: sun,
        transform: [{ translateY: sun.interpolate({ inputRange: [0, 1], outputRange: [90, 0] }) }],
      }}>
        <LinearGradient colors={['#FFF0D6', '#FFB067', '#FF6B35', 'transparent']} locations={[0, 0.35, 0.7, 1]}
          style={{ width: '100%', height: '100%', borderRadius: 66 }} />
      </Animated.View>

      {/* Falling sinkers — the things that go INTO the water, before Ra ever lifts one back out. */}
      {sinkers.map((s, i) => <Sinker key={i} {...s} size={30} />)}

      <View style={{ flex: 1, paddingTop: 64, paddingHorizontal: 26 }}>
        <Text style={{ color: '#FFCBA8', fontSize: 11, letterSpacing: 2.2, fontFamily: T.brand }}>HOW NURA WORKS</Text>
        <Text style={{
          color: '#FFF3EA', fontSize: 30, lineHeight: 36, fontFamily: T.display,
          letterSpacing: -0.7, marginTop: 8, maxWidth: 280,
        }}>
          Everything sinks.{'\n'}One thing rises.
        </Text>
      </View>

      {/* Where sky meets sea: the two mascots, labelled, and the water itself. */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
        <View style={{ paddingHorizontal: 26, paddingBottom: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Character name="nu-idle" size={100} motion="bob" />
              <Text style={{ color: '#AEB6D4', fontSize: 10.5, letterSpacing: 1.6, fontFamily: T.brand }}>NU · THE WATER</Text>
            </View>
            <View style={{ alignItems: 'center', gap: 6, marginBottom: 18 }}>
              <Character name="ra-wave" size={118} motion="bob" />
              <Text style={{ color: '#FFCBA8', fontSize: 10.5, letterSpacing: 1.6, fontFamily: T.brand }}>RA · THE LIGHT</Text>
            </View>
          </View>
          <Text style={{ color: '#C5CBE9', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 4 }}>
            Nu holds everything you're carrying. Ra lifts up the one thing to do now.
          </Text>
        </View>

        <Waves width={W} />

        <LinearGradient colors={['transparent', 'rgba(8,13,36,0.94)']} locations={[0, 0.5]}
          style={{ paddingHorizontal: 22, paddingTop: 18, paddingBottom: 30 }}>
          <Primary label="Got it" tone="ra" onPress={onNext} />
        </LinearGradient>
      </View>
    </View>
  );
}
