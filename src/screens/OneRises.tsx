import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, Easing, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { type as T, radius } from '../theme';
import { Primary, Character } from '../ui';
import type { Task } from '../db';
import { StepBar } from '../components/OnbFrame';
import { screenSize, useDesk, STAGE } from '../screen';
import { useReducedMotion, announce, decorative } from '../a11y';

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
    if (instant) { v.stopAnimation(); v.setValue(1); return; }
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
 *  a photo of water; a slow, looping drift reads as water. With Reduce Motion
 *  on they hold still. */
function Waves({ width }: { width: number }) {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  const still = useReducedMotion();
  useEffect(() => {
    if (still) { a.setValue(0); b.setValue(0); return; }
    const run = (v: Animated.Value, ms: number) => Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: -width, duration: ms, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    const l1 = run(a, 9000), l2 = run(b, 15000);
    l1.start(); l2.start();
    return () => { l1.stop(); l2.stop(); };
  }, [a, b, width, still]);
  const wave = `M0 30 Q ${width * 0.125} 12 ${width * 0.25} 30 T ${width * 0.5} 30 T ${width * 0.75} 30 T ${width} 30 V 60 H 0 Z`;
  return (
    <View style={{ height: 56, overflow: 'hidden' }} pointerEvents="none" {...decorative}>
      <Animated.View style={{ flexDirection: 'row', transform: [{ translateX: a }] }}>
        {[0, 1].map(i => <Svg key={i} width={width} height={56}><Path d={wave} fill="rgba(34,48,124,0.85)" /></Svg>)}
      </Animated.View>
      <Animated.View style={{ flexDirection: 'row', marginTop: -40, transform: [{ translateX: b }] }}>
        {[0, 1].map(i => <Svg key={i} width={width} height={56}><Path d={wave} fill="#1B2560" /></Svg>)}
      </Animated.View>
    </View>
  );
}

export default function OneRises({ tasks, pick, onStart, onEverything }: {
  tasks: Task[];
  /** the suggestion that rises first — you can pick a different one */
  pick: Task;
  onStart: (task: Task) => void;
  onEverything: () => void;
}) {
  const [chosen, setChosen] = useState<Task>(pick);
  const others = tasks.filter(x => x.id !== chosen.id).slice(0, 3);
  const { width: W, height: H } = screenSize();
  // a wide web window: the sky and the sea the whole width, the story on a centred stage
  const winW = useWindowDimensions().width;
  const desk = useDesk();
  const full = desk ? winW : W;
  const stage = desk ? { width: '100%', maxWidth: STAGE, alignSelf: 'center' } as const : null;
  const reduce = useReducedMotion();
  const [instant, setInstant] = useState(reduce);
  const sun = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const rise = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const sinking = tasks.slice(0, LANES.length);
  const riseAt = STAGGER_MS * Math.max(0, sinking.length - 1) + SINK_MS - 200;

  useEffect(() => {
    // Reduce Motion (even switched on mid-way): the end of the story, still
    if (reduce) { setInstant(true); sun.stopAnimation(); rise.stopAnimation(); sun.setValue(1); rise.setValue(1); return; }
    if (instant) return;
    const play = Animated.sequence([
      Animated.delay(riseAt),
      Animated.parallel([
        Animated.timing(sun, { toValue: 1, duration: 1300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(350),
          Animated.spring(rise, { toValue: 1, friction: 7, tension: 45, useNativeDriver: true }),
        ]),
      ]),
    ]);
    play.start();
    return () => play.stop();
  }, [sun, rise, riseAt, reduce]);

  const choose = (o: Task) => { setChosen(o); announce(`Your pick: ${o.title}`); };

  const insets = useSafeAreaInsets();
  // one size for both, a little smaller on short phones
  const figure = Math.round(Math.min(116, H * 0.13));
  const depth = H * 0.5;

  return (
    <View style={{ flex: 1, backgroundColor: '#080D24' }}>
      <LinearGradient colors={SKY} locations={SKY_STOPS} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', inset: 0 }} />

      {/* everything you just put down, sinking */}
      <View pointerEvents="none" {...decorative} style={{ position: 'absolute', top: 0, bottom: 0, left: (full - W) / 2, width: W }}>
        {sinking.map((task, i) => (
          <Sinker key={task.id} title={task.title} left={LANES[i]} depth={depth}
            delay={i * STAGGER_MS} instant={instant} />
        ))}
      </View>

      <View style={[{ paddingTop: insets.top + 12, paddingHorizontal: 26 }, stage]}>
        <View style={{ flexDirection: 'row' }}><StepBar step={4} light /></View>
        <Text accessibilityRole="header" style={{
          color: '#FFF3EA', fontSize: 30, lineHeight: 36, fontFamily: T.display,
          letterSpacing: -0.7, marginTop: 22,
        }}>Everything sinks.{'\n'}One thing rises.</Text>
      </View>

      {/* The card and the choices sit in the flow, between the heading and
          the figures. They used to be placed at fixed fractions of the
          screen height, so a long title pushed the choices under Nu and Ra. */}
      <View style={{ flex: 1, paddingTop: 76 }}>
        {/* the sun, rising once, just above the card */}
        <Animated.View pointerEvents="none" {...decorative} style={{
          position: 'absolute', left: full / 2 - 70, top: 0, width: 140, height: 140, borderRadius: 70,
          opacity: sun,
          transform: [{ translateY: sun.interpolate({ inputRange: [0, 1], outputRange: [110, 0] }) }],
        }}>
          <LinearGradient colors={['#FFF0D6', '#FFB067', '#FF6B35', 'transparent']} locations={[0, 0.35, 0.7, 1]}
            style={{ width: '100%', height: '100%', borderRadius: 70 }} />
        </Animated.View>

        {/* the one, lifted back out of the water */}
        <Animated.View style={[stage, {
          opacity: rise,
          transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [H * 0.3, 0] }) }],
        }]}>
          <View style={{
            marginHorizontal: 22, borderRadius: radius.xl, padding: 20, gap: 8,
            backgroundColor: 'rgba(255,243,234,0.96)',
            shadowColor: '#FF6B35', shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 10 },
          }}>
            <Text style={{ color: '#C2410C', fontSize: 11, letterSpacing: 2, fontFamily: T.brand }}>
              {chosen.id === pick.id ? 'START HERE?' : 'YOUR PICK'}
            </Text>
            <Text numberOfLines={3} style={{ color: '#171313', fontSize: 26, lineHeight: 31, fontFamily: T.display, letterSpacing: -0.6 }}>
              {chosen.title}
            </Text>
          </View>

          {/* it's a suggestion — any of the others can rise instead; one
              row that scrolls sideways, so it never grows into the figures */}
          {!!others.length && (
            <View style={{ marginTop: 14, gap: 8 }}>
              {/* on a navy veil, like the chips: the sky behind this row can be
                  its brightest coral, where cream text alone fell to 1.9:1 */}
              <View style={{
                alignSelf: 'flex-start', marginHorizontal: 22, paddingHorizontal: 10, paddingVertical: 3,
                borderRadius: radius.pill, backgroundColor: 'rgba(8,13,36,0.45)',
              }}>
                <Text style={{ color: '#FFE3CE', fontSize: 13.5 }}>Or pick another:</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingHorizontal: 22 }}>
                {others.map(o => (
                  <Pressable key={o.id} onPress={() => choose(o)}
                    accessibilityRole="button" accessibilityLabel={o.title}
                    style={{
                    minHeight: 44, justifyContent: 'center',
                    paddingHorizontal: 13, paddingVertical: 8, borderRadius: radius.pill,
                    backgroundColor: 'rgba(8,13,36,0.45)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
                  }}>
                    <Text numberOfLines={1} style={{ color: '#FFF3EA', fontSize: 13.5, maxWidth: 220 }}>{o.title}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </Animated.View>
      </View>

      <View>
        <View style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 26 }, stage]}>
          <Character name="nu-idle" size={figure} motion="bob" />
          <Character name="ra-wave" size={figure} motion="bob" />
        </View>
        <Waves width={full} />
        <LinearGradient colors={['transparent', 'rgba(8,13,36,0.94)']} locations={[0, 0.45]}
          style={{ paddingHorizontal: 22, paddingTop: 16, paddingBottom: insets.bottom + 12, gap: 14 }}>
          <View style={[{ gap: 14 }, stage]}>
            <Primary label="Start" tone="ra" onPress={() => onStart(chosen)} />
            <Pressable onPress={onEverything} hitSlop={10} accessibilityRole="button">
              <Text style={{ color: '#C5CBE9', fontSize: 14, textAlign: 'center' }}>Show me everything instead</Text>
            </Pressable>
          </View>
        </LinearGradient>
      </View>
    </View>
  );
}
