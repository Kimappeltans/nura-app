import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, Easing, Dimensions, AccessibilityInfo } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { type as T, radius } from '../theme';
import { Primary, Character } from '../ui';
import type { Task } from '../db';

/**
 * "Everything sinks. One thing rises." — shown, with your own tasks.
 *
 * This used to be a screen that EXPLAINED the metaphor before you had written
 * anything down (HowItWorks). Now it happens: the things you just put down
 * fall into the water one by one, the sun comes up, and Ra lifts one of them
 * back out — the one the engine would pick — with the reason. The next tap
 * starts it. That's the whole app, lived once, in about five seconds.
 *
 * The sunrise colours are a one-off illustration that doesn't recur anywhere
 * else, so they live here rather than in theme.ts.
 */
const SKY: readonly [string, string, ...string[]] = [
  '#1A1B47', '#33265E', '#7A3F63', '#C25A4E', '#FF8A5C',
  '#3A4CA8', '#22307C', '#141C46', '#080D24',
];
const SKY_STOPS = [0, 0.21, 0.36, 0.44, 0.5, 0.61, 0.71, 0.86, 1] as const;
const LANES = [10, 46, 24, 58, 6, 38];            // % from the left, one per falling task
const SINK_MS = 1700, STAGGER_MS = 320;

/** One of your tasks, falling into the water. Plays once. */
function Sinker({ title, left, delay, depth, instant }:
  { title: string; left: number; delay: number; depth: number; instant: boolean }) {
  const v = useRef(new Animated.Value(instant ? 1 : 0)).current;
  useEffect(() => {
    if (instant) return;
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(v, { toValue: 1, duration: SINK_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [v, delay, instant]);

  return (
    <Animated.View pointerEvents="none" style={{
      position: 'absolute', left: `${left}%`, top: 150, maxWidth: '52%',
      opacity: v.interpolate({ inputRange: [0, 0.1, 0.75, 1], outputRange: [0, 0.95, 0.6, 0] }),
      transform: [
        { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, depth] }) },
        { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['-2deg', '14deg'] }) },
      ],
    }}>
      <View style={{
        paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill,
        backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
      }}>
        <Text numberOfLines={1} style={{ color: '#F2F4FB', fontSize: 13.5 }}>{title}</Text>
      </View>
    </Animated.View>
  );
}

/** Two horizon waves, parallax by speed — a static illustration would read as
 *  a photo of water; a slow, looping drift reads as water. */
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
  const wave = `M0 30 Q ${width * 0.125} 12 ${width * 0.25} 30 T ${width * 0.5} 30 T ${width * 0.75} 30 T ${width} 30 V 60 H 0 Z`;
  return (
    <View style={{ height: 56, overflow: 'hidden' }} pointerEvents="none">
      <Animated.View style={{ flexDirection: 'row', transform: [{ translateX: a }] }}>
        {[0, 1].map(i => <Svg key={i} width={width} height={56}><Path d={wave} fill="rgba(34,48,124,0.85)" /></Svg>)}
      </Animated.View>
      <Animated.View style={{ flexDirection: 'row', marginTop: -40, transform: [{ translateX: b }] }}>
        {[0, 1].map(i => <Svg key={i} width={width} height={56}><Path d={wave} fill="#1B2560" /></Svg>)}
      </Animated.View>
    </View>
  );
}

export default function OneRises({ tasks, pick, why, onStart, onEverything }: {
  tasks: Task[];
  pick: Task;
  why: string | null;
  onStart: () => void;
  onEverything: () => void;
}) {
  const { width: W, height: H } = Dimensions.get('window');
  const [instant, setInstant] = useState(false);
  const sun = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(0)).current;
  const sinking = tasks.slice(0, LANES.length);
  const riseAt = STAGGER_MS * Math.max(0, sinking.length - 1) + SINK_MS - 200;

  useEffect(() => {
    let dead = false;
    AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      if (dead) return;
      if (reduce) { setInstant(true); sun.setValue(1); rise.setValue(1); return; }
      Animated.sequence([
        Animated.delay(riseAt),
        Animated.parallel([
          Animated.timing(sun, { toValue: 1, duration: 1300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.sequence([
            Animated.delay(350),
            Animated.spring(rise, { toValue: 1, friction: 7, tension: 45, useNativeDriver: true }),
          ]),
        ]),
      ]).start();
    });
    return () => { dead = true; };
  }, [sun, rise, riseAt]);

  const depth = H * 0.5;

  return (
    <View style={{ flex: 1, backgroundColor: '#080D24' }}>
      <LinearGradient colors={SKY} locations={SKY_STOPS} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', inset: 0 }} />

      {/* the sun, rising once, where sky meets sea */}
      <Animated.View pointerEvents="none" style={{
        position: 'absolute', left: W / 2 - 70, top: H * 0.3, width: 140, height: 140, borderRadius: 70,
        opacity: sun,
        transform: [{ translateY: sun.interpolate({ inputRange: [0, 1], outputRange: [110, 0] }) }],
      }}>
        <LinearGradient colors={['#FFF0D6', '#FFB067', '#FF6B35', 'transparent']} locations={[0, 0.35, 0.7, 1]}
          style={{ width: '100%', height: '100%', borderRadius: 70 }} />
      </Animated.View>

      {/* everything you just put down, sinking */}
      {sinking.map((task, i) => (
        <Sinker key={task.id} title={task.title} left={LANES[i]} depth={depth}
          delay={i * STAGGER_MS} instant={instant} />
      ))}

      <View style={{ paddingTop: 64, paddingHorizontal: 26 }}>
        <Text style={{ color: '#FFCBA8', fontSize: 11, letterSpacing: 2.2, fontFamily: T.brand }}>3 OF 3</Text>
        <Text style={{
          color: '#FFF3EA', fontSize: 30, lineHeight: 36, fontFamily: T.display,
          letterSpacing: -0.7, marginTop: 8,
        }}>Everything sinks.{'\n'}One thing rises.</Text>
      </View>

      {/* the one, lifted back out of the water */}
      <Animated.View style={{
        position: 'absolute', left: 22, right: 22, top: H * 0.36,
        opacity: rise,
        transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [H * 0.3, 0] }) }],
      }}>
        <View style={{
          borderRadius: radius.xl, padding: 20, gap: 8,
          backgroundColor: 'rgba(255,243,234,0.96)',
          shadowColor: '#FF6B35', shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 10 },
        }}>
          <Text style={{ color: '#C2410C', fontSize: 11, letterSpacing: 2, fontFamily: T.brand }}>START HERE</Text>
          <Text style={{ color: '#171313', fontSize: 26, lineHeight: 31, fontFamily: T.display, letterSpacing: -0.6 }}>
            {pick.title}
          </Text>
          {!!why && <Text style={{ color: '#4A4340', fontSize: 14 }}>Why this one: {why}</Text>}
        </View>
      </Animated.View>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 26 }}>
          <Character name="nu-idle" size={86} motion="bob" />
          <Character name="ra-wave" size={100} motion="bob" style={{ marginBottom: 10 }} />
        </View>
        <Waves width={W} />
        <LinearGradient colors={['transparent', 'rgba(8,13,36,0.94)']} locations={[0, 0.45]}
          style={{ paddingHorizontal: 22, paddingTop: 16, paddingBottom: 34, gap: 14 }}>
          <Primary label="Start · 5 minutes" tone="ra" onPress={onStart} />
          <Pressable onPress={onEverything} hitSlop={10}>
            <Text style={{ color: '#C5CBE9', fontSize: 14, textAlign: 'center' }}>Show me everything instead</Text>
          </Pressable>
        </LinearGradient>
      </View>
    </View>
  );
}
