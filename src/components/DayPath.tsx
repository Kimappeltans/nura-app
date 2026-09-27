import { useState } from 'react';
import { View, Text, Image, type ViewStyle } from 'react-native';
import Svg, { Path, Line, Circle, Rect, Defs, RadialGradient, Stop, LinearGradient as SvgLinearGradient } from 'react-native-svg';
import { useStore, useTheme } from '../store';
import { type as T } from '../theme';
import { poseImage } from '../ui';

const CORAL = '#FF6B35';

const clock = (min: number) => {
  const h = Math.floor(min / 60) % 24, m = Math.round(min % 60);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}`;
};

/**
 * THE DAY'S PATH (guidelines/components/overview.md). The sun's path from the
 * start of the day to when it ends: solid while the day runs, dotted below the
 * horizon either side. Ra rides it at the current time; coral dots are where
 * things got done; indigo ticks under the horizon are calendar events. Once
 * the day has ended, Ra sits down at the horizon.
 */
export function DayPath({ done = [], events = [], nu, height = 118, style }: {
  /** when things were done today (ms) */
  done?: number[];
  /** when today's calendar events start (ms) */
  events?: number[];
  /** Nu at the water, where the day starts (Your Day) */
  nu?: boolean;
  height?: number;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const dayEndMin = useStore(s => s.dayEndMin);
  // where the path starts: the Day starts setting, as its end is Day ends
  const pathStart = useStore(s => s.dayStartMin);
  const [W, setW] = useState(342);
  const dark = t.key === 'nu';
  const H = height, hz = H - 34, A = H - 58, x0 = 34, x1 = W - 34;

  // minutes since midnight, carried past midnight when the day runs that late
  const minOf = (ms: number) => {
    const d = new Date(ms), m = d.getHours() * 60 + d.getMinutes();
    return dayEndMin > 24 * 60 && m < pathStart ? m + 24 * 60 : m;
  };
  const pOf = (ms: number) => (minOf(ms) - pathStart) / (dayEndMin - pathStart);
  const xAt = (p: number) => x0 + p * (x1 - x0);
  const yAt = (p: number) => hz - A * Math.sin(Math.PI * p);

  const now = pOf(Date.now());
  const ended = now > 1;
  const raP = Math.max(0, Math.min(1, now));

  const ink = dark ? '#AEB6D4' : t.ink;
  const dim = dark ? 'rgba(170,185,255,0.30)' : 'rgba(23,19,19,0.28)';
  let d = '';
  for (let i = 0; i <= 80; i++) d += `${i ? 'L' : 'M'}${xAt(i / 80).toFixed(1)} ${yAt(i / 80).toFixed(1)}`;
  const below = [1, 2, 3, 4, 5, 6, 7].flatMap(i => [-i * 0.018, 1 + i * 0.018]);

  const raSize = ended ? 104 : 66;
  return (
    <View style={style} onLayout={e => setW(e.nativeEvent.layout.width)}>
      <View style={{ height: H }}>
        <Svg width={W} height={H} style={{ position: 'absolute' }}>
          <Defs>
            {/* the sunrise: warm light low on the horizon, fading up the sky */}
            <SvgLinearGradient id="dawn" x1="0" y1="1" x2="0" y2="0">
              <Stop offset="0" stopColor="#FF8A5C" stopOpacity={dark ? 0.28 : 0.22} />
              <Stop offset="1" stopColor="#FFB067" stopOpacity={0} />
            </SvgLinearGradient>
            {/* and the glow around Ra, the sun on the path */}
            <RadialGradient id="raglow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#FFB067" stopOpacity={0.55} />
              <Stop offset="0.5" stopColor="#FF8A5C" stopOpacity={0.18} />
              <Stop offset="1" stopColor="#FF8A5C" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Path d={`${d}L${xAt(1).toFixed(1)} ${hz}L${xAt(0).toFixed(1)} ${hz}Z`} fill="url(#dawn)" />
          {!ended && <Circle cx={xAt(raP)} cy={yAt(raP) - raSize * 0.28} r={raSize * 0.95} fill="url(#raglow)" />}
          <Line x1={0} y1={hz} x2={W} y2={hz} stroke={dim} strokeWidth={1.2} />
          <Path d={d} fill="none" stroke={ink} strokeWidth={2} strokeLinecap="round" opacity={ended ? 0.45 : 0.9} />
          {below.map((p, i) => <Circle key={i} cx={xAt(p)} cy={yAt(p)} r={1.6} fill={dim} />)}
          <Circle cx={xAt(0)} cy={hz} r={4} fill={ink} />
          <Circle cx={xAt(1)} cy={hz} r={4} fill={ink} />
          {events.map(pOf).filter(p => p >= 0 && p <= 1).map((p, i) => (
            <Rect key={i} x={xAt(p) - 1} y={hz + 6} width={2} height={9} rx={1} fill={t.ink3} />
          ))}
          {done.map(pOf).filter(p => p >= 0 && p <= 1).map((p, i) => (
            <Circle key={i} cx={xAt(p)} cy={yAt(p)} r={6} fill={CORAL} stroke={t.base} strokeWidth={2.5} />
          ))}
          {!ended && <Line x1={xAt(raP)} y1={yAt(raP)} x2={xAt(raP)} y2={hz} stroke={ink} strokeWidth={1.2} strokeDasharray="2 3" />}
        </Svg>
        {nu && (
          <Image source={poseImage('nu-hello')} resizeMode="contain"
            style={{ position: 'absolute', width: 44, height: 44, left: xAt(0) - 32, top: hz - 31 }} />
        )}
        {/* Ra on the path — or, once the day has ended, sitting down at the horizon */}
        <Image source={poseImage(ended ? 'ra-rest' : 'ra-icon')} resizeMode="contain"
          style={{
            position: 'absolute', width: raSize, height: raSize,
            left: (ended ? xAt(1) - 20 : xAt(raP)) - raSize / 2,
            top: (ended ? hz + 4 : yAt(raP)) - raSize * (ended ? 0.88 : 0.78),
          }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 8 }}>
        <Ends value={clock(pathStart)} label="Start" />
        <View style={{ alignItems: 'center' }}>
          <Svg width={26} height={18} viewBox="-13 -16 26 18">
            {[0, 1, 2, 3, 4, 5, 6].map(k => {
              const a = Math.PI * k / 6;
              return <Circle key={k} cx={-Math.cos(a) * 11} cy={-Math.sin(a) * 11} r={1.6} fill={CORAL} />;
            })}
            <Circle cx={0} cy={0} r={5} fill={CORAL} />
          </Svg>
          <Text style={{ color: t.ink3, fontSize: 12, fontFamily: T.brand, marginTop: 4 }}>{done.length} done</Text>
        </View>
        <Ends value={clock(dayEndMin)} label="Day ends" right />
      </View>
    </View>
  );
}

function Ends({ value, label, right }: { value: string; label: string; right?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: right ? 'flex-end' : 'flex-start' }}>
      <Text style={{ color: t.ink, fontSize: 22, letterSpacing: -0.7, fontFamily: T.displayLight }}>{value}</Text>
      <Text style={{ color: t.ink3, fontSize: 12, fontFamily: T.brand, marginTop: 3 }}>{label}</Text>
    </View>
  );
}
