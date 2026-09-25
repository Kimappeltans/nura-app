import { useState } from 'react';
import { View, Image } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '../store';
import { poseImage } from '../ui';

const CORAL = '#FF6B35';

/** A sun drawn in dots: rings of dots, smaller and fainter outward. `half` keeps the top half (on a horizon). */
export function DotSun({ size, color = CORAL, half }: { size: number; color?: string; half?: boolean }) {
  const r0 = size / 2;
  const rings = [0, 0.13, 0.24, 0.35, 0.46, 0.57, 0.67, 0.78, 0.89, 1].map(f => f * r0);
  const dots: { x: number; y: number; r: number; o: number }[] = [];
  rings.forEach((r, i) => {
    const n = r ? Math.round((2 * Math.PI * r) / (size / 20)) : 1;
    const dotR = r ? Math.max(size / 212, (size / 55) - i * (size / 680)) : size / 20;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + i * 0.3;
      const x = r * Math.cos(a), y = r * Math.sin(a);
      if (half && y > 2) continue;
      dots.push({ x, y, r: dotR, o: 1 - i * 0.075 });
    }
  });
  const h = half ? r0 + 4 : size + 8;
  return (
    <Svg width={size + 8} height={h} viewBox={`${-r0 - 4} ${-r0 - 4} ${size + 8} ${h}`}>
      {dots.map((d, i) => <Circle key={i} cx={d.x} cy={d.y} r={d.r} fill={color} opacity={d.o} />)}
    </Svg>
  );
}

/**
 * FOCUS: Nu hands the one thing to Ra (guidelines/components/overview.md).
 * A sun made of dots on a horizon, Ra standing in it, Nu at the left, and a
 * dotted line from one to the other.
 */
export function Handoff({ height = 250 }: { height?: number }) {
  const t = useTheme();
  const [w, setW] = useState(342);
  return (
    <View style={{ height, overflow: 'hidden' }} onLayout={e => setW(e.nativeEvent.layout.width)} pointerEvents="none">
      <View style={{ position: 'absolute', left: (w - 348) / 2, bottom: 0 }}>
        <DotSun size={340} half />
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
