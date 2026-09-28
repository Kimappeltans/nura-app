import { useState } from 'react';
import { View, Text, Image } from 'react-native';
import Svg, { Path, Line, Circle, Defs, RadialGradient, LinearGradient, Stop, ClipPath, Rect, G } from 'react-native-svg';
import { useStore, useTheme } from '../store';
import { type as T } from '../theme';
import { poseImage } from '../ui';
import { decorative } from '../a11y';
import { clockParts, CORAL } from './kit';

/**
 * THE DAY'S ARC, on the desktop's Home: the sun's path from when your day
 * starts to when it ends. Solid and lit underneath as far as the day has
 * gone, dotted for what's left. Ra rides it in its glow; coral dots are where
 * things got done. Before the day starts Ra is just under the horizon at the
 * start; once it has ended, Ra sits down at the end. It lives in Home's Your
 * day card (Kim, 28 September: the desktop keeps the arc, like the phone).
 */
export function DayArc({ now, done = [], height, count }: { now: Date; done?: number[]; height: number; /** "2 done" between the two ends, as on the phone */ count?: boolean }) {
  const t = useTheme();
  const dark = t.key === 'nu';
  const start = useStore(s => s.dayStartMin);
  const end = useStore(s => s.dayEndMin);
  const [W, setW] = useState(600);

  // minutes since midnight, carried past midnight when the day runs that late
  const minOf = (d: Date) => {
    const m = d.getHours() * 60 + d.getMinutes();
    return end > 24 * 60 && m < start ? m + 24 * 60 : m;
  };
  const pOf = (d: Date) => (minOf(d) - start) / (end - start);
  const raw = pOf(now);
  const phase = raw < 0 ? 'early' : raw > 1 ? 'night' : 'day';
  const p = Math.max(0, Math.min(1, raw));

  const H = height, x0 = 12, x1 = W - 12, hz = H - 10;
  const peak = Math.max(6, H * 0.03);
  const cx = W / 2, cy = 2 * peak - hz;          // the control point that puts the top at `peak`
  const B = (u: number) => [
    (1 - u) ** 2 * x0 + 2 * (1 - u) * u * cx + u * u * x1,
    (1 - u) ** 2 * hz + 2 * (1 - u) * u * cy + u * u * hz,
  ];
  const pts = Array.from({ length: 61 }, (_, i) => B(p * i / 60));
  const prog = 'M' + pts.map(q => q.map(v => v.toFixed(1)).join(',')).join(' L');
  const last = pts[pts.length - 1];
  const area = `${prog} L${last[0].toFixed(1)},${hz} L${x0},${hz} Z`;
  const [rx, ry] = B(p);

  const ink = t.ink;
  const line = t.strokeStrong;
  const raSize = Math.round(Math.max(64, Math.min(112, H * 0.42)));
  const s = clockParts(start), e = clockParts(end);
  const doneAt = done.map(ms => pOf(new Date(ms))).filter(x => x >= 0 && x <= p);
  const spoken = phase === 'night' ? 'The day has ended' : phase === 'early' ? 'The day has not started yet' : `Now ${clockParts(minOf(now)).time}`;

  return (
    <View onLayout={ev => setW(ev.nativeEvent.layout.width)}>
      <View style={{ height: H }} accessible accessibilityRole="image" accessibilityLabel={`${spoken}, ${done.length} done`}>
        <Svg width={W} height={H} style={{ position: 'absolute', overflow: 'visible' }}>
          <Defs>
            <RadialGradient id="arcglow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#FFB067" stopOpacity={0.6} />
              <Stop offset="0.5" stopColor="#F08A4B" stopOpacity={0.22} />
              <Stop offset="1" stopColor="#F08A4B" stopOpacity={0} />
            </RadialGradient>
            <LinearGradient id="arcfill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#F08A4B" stopOpacity={dark ? 0.2 : 0.16} />
              <Stop offset="1" stopColor="#F08A4B" stopOpacity={0.02} />
            </LinearGradient>
            <ClipPath id="above"><Rect x={-400} y={-600} width={W + 800} height={hz + 600} /></ClipPath>
          </Defs>
          <Line x1={0} y1={hz} x2={W} y2={hz} stroke={line} strokeWidth={1} />
          <Path d={`M${x0},${hz} Q${cx},${cy} ${x1},${hz}`} fill="none" stroke={line} strokeWidth={1.5} strokeDasharray="2 6" strokeLinecap="round" />
          {p > 0 && <Path d={area} fill="url(#arcfill)" />}
          {p > 0 && <Path d={prog} fill="none" stroke={ink} strokeWidth={2} strokeLinecap="round" />}
          <Circle cx={x0} cy={hz} r={3.5} fill={t.ink3} />
          <Circle cx={x1} cy={hz} r={3.5} fill={t.ink3} />
          {phase === 'day' && <Circle cx={rx} cy={ry - raSize * 0.3} r={raSize * 1.2} fill="url(#arcglow)" />}
          {phase === 'early' && <G clipPath="url(#above)"><Circle cx={x0 + 18} cy={hz} r={raSize} fill="url(#arcglow)" /></G>}
          {phase === 'night' && <G clipPath="url(#above)"><Circle cx={x1} cy={hz} r={raSize * 1.2} fill="url(#arcglow)" opacity={0.6} /></G>}
          {doneAt.map((x, i) => {
            const [dx, dy] = B(x);
            return <Circle key={i} cx={dx} cy={dy} r={6} fill={CORAL} stroke={t.base} strokeWidth={2.5} />;
          })}
        </Svg>
        {phase === 'day' && (
          <Image {...decorative} source={poseImage('ra-icon')} resizeMode="contain"
            style={{ position: 'absolute', width: raSize, height: raSize, left: rx - raSize / 2, top: ry - raSize * 0.86 }} />
        )}
        {phase === 'early' && (
          // just under the horizon, where the day starts
          <View style={{ position: 'absolute', left: x0 - raSize * 0.2, top: hz - raSize * 0.5, width: raSize * 0.8, height: raSize * 0.5, overflow: 'hidden' }}>
            <Image {...decorative} source={poseImage('ra-icon')} resizeMode="contain" style={{ width: raSize * 0.8, height: raSize * 0.8 }} />
          </View>
        )}
        {phase === 'night' && (
          <Image {...decorative} source={poseImage('ra-rest')} resizeMode="contain"
            style={{ position: 'absolute', width: raSize, height: raSize, left: x1 - raSize * 0.7, top: hz - raSize * 0.86 }} />
        )}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
        <End time={s.time} ampm={s.ampm} label="Start" />
        {count && (
          <View style={{ alignItems: 'center', justifyContent: 'flex-end' }}>
            <View {...decorative} style={{ width: 18, height: 9, borderTopLeftRadius: 9, borderTopRightRadius: 9, backgroundColor: CORAL, marginBottom: 5 }} />
            <Text style={{ color: t.ink2, fontSize: 14, fontFamily: T.brand }}>{done.length} done</Text>
          </View>
        )}
        <End time={e.time} ampm={e.ampm} label="Day ends" right />
      </View>
    </View>
  );
}

function End({ time, ampm, label, right }: { time: string; ampm: string; label: string; right?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: right ? 'flex-end' : 'flex-start' }}>
      <Text style={{ color: t.ink, fontSize: 26, letterSpacing: -0.6, fontFamily: T.displayLight }}>
        {time}<Text style={{ color: t.ink3, fontSize: 15, letterSpacing: 0 }}> {ampm}</Text>
      </Text>
      <Text style={{ color: t.ink3, fontSize: 14, fontFamily: T.brand }}>{label}</Text>
    </View>
  );
}
