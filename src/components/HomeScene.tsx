import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Image, Animated, Easing, AccessibilityInfo, useWindowDimensions } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgGradient, RadialGradient, Stop, Rect, Ellipse, Circle } from 'react-native-svg';
import { useTheme } from '../store';
import { poseImage } from '../ui';

/**
 * Nu's home, drawn: a sea at dusk, Nu in the water, Ra on a rock in the last
 * warm light — and between them a river of that light, winding across the
 * water between dark boulders. The path from everything you're carrying to
 * the one thing you can do now. The light is the point of the picture, so
 * it's drawn as light: a wide glowing ribbon with a white-gold core, soft
 * glow around it, sparkles on it and glints on the water, and every rock lit
 * on the edge that faces it. Around Nu the water moves in slow rings.
 *
 * Built from the same pieces as the opening (the character cut-outs, drawn
 * water and light) rather than one flat picture, so it follows the palette
 * and the light can breathe. It fades into the page at the top and bottom.
 */

const DUSK = {
  sky: ['#0B1029', '#1D2152', '#4A3268'], rocksFar: '#262A5C', rocksNear: '#161B40', rim: 'rgba(255,170,100,0.6)',
  sea: ['#1A2759', '#0E1638'], stone: '#0D1230', waterOverNu: '#172558', ripple: 'rgba(160,190,255,0.5)',
};
const DAWN = {
  sky: ['#FAF7F0', '#ECE6F6', '#F6D5C2'], rocksFar: '#D3CCE6', rocksNear: '#BDB6D8', rim: 'rgba(255,140,60,0.65)',
  sea: ['#D6DAF3', '#EEF0FA'], stone: '#8F95C4', waterOverNu: '#CCD1F0', ripple: 'rgba(67,56,202,0.4)',
};
const LIGHT = { outer: '#FF7A2E', mid: '#FFA64D', core: '#FFE7B0', white: '#FFF8E6' };

type Pt = [number, number];
const cubic = (t: number, a: Pt, b: Pt, c: Pt, d: Pt): Pt => {
  const u = 1 - t;
  return [0, 1].map(i => u * u * u * a[i] + 3 * u * u * t * b[i] + 3 * u * t * t * c[i] + t * t * t * d[i]) as Pt;
};

/** Points along joined cubic curves — the river's winding centre line. */
function riverLine(segs: [Pt, Pt, Pt, Pt][], n = 48): Pt[] {
  const out: Pt[] = [];
  const per = n / segs.length;
  segs.forEach((s, k) => {
    for (let i = k ? 1 : 0; i <= per; i++) out.push(cubic(i / per, ...s));
  });
  return out;
}

/** A filled ribbon along `line`, `w(s)` wide at each point (s from 0 near
 *  you to 1 far away) — so the river narrows into the distance. */
function ribbon(line: Pt[], w: (s: number) => number): string {
  const L: Pt[] = [], R: Pt[] = [];
  line.forEach((p, i) => {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
    const half = w(i / (line.length - 1)) / 2;
    L.push([p[0] + nx * half, p[1] + ny * half]);
    R.push([p[0] - nx * half, p[1] - ny * half]);
  });
  const pts = [...L, ...R.reverse()];
  return `M${pts.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L')} Z`;
}

/** A boulder, dark, lit along its top edge on the side facing the light. */
function Boulder({ x, y, rx, ry, fill, rim, lit }: { x: number; y: number; rx: number; ry: number; fill: string; rim: string; lit: 'left' | 'right' }) {
  const top = y - ry;
  const arc = lit === 'left'
    ? `M${x - rx * 0.95} ${y - ry * 0.1} Q${x - rx * 0.7} ${top - ry * 0.05} ${x + rx * 0.1} ${top + ry * 0.05}`
    : `M${x + rx * 0.95} ${y - ry * 0.1} Q${x + rx * 0.7} ${top - ry * 0.05} ${x - rx * 0.1} ${top + ry * 0.05}`;
  return (
    <>
      <Ellipse cx={x} cy={y} rx={rx} ry={ry} fill={fill} />
      <Path d={arc} stroke={rim} strokeWidth={2.2} fill="none" strokeLinecap="round" />
    </>
  );
}

/** Rings in the water around Nu, spreading slowly outward and fading, one
 *  after another. Still rings when motion is reduced. */
function Ripples({ cx, cy, r, color, still }: { cx: number; cy: number; r: number; color: string; still: boolean }) {
  const rings = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    if (still) { rings.forEach((v, i) => v.setValue(0.3 + i * 0.3)); return; }
    const loops = rings.map((v, i) => Animated.loop(Animated.sequence([
      Animated.delay(i * 1300),
      Animated.timing(v, { toValue: 1, duration: 3900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
    ])));
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [rings, still]);
  const w = r * 2.8, h = r * 0.9;
  return (
    <>
      {rings.map((v, i) => (
        <Animated.View key={i} pointerEvents="none" style={{
          position: 'absolute', left: cx - w / 2, top: cy - h / 2, width: w, height: h,
          opacity: still ? 0.7 - i * 0.2 : v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.9, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) }],
        }}>
          <Svg width={w} height={h}>
            <Ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 2} ry={h / 2 - 2} fill="none" stroke={color} strokeWidth={1.6} />
          </Svg>
        </Animated.View>
      ))}
    </>
  );
}

export function HomeScene() {
  const t = useTheme();
  const { width: W } = useWindowDimensions();
  const H = Math.round(W * 0.64);
  const c = t.key === 'nu' ? DUSK : DAWN;
  const [still, setStill] = useState(false);
  const breathe = useRef(new Animated.Value(1)).current;
  const twinkleA = useRef(new Animated.Value(0)).current;
  const twinkleB = useRef(new Animated.Value(1)).current;

  // the light breathes and the sparkles twinkle, slowly
  useEffect(() => {
    const loops: Animated.CompositeAnimation[] = [];
    AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      setStill(reduce);
      if (reduce) { twinkleA.setValue(1); return; }
      const swing = (v: Animated.Value, from: number, to: number, ms: number) => Animated.loop(Animated.sequence([
        Animated.timing(v, { toValue: to, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: from, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]));
      loops.push(swing(breathe, 1, 0.78, 2600), swing(twinkleA, 0, 1, 1300), swing(twinkleB, 1, 0, 1700));
      loops.forEach(l => l.start());
    }).catch(() => {});
    return () => loops.forEach(l => l.stop());
  }, [breathe, twinkleA, twinkleB]);

  const horizon = H * 0.4;
  const rockX = W * 0.76, rockY = H * 0.47;

  const g = useMemo(() => {
    // the river: from the bottom edge in front of Nu, winding up to Ra's rock
    const line = riverLine([
      [[W * 0.5, H * 1.04], [W * 0.82, H * 0.92], [W * 0.84, H * 0.8], [W * 0.62, H * 0.72]],
      [[W * 0.62, H * 0.72], [W * 0.44, H * 0.64], [W * 0.56, H * 0.53], [rockX - W * 0.02, rockY + H * 0.01]],
    ]);
    const width = (k: number) => (s: number) => (W * 0.15 * (1 - s) + W * 0.022 * s) * k;
    // sparkles scattered on and near the river, two sets out of step
    const sparks = line.filter((_, i) => i % 3 === 1).map((p, i) => {
      const s = i / 16, off = ((i * 37) % 11 - 5) / 5;
      return { x: p[0] + off * width(0.45)(s), y: p[1] + ((i * 13) % 5 - 2), r: 1 + (1 - s) * 1.6, set: i % 2 };
    });
    // golden glints on the water around it
    const glints = line.filter((_, i) => i % 4 === 2).map((p, i) => {
      const s = i / 12, side = i % 2 ? 1 : -1;
      return { x: p[0] + side * width(1.3)(s), y: p[1] + 3, rx: W * (0.03 - s * 0.018), ry: 1.6 };
    });
    // boulders along both banks, smaller as they go back, lit on the river side
    const bank = [0.06, 0.2, 0.34, 0.5, 0.64, 0.8].map((s, i) => {
      const p = line[Math.round(s * (line.length - 1))];
      const side = i % 2 ? -1 : 1;
      const rx = W * (0.075 - s * 0.05);
      return { x: p[0] + side * (width(1)(s) / 2 + rx * 0.85), y: p[1] + rx * 0.1, rx, ry: rx * 0.5, lit: side > 0 ? 'left' as const : 'right' as const };
    });
    return {
      glow2: ribbon(line, width(3.2)), glow1: ribbon(line, width(1.9)), body: ribbon(line, width(1)),
      core: ribbon(line, width(0.42)), sparks, glints, bank,
    };
  }, [W, H, rockX, rockY]);

  const ridge = (pts: Pt[]) =>
    `M0 ${horizon + 4} ` + pts.map(([x, y]) => `L${x * W} ${y * H}`).join(' ') + ` L${W} ${horizon + 4} Z`;
  const far = ridge([[0, 0.35], [0.05, 0.29], [0.1, 0.27], [0.14, 0.32], [0.2, 0.26], [0.26, 0.3], [0.31, 0.35], [0.37, 0.32],
    [0.43, 0.37], [0.52, 0.36], [0.57, 0.32], [0.62, 0.35], [0.7, 0.38], [0.82, 0.34], [0.87, 0.25], [0.93, 0.21], [0.97, 0.27], [1, 0.29]]);
  const near = ridge([[0, 0.39], [0.06, 0.36], [0.12, 0.39], [0.3, 0.4], [0.36, 0.37], [0.41, 0.4], [0.86, 0.4], [0.92, 0.35], [1, 0.37]]);

  const nuS = W * 0.34, raS = W * 0.25;
  const nuWater = H * 0.84;
  const nuCx = W * 0.05 + nuS * 0.5;

  return (
    <View style={{ width: W, height: H, overflow: 'hidden' }} accessibilityRole="image"
      accessibilityLabel="Nu in the water and Ra on a rock, a river of light between them">
      <Svg width={W} height={H} style={{ position: 'absolute' }}>
        <Defs>
          <SvgGradient id="hs-sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={c.sky[0]} stopOpacity="0" />
            <Stop offset="0.45" stopColor={c.sky[1]} />
            <Stop offset="1" stopColor={c.sky[2]} />
          </SvgGradient>
          <SvgGradient id="hs-sea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={c.sea[0]} />
            <Stop offset="1" stopColor={c.sea[1]} />
          </SvgGradient>
          <RadialGradient id="hs-sun" gradientUnits="userSpaceOnUse" cx={rockX} cy={horizon - H * 0.04} r={W * 0.55}>
            <Stop offset="0" stopColor={LIGHT.core} stopOpacity={t.key === 'nu' ? 0.75 : 0.6} />
            <Stop offset="0.25" stopColor={LIGHT.mid} stopOpacity={0.45} />
            <Stop offset="0.6" stopColor={LIGHT.outer} stopOpacity={0.12} />
            <Stop offset="1" stopColor={LIGHT.outer} stopOpacity="0" />
          </RadialGradient>
          <SvgGradient id="hs-top" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.base} stopOpacity="1" />
            <Stop offset="1" stopColor={t.base} stopOpacity="0" />
          </SvgGradient>
        </Defs>
        <Rect x={0} y={0} width={W} height={horizon + 6} fill="url(#hs-sky)" />
        <Rect x={0} y={0} width={W} height={H} fill="url(#hs-sun)" />
        <Rect x={0} y={0} width={W} height={H * 0.3} fill="url(#hs-top)" />
        <Path d={far} fill={c.rocksFar} />
        <Path d={far} fill="none" stroke={c.rim} strokeWidth={1} strokeOpacity={0.5} />
        <Path d={near} fill={c.rocksNear} />
        <Rect x={0} y={horizon} width={W} height={H - horizon} fill="url(#hs-sea)" />
        {/* the sunset on the water, under Ra */}
        <Ellipse cx={rockX} cy={horizon + H * 0.05} rx={W * 0.34} ry={H * 0.05} fill={LIGHT.mid} opacity={0.2} />
      </Svg>

      {/* the river of light: glow, body, and a white-gold core — breathing */}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, opacity: breathe }}>
        <Svg width={W} height={H}>
          <Path d={g.glow2} fill={LIGHT.outer} opacity={0.12} />
          <Path d={g.glow1} fill={LIGHT.mid} opacity={0.26} />
          <Path d={g.body} fill={LIGHT.mid} opacity={0.75} />
          <Path d={g.core} fill={LIGHT.core} opacity={0.95} />
          {g.glints.map((p, i) => <Ellipse key={i} cx={p.x} cy={p.y} rx={Math.max(4, p.rx)} ry={p.ry} fill={LIGHT.mid} opacity={0.55} />)}
        </Svg>
      </Animated.View>

      {/* sparkles on the light, twinkling out of step */}
      {[twinkleA, twinkleB].map((v, set) => (
        <Animated.View key={set} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, opacity: v }}>
          <Svg width={W} height={H}>
            {g.sparks.filter(s => s.set === set).map((s, i) => (
              <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill={LIGHT.white} />
            ))}
          </Svg>
        </Animated.View>
      ))}

      {/* boulders on both banks, and Ra's rock, lit on the side facing the light */}
      <Svg width={W} height={H} style={{ position: 'absolute' }} pointerEvents="none">
        {g.bank.map((b, i) => <Boulder key={i} {...b} fill={c.stone} rim={c.rim} />)}
        <Boulder x={rockX} y={rockY + H * 0.03} rx={W * 0.13} ry={H * 0.06} fill={c.stone} rim={c.rim} lit="left" />
      </Svg>

      <Image source={poseImage('ra-wave')} resizeMode="contain" style={{
        position: 'absolute', left: rockX - raS / 2, top: rockY - raS * 0.9, width: raS, height: raS,
      }} />

      {/* Nu, half in the water, the water moving around it */}
      <Image source={poseImage('nu-idle')} resizeMode="contain" style={{
        position: 'absolute', left: W * 0.05, top: nuWater - nuS * 0.72, width: nuS, height: nuS,
      }} />
      <Svg width={W} height={H} style={{ position: 'absolute' }} pointerEvents="none">
        <Defs>
          <SvgGradient id="hs-nuwater" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={c.waterOverNu} stopOpacity="0.92" />
            <Stop offset="1" stopColor={c.sea[1]} stopOpacity="1" />
          </SvgGradient>
        </Defs>
        <Rect x={0} y={nuWater} width={W * 0.44} height={H - nuWater} fill="url(#hs-nuwater)" />
      </Svg>
      <Ripples cx={nuCx} cy={nuWater + 2} r={nuS * 0.42} color={c.ripple} still={still} />

      {/* and everything fades into the page below */}
      <Svg width={W} height={H} style={{ position: 'absolute' }} pointerEvents="none">
        <Defs>
          <SvgGradient id="hs-fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.base} stopOpacity="0" />
            <Stop offset="1" stopColor={t.base} stopOpacity="1" />
          </SvgGradient>
        </Defs>
        <Rect x={0} y={H * 0.82} width={W} height={H * 0.18} fill="url(#hs-fade)" />
      </Svg>
    </View>
  );
}
