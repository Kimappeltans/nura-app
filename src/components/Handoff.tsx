import { useId, useState } from 'react';
import { View, Image } from 'react-native';
import Svg, { Circle, Path, Line, Defs, RadialGradient, Stop, LinearGradient as SvgLinearGradient } from 'react-native-svg';
import { useTheme } from '../store';
import { poseImage } from '../ui';

const CORAL = '#FF6B35';

/**
 * The sun, as in the opening: a soft halo, twelve rays and a disc from pale
 * gold into sunrise orange. `half` keeps the top half, rising on a horizon.
 */
export function Sun({ size, half, glow = '#FFB067' }: { size: number; half?: boolean; glow?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const r = size / 2, disc = size * 0.42;
  const rayIn = disc / 2 + size * 0.07, rayOut = r * 0.9;
  return (
    <View style={{ width: size, height: half ? r + 2 : size, overflow: 'hidden' }}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={`halo${id}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={glow} stopOpacity={0.6} />
            <Stop offset="0.45" stopColor={glow} stopOpacity={0.22} />
            <Stop offset="1" stopColor={glow} stopOpacity={0} />
          </RadialGradient>
          <SvgLinearGradient id={`disc${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFF0D6" />
            <Stop offset="0.5" stopColor="#FFB067" />
            <Stop offset="1" stopColor="#FF7A3D" />
          </SvgLinearGradient>
        </Defs>
        <Circle cx={r} cy={r} r={r} fill={`url(#halo${id})`} />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * Math.PI) / 6;
          return (
            <Line key={i} x1={r + rayIn * Math.cos(a)} y1={r + rayIn * Math.sin(a)}
              x2={r + rayOut * Math.cos(a)} y2={r + rayOut * Math.sin(a)}
              stroke={CORAL} strokeOpacity={0.45} strokeWidth={Math.max(2, size / 110)} strokeLinecap="round" />
          );
        })}
        <Circle cx={r} cy={r} r={disc / 2} fill={`url(#disc${id})`} />
      </Svg>
    </View>
  );
}

/**
 * FOCUS: Nu hands the one thing to Ra (guidelines/components/overview.md).
 * The sun rising on a horizon, Ra standing in it, Nu at the left, and a
 * dotted line from one to the other.
 */
export function Handoff({ height = 250 }: { height?: number }) {
  const t = useTheme();
  const [w, setW] = useState(342);
  return (
    <View style={{ height, overflow: 'hidden' }} onLayout={e => setW(e.nativeEvent.layout.width)} pointerEvents="none">
      <View style={{ position: 'absolute', left: (w - 348) / 2, bottom: 0 }}>
        <Sun size={340} half />
      </View>
      <Svg width={w} height={height} style={{ position: 'absolute' }}>
        <Path d={`M${w * 0.2} ${height - 60} C ${w * 0.29} ${height - 130}, ${w * 0.41} ${height - 140}, ${w * 0.5} ${height - 100}`}
          fill="none" stroke={t.ink3} strokeWidth={1.6} strokeDasharray="1 6" strokeLinecap="round" />
      </Svg>
      <Image source={poseImage('nu-hello')} resizeMode="contain"
        style={{ position: 'absolute', left: 0, bottom: 0, width: 84, height: 84 }} />
      <Image source={poseImage('ra-hello')} resizeMode="contain"
        style={{ position: 'absolute', left: w * 0.52 - 85, bottom: -6, width: 170, height: 170 }} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1.5, backgroundColor: t.ink }} />
    </View>
  );
}
