import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Image, Animated, Easing, AccessibilityInfo, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path } from 'react-native-svg';
import { DotSun } from './Handoff';
import { type as T, radius } from '../theme';
import { Primary, poseImage } from '../ui';
import { logEvent } from '../db';

const stone = require('../../assets/brand/nura-logo-tight.webp');
const wordmark = require('../../assets/brand/wordmark-tight.webp');
// the stone's own marks, lit: its waves (Nu's) and its sun (Ra's) — drawn
// along the engraving in the logo (nura-logo-tight), the same size, so they sit in it
const glowWaves = require('../../assets/story/benben-waves.webp');
const glowSun = require('../../assets/story/benben-sun.webp');
const STONE_ASPECT = 944 / 833;           // the tight crop's height / width

/** The night and the dawn — a one-off illustration, like OneRises' sunrise,
 *  so the colours live here rather than in theme.ts. */
const NIGHT = ['#070B22', '#0B1029', '#141C46'] as const;   // [1] is the ground
/**
 * The story. The first words anyone reads in Nura, so they tell what it's
 * for before any name means anything — and each name arrives with the thing
 * it names: Nu with the water, the Benben with the stone, Ra with the sun.
 * Then the story turns to you. The tap on Begin is what makes the stone rise.
 */
const BEATS = [
  'Before there was anything, the old Egyptians said, there was only water.',
  'Dark, still and endless. Everything that would ever be was already in it, all mixed together.',
  'They called this water Nu. Nu held everything, but nothing in it could begin.',
  'Then one small mound rose out of the water: the Benben, the first place to stand.',
  'The sun rose for the very first time, and its first light, Ra, touched the Benben.',
  'Where the light landed, the world could start.',
  'Your mind can feel like that water: plans, worries and half-finished things, all at once.',
  'Nura holds all of it, like Nu. And like Ra, it lights up one thing you can start now.',
  'Nu and Ra. Together: Nura.',
] as const;
// what happens on which beat
const NU_AT = 2, BEGIN_AT = 2, STONE_AT = 3, SUN_AT = 4, HELLO_AT = 7, NAME_AT = 8;
const CHAR_MS = 30, BEAT_PAUSE_MS = 950;

/** Edge-to-edge water: two waves drifting at different speeds. The front
 *  one IS the sea — its shape runs from the surface to the bottom of the
 *  screen with the depth gradient inside it — so there's no seam between a
 *  wave and a body of water. It's drawn over the stone and Nu, so what's
 *  under the surface shows dimly. */
function Water({ width, height, still }: { width: number; height: number; still: boolean }) {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (still) return;
    const loop = (v: Animated.Value, ms: number, to: number) => Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: to, duration: ms, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    const l1 = loop(a, 7000, -width), l2 = loop(b, 11000, width);
    l1.start(); l2.start();
    return () => { l1.stop(); l2.stop(); };
  }, [a, b, width, still]);

  const line = (amp: number, y: number) =>
    `M0 ${y} Q ${width * 0.125} ${y - amp} ${width * 0.25} ${y} T ${width * 0.5} ${y} T ${width * 0.75} ${y} T ${width} ${y}`;
  const strip = (v: Animated.Value, amp: number, y: number, floor: number, fill: string, stroke: string, dir: 1 | -1, id: string) => (
    <Animated.View style={{
      position: 'absolute', top: 0, left: dir > 0 ? -width : 0, flexDirection: 'row', transform: [{ translateX: v }],
    }}>
      {[0, 1].map(i => (
        <Svg key={i} width={width} height={floor}>
          <Path d={`${line(amp, y)} V ${floor} H 0 Z`} fill={fill === 'deep' ? 'rgba(14,34,66,0.9)' : fill} />
          <Path d={line(amp, y)} stroke={stroke} strokeWidth={2.2} fill="none" />
        </Svg>
      ))}
    </Animated.View>
  );

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height, overflow: 'hidden' }}>
      {strip(b, 7, 22, 44, 'rgba(36,99,146,0.28)', 'rgba(125,205,241,0.45)', 1, 'wb')}
      {strip(a, 10, 30, height, 'deep', 'rgba(184,229,248,0.85)', -1, 'wa')}
    </View>
  );
}

/** One beat's words, typed. The untyped part is laid out but transparent,
 *  so nothing moves as it types; tapping finishes it. Screen readers get
 *  the whole sentence, not letters. */
function Typed({ text, still, onTyped }: { text: string; still: boolean; onTyped: () => void }) {
  const [n, setN] = useState(still ? text.length : 0);
  const done = useRef(onTyped);
  done.current = onTyped;
  useEffect(() => { if (still) setN(text.length); }, [still, text.length]);
  useEffect(() => {
    if (n >= text.length) { done.current(); return; }
    const id = setTimeout(() => setN(n + 1), CHAR_MS);
    return () => clearTimeout(id);
  }, [n, text]);
  return (
    <Pressable onPress={() => setN(text.length)} accessible accessibilityRole="text" accessibilityLabel={text}>
      <Text style={{
        color: '#F2F4FB', fontSize: 20, lineHeight: 27, fontFamily: T.brand, letterSpacing: -0.2, textAlign: 'center',
      }}>
        {text.slice(0, n)}<Text style={{ color: 'transparent' }}>{text.slice(n)}</Text>
      </Text>
    </Pressable>
  );
}

function Bubble({ text, tone, style }: { text: string; tone: 'nu' | 'ra'; style: object }) {
  return (
    <View style={[{
      position: 'absolute', maxWidth: 150, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 14,
      backgroundColor: tone === 'nu' ? '#EEF0FF' : '#FFF1E6',
      borderWidth: 1, borderColor: tone === 'nu' ? 'rgba(67,56,202,0.18)' : 'rgba(194,65,12,0.18)',
    }, style]}>
      <Text style={{ color: tone === 'nu' ? '#1A1D5A' : '#5A1E04', fontSize: 13.5, lineHeight: 18, fontFamily: T.brand }}>{text}</Text>
    </View>
  );
}

/**
 * The opening: where Nura's names come from, told over one scene
 * (SCOPE.md → decision 9).
 *
 *   - Dark water, moving; the stone's tip just shows.
 *   - The water is Nu: Nu comes up on the left. Begin appears.
 *   - Begin: the stone rises through the surface, and its waves light up.
 *   - The sun comes up and is Ra; its light lands on the stone, and the
 *     sun on the stone lights up too. Both marks keep a soft glow.
 *   - The turn to you: your mind as that water.
 *   - Nu and Ra say who they are; the name, Nura (Nu + Ra). Get started.
 *
 * The line before the current one stays, faded, so the thread can be
 * followed rather than each sentence vanishing.
 *
 * Skip, top right, goes straight to the last beat — Get started and Sign in
 * are there. Reduce Motion: no typing, no rising, the sea still; the beats
 * still come in order. `replay` (Settings) ends on Done instead.
 */
export function Benben({ onDone, onSignIn, replay }: { onDone: () => void; onSignIn?: () => void; replay?: boolean }) {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [still, setStill] = useState(false);
  const [beat, setBeat] = useState(0);
  const [typed, setTyped] = useState(false);       // this beat's words are all there
  const nuUp = useRef(new Animated.Value(0)).current;
  const stoneUp = useRef(new Animated.Value(0)).current;
  const dawn = useRef(new Animated.Value(0)).current;       // the sky and the sun
  const raIn = useRef(new Animated.Value(0)).current;       // Ra, a moment after the sun
  const hello = useRef(new Animated.Value(0)).current;
  const name = useRef(new Animated.Value(0)).current;
  const wavesGlow = useRef(new Animated.Value(0)).current;
  const sunGlow = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;     // the marks breathe once lit
  const shimmer = useRef(new Animated.Value(0)).current;   // the reflection, moving with the water
  const cta = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gone = useRef(false);

  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setStill).catch(() => {}); }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // what each beat does to the scene
  const to = (v: Animated.Value, ms: number, delay = 0) => {
    if (still) return v.setValue(1);
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  };
  const breathing = useRef<Animated.CompositeAnimation | null>(null);
  const shimmering = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => () => { breathing.current?.stop(); shimmering.current?.stop(); }, []);
  useEffect(() => {
    if (beat >= NU_AT) to(nuUp, 1400);
    // the waves light as the stone clears the water; the sun when Ra's light lands
    if (beat >= STONE_AT) { to(stoneUp, 1500); to(wavesGlow, 1100, 700); }
    // the sun rises behind the stone; Ra arrives on its light, and the
    // light lands on the stone's own sun
    if (beat >= SUN_AT) { to(dawn, 2600); to(raIn, 1200, 1400); to(sunGlow, 1200, 2200); }
    if (beat > SUN_AT && !still && !breathing.current) {
      breathing.current = Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 0.72, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]));
      breathing.current.start();
      shimmering.current = Animated.loop(Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]));
      shimmering.current.start();
    }
    if (beat >= HELLO_AT) to(hello, 900);
    if (beat >= NAME_AT) to(name, 900);
  }, [beat, still]);   // eslint-disable-line react-hooks/exhaustive-deps

  const last = beat === BEATS.length - 1;
  const waiting = typed && (beat === BEGIN_AT || last);
  useEffect(() => {
    if (waiting) Animated.timing(cta, { toValue: 1, duration: 380, useNativeDriver: true }).start();
    else cta.setValue(0);
  }, [waiting, cta]);

  const next = () => { setTyped(false); setBeat(b => Math.min(BEATS.length - 1, b + 1)); };
  const onTyped = () => {
    setTyped(true);
    // the story goes on by itself, except where it waits for Begin and at the end
    if (beat !== BEGIN_AT && !last) timer.current = setTimeout(next, still ? 1600 : BEAT_PAUSE_MS);
  };
  const skip = () => {
    if (timer.current) clearTimeout(timer.current);
    if (!replay) logEvent('onboarding', undefined, { step: 'story_skipped', beat });
    setTyped(false); setBeat(BEATS.length - 1);
  };
  const finish = () => { if (!gone.current) { gone.current = true; onDone(); } };

  /* ---- where things sit ---- */
  const waterY = H * 0.5;
  const stoneW = Math.min(W * 0.34, 150), stoneH = stoneW * STONE_ASPECT;
  const stoneLeft = (W - stoneW) / 2;
  const stoneDown = waterY - stoneH * 0.22;             // just the tip above water
  const stoneRisen = waterY - stoneH - 6;               // standing on the surface
  const charS = Math.min(W * 0.36, 160);                // the character images are square
  const nuLeft = W * 0.02, nuUnder = waterY + 12, nuSurfaced = waterY - charS * 0.8;
  const raLeft = W - charS - W * 0.03, raTop = Math.max(insets.top + 70, waterY - stoneH - charS * 1.05);
  const raCx = raLeft + charS / 2, raCy = raTop + charS * 0.5;
  // the sun: small and high in the sky, like a real one — it rises all the
  // way up out of the sea; a little left of centre, clear of Ra
  const sunD = Math.min(W * 0.28, 112);
  const sunTop = insets.top + 38;
  const sunCx = W * 0.4, sunCy = sunTop + sunD / 2;
  const nameW = Math.min(W * 0.48, 190);                 // the name, on the water
  // the circle on the stone, in the logo art: ~55% across, ~36% down
  const markX = stoneLeft + stoneW * 0.55, markY = stoneRisen + stoneH * 0.36;

  return (
    // clipped: the sun and its glow start below the screen, and on the web
    // anything hanging off the bottom would make the page scroll
    <View style={{ flex: 1, backgroundColor: NIGHT[1], overflow: 'hidden' }}>
      <StatusBar style={beat >= SUN_AT ? 'dark' : 'light'} />

      {/* dawn: the sunrise sky, down to an orange horizon */}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: waterY + 2, opacity: dawn }}>
        <View style={{ flex: 1, backgroundColor: '#FAF7F0' }} />
      </Animated.View>
      {/* the sun, rising out of the sea behind the stone */}
      <Animated.View pointerEvents="none" style={{
        position: 'absolute', left: sunCx - sunD / 2, top: sunTop, width: sunD, height: sunD,
        opacity: dawn.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1] }),
        transform: [{ translateY: dawn.interpolate({ inputRange: [0, 1], outputRange: [waterY - sunTop, 0] }) }],
      }}>
        {/* a sun made of dots, as on Focus and Done */}
        <View style={{ position: 'absolute', left: (sunD - sunD * 1.9 - 8) / 2, top: (sunD - sunD * 1.9 - 8) / 2 }}>
          <DotSun size={sunD * 1.9} />
        </View>
      </Animated.View>

      {/* Ra, the sun's first light: arrives just after the sun, then waves */}
      <Animated.View pointerEvents="none" style={{
        position: 'absolute', left: raLeft, top: raTop, width: charS, height: charS,
        opacity: raIn,
        transform: [
          { translateY: raIn.interpolate({ inputRange: [0, 1], outputRange: [charS * 0.6, 0] }) },
          { scale: raIn.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
        ],
      }}>
        <Animated.Image source={poseImage('ra-sun')} resizeMode="contain"
          style={{ position: 'absolute', width: charS, height: charS, opacity: hello.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }} />
        <Animated.Image source={poseImage('ra-hello')} resizeMode="contain"
          style={{ position: 'absolute', width: charS, height: charS, opacity: hello }} />
      </Animated.View>

      {/* the stone, and Nu, under and then through the surface */}
      <Animated.View style={{
        position: 'absolute', top: stoneDown, left: stoneLeft,
        transform: [{ translateY: stoneUp.interpolate({ inputRange: [0, 1], outputRange: [0, stoneRisen - stoneDown] }) }],
      }}>
        <Image source={stone} style={{ width: stoneW, height: stoneH }} resizeMode="contain" accessibilityLabel="The Benben stone" />
        <Animated.Image source={glowWaves} resizeMode="contain" style={{
          position: 'absolute', left: 0, top: 0, width: stoneW, height: stoneH, opacity: Animated.multiply(wavesGlow, pulse),
        }} />
        <Animated.Image source={glowSun} resizeMode="contain" style={{
          position: 'absolute', left: 0, top: 0, width: stoneW, height: stoneH, opacity: Animated.multiply(sunGlow, pulse),
        }} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={{
        position: 'absolute', left: nuLeft, top: nuUnder, width: charS, height: charS,
        transform: [{ translateY: nuUp.interpolate({ inputRange: [0, 1], outputRange: [0, nuSurfaced - nuUnder] }) }],
      }}>
        <Animated.Image source={poseImage('nu-surface')} resizeMode="contain"
          style={{ position: 'absolute', width: charS, height: charS, opacity: hello.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }} />
        <Animated.Image source={poseImage('nu-hello')} resizeMode="contain"
          style={{ position: 'absolute', width: charS, height: charS, opacity: hello }} />
      </Animated.View>

      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: waterY - 30, bottom: 0 }}>
        <Water width={W} height={H - waterY + 30} still={still} />
      </View>

      {/* Nu + Ra: who they are, and the name */}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, opacity: hello }}>
        <Bubble tone="nu" text="I’m Nu. I hold everything." style={{ left: nuLeft + 8, top: nuSurfaced - 46 }} />
        <Bubble tone="ra" text="I’m Ra. I pick one thing." style={{ right: 12, top: raTop - 44 }} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, opacity: name }}>
        <Image source={wordmark} resizeMode="contain" accessibilityLabel="Nura"
          style={{ position: 'absolute', left: (W - nameW) / 2, top: waterY + 28, width: nameW, height: nameW * 222 / 799, tintColor: '#FFF3EA' }} />
      </Animated.View>

      {!last && (
        <Pressable onPress={skip} hitSlop={8} accessibilityRole="button" style={({ pressed }) => ({
          position: 'absolute', top: insets.top + 8, right: 14,
          paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill,
          backgroundColor: pressed ? 'rgba(11,16,41,0.55)' : 'rgba(11,16,41,0.35)',
          borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
        })}>
          <Text style={{ color: '#F2F4FB', fontSize: 15, fontFamily: T.brand }}>Skip</Text>
        </Pressable>
      )}

      {/* the words sit on the water */}
      <View style={{ position: 'absolute', left: 24, right: 24, bottom: insets.bottom + 14, gap: 20 }}>
        <View style={{ minHeight: 158, justifyContent: 'flex-end', gap: 10 }}>
          {beat > 0 && (
            <Text numberOfLines={3} importantForAccessibility="no" style={{
              color: 'rgba(242,244,251,0.42)', fontSize: 15, lineHeight: 20, textAlign: 'center',
            }}>{BEATS[beat - 1]}</Text>
          )}
          <Typed key={beat} text={BEATS[beat]} still={still} onTyped={onTyped} />
        </View>
        <Animated.View style={{ opacity: cta, gap: 12 }} pointerEvents={waiting ? 'auto' : 'none'}>
          <Primary tone="ra"
            label={beat === BEGIN_AT ? 'Begin' : replay ? 'Done' : 'Get started'}
            onPress={beat === BEGIN_AT ? next : finish} />
          {last && !!onSignIn && (
            <Pressable onPress={onSignIn} hitSlop={10}>
              <Text style={{ color: '#AEB6D4', fontSize: 13.5, textAlign: 'center' }}>
                Already have an account? <Text style={{ color: '#FFB183', fontFamily: T.brand }}>Sign in</Text>
              </Text>
            </Pressable>
          )}
        </Animated.View>
      </View>
    </View>
  );
}
