import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Image, Modal, Animated, Easing,
  LayoutAnimation, Platform, UIManager,
  type ViewStyle, type ImageStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Path, Circle as SvgCircle, Rect, Defs, LinearGradient as SvgGradient,
  RadialGradient, Stop, Text as SvgText, Line,
} from 'react-native-svg';
import { radius, elevation, iconStroke, type as T } from './theme';
import { useStore, useTheme } from './store';
import { sunHeight, skyLabel } from './reward';

/* ------------------------------------------------------------------ *
 *  Icons — line-drawn, rounded caps, one stroke weight everywhere.
 * ------------------------------------------------------------------ */

type IconProps = { size?: number; color: string };

export function IconSparkle({ size = 26, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3.2l1.8 4.4 4.4 1.8-4.4 1.8L12 15.6l-1.8-4.4L5.8 9.4l4.4-1.8z" fill={color} />
      <Path d="M18.4 15.2l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z" fill={color} />
    </Svg>
  );
}

export function IconClock({ size = 26, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={iconStroke} strokeLinecap="round" strokeLinejoin="round">
      <SvgCircle cx="12" cy="12" r="9" />
      <Path d="M12 7v5l3 2" />
    </Svg>
  );
}

export function IconDoc({ size = 30, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={iconStroke} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
      <Path d="M14 3v5h5" />
    </Svg>
  );
}

export function IconCheck({ size = 28, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  );
}

export function IconBell({ size = 26, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={iconStroke} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <Path d="M13.7 21a2 2 0 01-3.4 0" />
    </Svg>
  );
}

export function IconCalendar({ size = 26, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={iconStroke} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v13a2 2 0 01-2 2H6a2 2 0 01-2-2z" />
      <Path d="M4 9h16M9 3v4M15 3v4" />
    </Svg>
  );
}

export function IconHeart({ size = 26, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={iconStroke} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.3 5.7a5 5 0 00-7.1 0L12 6.9l-1.2-1.2a5 5 0 10-7.1 7.1l8.3 8.3 8.3-8.3a5 5 0 000-7.1z" />
    </Svg>
  );
}

export function IconSearch({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={iconStroke} strokeLinecap="round" strokeLinejoin="round">
      <SvgCircle cx="11" cy="11" r="7" />
      <Path d="M16.3 16.3L21 21" />
    </Svg>
  );
}

export function IconChevron({ size = 28, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={iconStroke} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

/**
 * The background. Reads the MODE's atmosphere, so it is deep navy in Nu and
 * cream in Ra — the temperature change that makes switching modes feel like
 * going somewhere. Absolutely positioned; render it first.
 *
 * `force` matches the same param on `useTheme()` — pass it on any screen that
 * pins its own colors to one palette regardless of the global mode (Connect,
 * Compose). Without it, Mica keeps reading the global mode on its own, and a
 * screen fixed to `raTheme`'s near-black ink can end up drawn over Mica's
 * near-black Nu atmosphere — text and ground from two unrelated palettes,
 * unreadable in exactly the state most people are in the first time they see
 * it (mode defaults to 'nu' before onboarding ever sets anything).
 */
export function Mica({ force }: { force?: Parameters<typeof useTheme>[0] } = {}) {
  const t = useTheme(force);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
      <LinearGradient colors={t.atmosphere} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} locations={[0, 0.55, 1]}
        style={{ position: 'absolute', inset: 0 }} />
      {/* Two ambient glows — indigo high-left, coral low-right — bled into the
          ground the way Fluent's Mica does. A flat fill behind rounded cards
          is what makes a dark app look like a wireframe: there is nothing for
          the elevation to be measured against. These give the surfaces
          something to sit ON. */}
      <Svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
        <Defs>
          <RadialGradient id="mica-nu" cx="14%" cy="4%" r="62%">
            <Stop offset="0" stopColor={t.nu} stopOpacity={t.glowNu} />
            <Stop offset="1" stopColor={t.nu} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="mica-ra" cx="96%" cy="86%" r="66%">
            <Stop offset="0" stopColor={t.ra} stopOpacity={t.glowRa} />
            <Stop offset="1" stopColor={t.ra} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#mica-nu)" />
        <Rect width="100%" height="100%" fill="url(#mica-ra)" />
      </Svg>
    </View>
  );
}

/**
 * A raised surface.
 *
 * Fluent 2's layering in one component: a two-stop wash of light rather than a
 * flat fill, a hairline that catches the top edge, and a real shadow. The wash
 * is what does the work — a card filled with one solid colour reads as a
 * region, a card filled with a gradient reads as a plane with light falling
 * across it.
 */
export function Surface(
  { children, style, raised = true, accent }:
  { children: React.ReactNode; style?: ViewStyle; raised?: boolean; accent?: Tone },
) {
  const t = useTheme();
  const a = accent === 'ra' ? t.raBtn : accent === 'nu' ? t.nuBtn : null;
  return (
    <View style={[{
      borderRadius: radius.lg, overflow: 'hidden',
      borderWidth: 1, borderColor: t.stroke,
    }, raised ? elevation.e8 : elevation.e2, style]}>
      <LinearGradient
        colors={t.surface} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }}
        style={{ position: 'absolute', inset: 0 }}
      />
      {/* a 2px gradient rule along the top edge, where an accent is wanted */}
      {!!a && (
        <LinearGradient colors={a} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2 }} />
      )}
      {children}
    </View>
  );
}

/* ================================================================== *
 *  The characters.
 *
 *  NOT frame animation. The four PNGs in each pack are four independently
 *  drawn POSES, not frames of one rendered motion — measured across
 *  ra-wave, the arm goes out, up, tucked down with the eyes shut, then up
 *  again, and the body's bounding box swings between 435 and 505px wide.
 *  Played in sequence the arm teleports and the body pulses. Cross-fading
 *  made it a ghosted teleport instead of a hard one. There is no playback
 *  speed at which four unrelated poses read as movement.
 *
 *  So: ONE pose per state, moved with transforms. A spring on scale and
 *  rotation is continuous by definition — it cannot glitch, because every
 *  in-between value is computed rather than drawn. It also runs on the
 *  native driver, off the JS thread.
 *
 *  The unused poses stay in the repo. If these are ever re-rendered from a
 *  real rig with a fixed camera, the frame player is worth revisiting.
 * ================================================================== */

const POSES = {
  // resting: calm, arms down
  'nu-idle': require('../assets/characters/nu-idle-frames/frame-01.png'),
  // hand at the chin, eyes up — the clearest "taking that from you"
  'nu-thinking': require('../assets/characters/nu-thinking-frames/frame-02.png'),
  // arm raised mid-wave, open smile
  'ra-wave': require('../assets/characters/ra-wave-frames/frame-02.png'),
  // both arms up, eyes shut, rays out
  'ra-celebrate': require('../assets/characters/ra-celebrate-frames/frame-03.png'),
} as const;

export type CharacterName = keyof typeof POSES;
export type Motion = 'greet' | 'bob' | 'celebrate' | 'none';

export function Character(
  { name, size = 120, motion = 'greet', onDone, style }:
  { name: CharacterName; size?: number; motion?: Motion; onDone?: () => void; style?: ImageStyle },
) {
  const v = useRef(new Animated.Value(motion === 'none' ? 1 : 0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (motion === 'none') { v.setValue(1); return; }

    if (motion === 'bob') {
      v.setValue(1);
      const loop = Animated.loop(Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]));
      loop.start();
      return () => loop.stop();
    }

    // greet / celebrate: a single spring in, with a little overshoot
    v.setValue(0);
    const anim = Animated.spring(v, {
      toValue: 1,
      friction: motion === 'celebrate' ? 4.5 : 5.5,
      tension: motion === 'celebrate' ? 130 : 90,
      useNativeDriver: true,
    });
    anim.start(({ finished }) => { if (finished) done.current?.(); });
    return () => anim.stop();
  }, [name, motion, v, float]);

  // greet leans in from a slight tilt; celebrate arrives bigger and straighter
  const scale = v.interpolate({
    inputRange: [0, 1],
    outputRange: motion === 'celebrate' ? [0.62, 1] : [0.88, 1],
  });
  const rotate = v.interpolate({
    inputRange: [0, 1],
    outputRange: motion === 'celebrate' ? ['-9deg', '0deg'] : ['-5deg', '0deg'],
  });
  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -7] });

  return (
    <Animated.Image
      source={POSES[name]} resizeMode="contain"
      style={[
        { width: size, height: size },
        style,
        { opacity: motion === 'none' ? 1 : v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1] }),
          transform: [{ scale }, { rotate }, { translateY }] },
      ]}
    />
  );
}

type Tone = 'nu' | 'ra';

function useTone(tone: Tone) {
  const t = useTheme();
  return tone === 'ra'
    ? { colors: t.raBtn, onColor: t.onRa, flat: t.ra, wash: t.raWash }
    : { colors: t.nuBtn, onColor: t.onNu, flat: t.nu, wash: t.nuWash };
}

/* ================================================================== *
 *  Motion.
 *
 *  All of this is built on RN's own Animated + LayoutAnimation rather than
 *  Reanimated, so it adds no dependency and no native rebuild. Reanimated
 *  would buy swipe-to-complete gestures and shared-element transitions; until
 *  then these cover the moments that actually carry feeling — a row arriving,
 *  a box filling, a thing leaving the list.
 * ================================================================== */

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Call immediately BEFORE the state change that adds or removes rows. */
export function animateNext(kind: 'add' | 'remove' | 'move' = 'move') {
  LayoutAnimation.configureNext({
    duration: kind === 'remove' ? 260 : 300,
    create: { type: 'easeInEaseOut', property: 'opacity' },
    update: { type: 'spring', springDamping: 0.78 },
    delete: { type: 'easeInEaseOut', property: 'opacity' },
  });
}

/**
 * A row that slides up and fades in, staggered by its index. Twenty rows all
 * appearing on the same frame reads as a page load; arriving in sequence reads
 * as a list being handed to you.
 */
export function Enter(
  { index = 0, children, style }:
  { index?: number; children: React.ReactNode; style?: ViewStyle },
) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1, duration: 340, delay: Math.min(index, 8) * 42,
      easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
  }, [v, index]);
  return (
    <Animated.View style={[{
      opacity: v,
      transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
    }, style]}>{children}</Animated.View>
  );
}

/**
 * The checkbox. Springs open, the ring floods with colour, the tick draws —
 * then the caller animates the row out from under it. The satisfying half
 * second is the entire reason anyone ticks anything off.
 */
export function Check({ onPress, tone = 'ra' }: { onPress: () => void; tone?: Tone }) {
  const t = useTheme();
  const { flat, onColor } = useTone(tone);
  const v = useRef(new Animated.Value(0)).current;
  const [on, setOn] = useState(false);

  const press = () => {
    if (on) return;
    setOn(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.sequence([
      Animated.spring(v, { toValue: 1.18, friction: 4, tension: 180, useNativeDriver: true }),
      Animated.spring(v, { toValue: 1, friction: 6, useNativeDriver: true }),
    ]).start();
    setTimeout(onPress, 190);   // let the fill land before the row leaves
  };

  return (
    <Pressable onPress={press} hitSlop={12} style={{ padding: 2 }}>
      <Animated.View style={{
        width: 22, height: 22, borderRadius: 11,
        borderWidth: 1.8, borderColor: on ? flat : t.ink3,
        backgroundColor: on ? flat : 'transparent',
        alignItems: 'center', justifyContent: 'center',
        transform: [{ scale: v.interpolate({ inputRange: [0, 1.18], outputRange: [1, 1.18] }) }],
      }}>
        {on && <IconCheck size={14} color={onColor} />}
      </Animated.View>
    </Pressable>
  );
}

/** A pressable that dips slightly under the finger. */
export function Press(
  { onPress, children, style, scale = 0.975 }:
  { onPress: () => void; children: React.ReactNode; style?: ViewStyle; scale?: number },
) {
  const v = useRef(new Animated.Value(1)).current;
  const to = (x: number) =>
    Animated.spring(v, { toValue: x, friction: 7, tension: 220, useNativeDriver: true }).start();
  return (
    // style goes on the Pressable, not the inner view: layout props like flex
    // applied only to the child leave the touchable itself content-sized, which
    // is what stopped trailing chevrons from right-aligning.
    <Pressable onPress={onPress} onPressIn={() => to(scale)} onPressOut={() => to(1)} style={style}>
      <Animated.View style={{ transform: [{ scale: v }] }}>{children}</Animated.View>
    </Pressable>
  );
}

/**
 * A bar that eases to its new width instead of jumping. Progress that snaps is
 * information; progress that travels is felt — and this one only ever grows.
 */
export function Bar(
  { pct, height = 6, color, track, tone = 'ra' }:
  { pct: number; height?: number; color?: string; track?: string; tone?: Tone },
) {
  const t = useTheme();
  const grad = tone === 'ra' ? t.raBtn : t.nuBtn;
  const w = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(w, {
      toValue: Math.max(0, Math.min(1, pct)), duration: 620,
      easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();
  }, [pct, w]);
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track ?? t.track, overflow: 'hidden' }}>
      <Animated.View style={{
        height: '100%', borderRadius: height / 2,
        width: w.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
      }}>
        <LinearGradient colors={color ? [color, color] : grad}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ flex: 1, borderRadius: height / 2 }} />
      </Animated.View>
    </View>
  );
}

/** A number that rolls up to its new value rather than blinking to it. */
export function Count({ value, style }: { value: number; style?: any }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current, delta = value - start;
    if (!delta) return;
    const t0 = Date.now(), dur = 520;
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - t0) / dur);
      setShown(Math.round(start + delta * (1 - Math.pow(1 - p, 3))));
      if (p >= 1) { clearInterval(id); from.current = value; }
    }, 32);
    return () => clearInterval(id);
  }, [value]);
  return <Text style={style}>{shown}</Text>;
}

/* ================================================================== *
 *  Reward surfaces.
 * ================================================================== */

/**
 * The day's sun. A quarter-arc with the disc climbing along it as light comes
 * in. It fills; it never empties in front of you, and tomorrow it starts at the
 * horizon again — which is a sunrise, not a reset, because nothing was taken
 * away to get there.
 */
export function SunArc({
  light, size = 132, compact, onPress,
}: { light: number; size?: number; compact?: boolean; onPress?: () => void }) {
  const t = useTheme();
  const h = sunHeight(light);

  const w = size, hh = size * 0.62;
  const arcR = w / 2 - 16;
  const cx = w / 2, cy = hh - 16;
  const angle = Math.PI - h * Math.PI;
  const sx = cx + arcR * Math.cos(angle);
  const sy = cy - arcR * Math.sin(angle);

  // ── Real-world solar context (time + season, no location permission needed)
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const month = now.getMonth(); // 0 = Jan
  // 0 before 6 am and after 18, peaks at noon
  const dayIntensity = Math.max(0.06, Math.sin(((hour - 6) / 12) * Math.PI));
  // Northern-hemisphere seasonal tilt: brightest in June (month 5)
  const seasonIntensity = 0.72 + 0.28 * Math.cos(((month - 5) / 12) * Math.PI * 2);
  const brightness = dayIntensity * seasonIntensity;
  // Softer, warmer colour at dawn and dusk
  const sunColor = (hour < 8 || hour > 17) ? t.raSoft : t.ra;

  // ── Disc geometry (grows slightly as it climbs) ───────────────────
  const discR = 7 + h * 3.5;
  const glowDiam = (discR + 16) * 2;

  // 8 rays: 4 long (cardinal) + 4 short (diagonal), only when sun is up
  const rays = h > 0.08
    ? Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        const inner = discR + 2.5;
        const outer = discR + 2.5 + (i % 2 === 0 ? 6 : 3.5);
        return {
          x1: sx + inner * Math.cos(a), y1: sy + inner * Math.sin(a),
          x2: sx + outer * Math.cos(a), y2: sy + outer * Math.sin(a),
        };
      })
    : [];

  // ── Pulse animation ───────────────────────────────────────────────
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const dur = Math.round(2400 - brightness * 900);
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse, brightness]);

  const glowOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.13 * brightness, 0.31 * brightness],
  });

  const [labelVisible, setLabelVisible] = useState(false);

  return (
    <Pressable
      onPress={() => { setLabelVisible(v => !v); onPress?.(); }}
      hitSlop={12}
      style={{ alignItems: 'center' }}
    >
      <View style={{ width: w, height: hh }}>
        {/* Radial glow as Animated.View — allows native-driver opacity pulse */}
        {h > 0 && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: sx - glowDiam / 2,
              top:  sy - glowDiam / 2,
              width: glowDiam, height: glowDiam,
              borderRadius: glowDiam / 2,
              backgroundColor: sunColor,
              opacity: glowOpacity,
            }}
          />
        )}

        <Svg width={w} height={hh} style={{ position: 'absolute' }}>
          <Defs>
            <SvgGradient id="arc-pg" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor={t.raSoft} stopOpacity={0.3} />
              <Stop offset="100%" stopColor={sunColor} stopOpacity={1} />
            </SvgGradient>
          </Defs>

          {/* Track arc */}
          <Path
            d={`M ${cx - arcR} ${cy} A ${arcR} ${arcR} 0 0 1 ${cx + arcR} ${cy}`}
            stroke={t.track} strokeWidth={4} fill="none" strokeLinecap="round"
          />

          {/* Progress arc */}
          {h > 0.01 && (
            <Path
              d={`M ${cx - arcR} ${cy} A ${arcR} ${arcR} 0 0 1 ${sx} ${sy}`}
              stroke="url(#arc-pg)" strokeWidth={5} fill="none" strokeLinecap="round"
            />
          )}

          {/* Rays */}
          {rays.map((ray, i) => (
            <Line
              key={i}
              x1={ray.x1} y1={ray.y1} x2={ray.x2} y2={ray.y2}
              stroke={sunColor} strokeWidth={1.5} strokeLinecap="round"
              opacity={Math.min(0.75, h * brightness * 1.3)}
            />
          ))}

          {/* Disc core */}
          <SvgCircle cx={sx} cy={sy} r={discR} fill={sunColor} />
          {/* Soft highlight — a small off-centre lighter circle */}
          <SvgCircle
            cx={sx - discR * 0.22} cy={sy - discR * 0.22}
            r={discR * 0.38} fill="rgba(255,255,255,0.22)"
          />
        </Svg>
      </View>

      {/* Label: always shown in full mode; tap-revealed in compact */}
      {(!compact || labelVisible) && (
        <Text style={{ color: t.ink2, fontSize: compact ? 11 : 12.5, marginTop: 2 }}>
          {skyLabel(light)}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * The payoff. Fires on every completion, every stopped-early session, every
 * finished step — full screen, unmissable, and over in under two seconds.
 *
 * It has to be immediate and it has to be *seen*: a number that quietly
 * increments on a stats screen you visit once a week is not reinforcement.
 * The variable bonus is called out separately from the base, because the
 * surprise is the part that does the work.
 */
export function Celebrate() {
  const c = useStore(s => s.celebration);
  const dismiss = useStore(s => s.dismissCelebration);
  const pop = useRef(new Animated.Value(0)).current;
  const [displayNum, setDisplayNum] = useState(0);

  useEffect(() => {
    if (!c) { setDisplayNum(0); return; }
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (c.award.bonus.golden || c.rankUp) {
      setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 260);
    }
    if (c.rankUp) {
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 520);
    }

    // Count up the number over ~700ms
    const target = c.award.total;
    const steps = Math.min(target, 22);
    const stepMs = Math.round(700 / steps);
    let current = 0;
    setDisplayNum(0);
    const timer = setInterval(() => {
      current = Math.min(current + Math.ceil(target / steps), target);
      setDisplayNum(current);
      if (current >= target) clearInterval(timer);
    }, stepMs);

    const dur = c.rankUp ? 3600 : c.award.bonus.golden ? 2800 : 1900;
    const id = setTimeout(dismiss, dur);
    return () => { clearTimeout(id); clearInterval(timer); };
  }, [c?.at]);

  if (!c) return null;
  const golden = c.award.bonus.golden;
  const rankUp = c.rankUp;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={dismiss}>
      <Pressable onPress={dismiss} style={{ flex: 1 }}>
        <LinearGradient
          colors={rankUp
            ? ['#FFD060', '#FF8A5C', '#C2410C']
            : golden
              ? ['#FFB020', '#FF6B35', '#C2410C']
              : ['#FF8A4C', '#FF6B35', '#E14B12']}
          start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 6 }}>
          <Animated.View style={{
            alignItems: 'center', gap: 4,
            transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
            opacity: pop,
          }}>
            <Character name="ra-celebrate" size={190} motion="celebrate" />
            <Text style={{ color: '#FFF7EC', fontSize: 66, fontFamily: T.display, letterSpacing: -2 }}>
              +{displayNum}
            </Text>
            <Text style={{ color: '#FFE3CE', fontSize: 11.5, letterSpacing: 3, fontFamily: T.brand }}>LIGHT</Text>
            {!!c.award.bonus.label && (
              <View style={{
                marginTop: 10, paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill,
                backgroundColor: 'rgba(59,18,4,0.22)',
              }}>
                <Text style={{ color: '#FFF7EC', fontSize: 13, fontFamily: T.brand, letterSpacing: golden ? 1.5 : 0.2 }}>
                  {golden ? '★ ' : '+'}{golden ? c.award.bonus.label : `${c.award.bonus.n} ${c.award.bonus.label}`}
                </Text>
              </View>
            )}

            {/* Rank-up moment — shown when light crosses a threshold */}
            {rankUp ? (
              <View style={{
                marginTop: 20, alignItems: 'center', gap: 5,
                paddingHorizontal: 20, paddingVertical: 14, borderRadius: radius.xl,
                backgroundColor: 'rgba(59,18,4,0.26)',
              }}>
                <Text style={{ color: '#FFE3CE', fontSize: 10.5, letterSpacing: 3, fontFamily: T.brand }}>
                  RANK UP
                </Text>
                <Text style={{ color: '#FFF7EC', fontSize: 32, fontFamily: T.display, letterSpacing: -0.8 }}>
                  {rankUp.name}
                </Text>
                <Text style={{ color: '#FFE3CE', fontSize: 14.5, textAlign: 'center', maxWidth: 260, lineHeight: 21 }}>
                  {rankUp.blurb}
                </Text>
              </View>
            ) : (
              <Text style={{
                color: '#FFF1E2', fontSize: 16.5, textAlign: 'center', marginTop: 16,
                maxWidth: 300, lineHeight: 24, fontFamily: T.brand,
              }}>{c.line}</Text>
            )}
          </Animated.View>
        </LinearGradient>
      </Pressable>
    </Modal>
  );
}

/** Non-blocking toast for small events (captures, etc). Appears and fades without interrupting. */
export function Toast() {
  const toast = useStore(s => s.toast);
  const dismiss = useStore(s => s.dismissToast);
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(6)).current;

  useEffect(() => {
    if (!toast) return;
    fade.setValue(0); slide.setValue(6);
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();
    const id = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => dismiss());
    }, 1200);
    return () => clearTimeout(id);
  }, [toast?.at]);

  if (!toast) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', bottom: 96, alignSelf: 'center',
        opacity: fade, transform: [{ translateY: slide }],
        paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20,
        backgroundColor: 'rgba(255,138,92,0.15)',
        borderWidth: 1, borderColor: 'rgba(255,138,92,0.35)',
      }}>
      <Text style={{ color: '#FF8A5C', fontSize: 14, fontFamily: T.brand }}>{toast.text}</Text>
    </Animated.View>
  );
}

/** The running total, wherever it needs to be small. Never goes down. */
export function LightPill({ light, onPress }: { light: number; onPress?: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={10} style={{
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 11, paddingVertical: 6, borderRadius: radius.pill,
      backgroundColor: t.raWash, borderWidth: 1, borderColor: t.strokeStrong,
    }}>
      <IconSparkle size={15} color={t.ra} />
      <Text style={{ color: t.ink, fontSize: 13.5, fontFamily: T.brand }}>{light}</Text>
    </Pressable>
  );
}

/* ================================================================== *
 *  Controls.
 * ================================================================== */

/**
 * A soft tinted icon container. Deliberately much smaller and quieter than the
 * old 64px gradient tiles that sat on every list row — a wall of them is what
 * made the inbox read like a settings screen.
 */
export function IconBadge(
  { icon, size = 40, tone = 'wash', accent = 'nu' }:
  { icon: React.ReactNode; size?: number; tone?: 'gradient' | 'solid' | 'wash'; accent?: Tone },
) {
  const t = useTheme();
  const { colors, wash } = useTone(accent);
  const shared: ViewStyle = { width: size, height: size, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' };
  if (tone === 'gradient') {
    return (
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={shared}>{icon}</LinearGradient>
    );
  }
  return <View style={[shared, { backgroundColor: tone === 'wash' ? wash : t.brandSolid }]}>{icon}</View>;
}

/** A circular progress ring with a number/label stacked in the center. */
export function RingStat(
  { size = 108, stroke = 11, progress, value, label, accent = 'ra' }:
  { size?: number; stroke?: number; progress: number; value: string; label: string; accent?: Tone },
) {
  const t = useTheme();
  const { colors } = useTone(accent);
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Defs>
          <SvgGradient id="ringstat" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors[0]} /><Stop offset="1" stopColor={colors[1]} />
          </SvgGradient>
        </Defs>
        <SvgCircle cx={size / 2} cy={size / 2} r={r} stroke={t.track} strokeWidth={stroke} fill="none" />
        <SvgCircle cx={size / 2} cy={size / 2} r={r} stroke="url(#ringstat)" strokeWidth={stroke} fill="none"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p)} />
      </Svg>
      <Text style={{ color: t.ink, fontSize: size * 0.24, fontFamily: T.displayLight }}>{value}</Text>
      <Text style={{ color: t.ink3, fontSize: 10.5, letterSpacing: 0.6, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

/** A week of gradient-filled bars. */
export function WeekBars({ data, height = 84, accent = 'ra' }: { data: { label: string; value: number }[]; height?: number; accent?: Tone }) {
  const t = useTheme();
  const { colors } = useTone(accent);
  const max = Math.max(1, ...data.map(d => d.value));
  const barArea = height - 20;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height }}>
      {data.map((d, i) => (
        <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
          <View style={{
            width: '100%', height: barArea, justifyContent: 'flex-end',
            borderRadius: radius.sm, overflow: 'hidden', backgroundColor: t.track,
          }}>
            {d.value > 0 && (
              <LinearGradient colors={colors}
                style={{ width: '100%', height: Math.max(8, (d.value / max) * barArea) }} />
            )}
          </View>
          <Text style={{ color: t.ink3, fontSize: 10.5 }}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Text filled with a gradient.
 *
 * React Native can't paint a gradient into glyphs directly — the usual answer
 * is @react-native-masked-view, another native dependency and another rebuild.
 * react-native-svg is already here and its <Text> takes a paint server, so the
 * fill is a real gradient across the actual letterforms with nothing new
 * installed. Full-width box with a centred anchor, so it needs no text
 * measurement.
 */
export function GradientText(
  { children, size, lineHeight, colors, font, id = 'gt' }:
  { children: string; size: number; lineHeight: number; colors: readonly [string, string];
    font?: string; id?: string },
) {
  return (
    <Svg width="100%" height={lineHeight}>
      <Defs>
        <SvgGradient id={id} x1="0" y1="0" x2="1" y2="0.6">
          <Stop offset="0" stopColor={colors[0]} />
          <Stop offset="1" stopColor={colors[1]} />
        </SvgGradient>
      </Defs>
      <SvgText
        x="50%" y={size * 0.78 + (lineHeight - size) / 2}
        textAnchor="middle" fontSize={size} fontFamily={font ?? T.display}
        fill={`url(#${id})`}>
        {children}
      </SvgText>
    </Svg>
  );
}

/** A small caps label. Used where something is happening right now. */
export function Eyebrow({ label, tone = 'ra' }: { label: string; tone?: Tone }) {
  const t = useTheme();
  return (
    <Text style={{
      color: tone === 'ra' ? (t.key === 'ra' ? t.raDeep : t.ra) : t.nu,
      fontSize: 11, letterSpacing: 2.4, fontFamily: T.brand,
    }}>{label.toUpperCase()}</Text>
  );
}

/** Kept for the reflection screens. Nothing on Nu or Ra uses a card any more —
 *  a stack of floating rounded rectangles is the house style of every
 *  productivity app there is, which is exactly the problem. */
export function Card({ children, style, raised }: { children: React.ReactNode; style?: ViewStyle; raised?: boolean }) {
  const t = useTheme();
  return (
    <View style={[{
      backgroundColor: t.card, borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth, borderColor: t.stroke, padding: 18,
    }, raised ? elevation.e4 : elevation.e2, style]}>{children}</View>
  );
}

export function Primary(
  { label, onPress, tone = 'nu', icon, sub }:
  { label: string; onPress: () => void; tone?: Tone; icon?: React.ReactNode; sub?: string },
) {
  const { colors, onColor } = useTone(tone);
  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onPress(); }}
      style={({ pressed }) => ({
        opacity: pressed ? 0.92 : 1, borderRadius: radius.lg, overflow: 'hidden',
        transform: [{ scale: pressed ? 0.985 : 1 }],
        ...(tone === 'ra' ? elevation.warm : elevation.e4),
      })}>
      <LinearGradient
        colors={colors} start={{ x: 0, y: 0.2 }} end={{ x: 1, y: 1 }}
        style={{ paddingVertical: 17, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: onColor, fontSize: 16.5, fontFamily: T.display }}>{label}</Text>
          {icon}
        </View>
        {!!sub && <Text style={{ color: onColor, opacity: 0.72, fontSize: 12 }}>{sub}</Text>}
      </LinearGradient>
    </Pressable>
  );
}

export function Ghost({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({
      flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: radius.md,
      borderWidth: 1, borderColor: t.strokeStrong,
      backgroundColor: pressed ? t.subtle : 'transparent',
    })}>
      <Text style={{ color: t.ink2, fontSize: 14.5, fontFamily: T.brand }}>{label}</Text>
    </Pressable>
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={{ color: t.ink, fontSize: 28, lineHeight: 34, fontFamily: T.display }}>{children}</Text>;
}

export function Body({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  const t = useTheme();
  return <Text style={{ color: dim ? t.ink3 : t.ink2, fontSize: 14.5, lineHeight: 21 }}>{children}</Text>;
}

/** Back-compat: a couple of screens still import Tag. */
export function Tag({ label, tone = 'ra' }: { label: string; icon?: React.ReactNode; tone?: Tone }) {
  return <Eyebrow label={label} tone={tone} />;
}
