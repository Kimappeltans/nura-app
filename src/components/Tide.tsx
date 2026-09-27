import { useEffect, useRef } from 'react';
import { View, Animated, Easing, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useReducedMotion, decorative } from '../a11y';

/** The surface of Nu's water on Your Tasks, drifting: the waterline slowly
 *  moves left, a fainter one behind it moves right. Still under Reduce Motion. */
export function Tide({ width, fill, line, backFill, height = 28 }:
  { width: number; fill: string; line: string; backFill?: string; height?: number }) {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  // one wave is a quarter of the width, so sliding by one wave loops seamlessly
  const period = width / 4;
  const still = useReducedMotion();

  useEffect(() => {
    if (still) return;
    // one timing per loop, like the opening's sea, so a lap never catches
    const drift = (v: Animated.Value, ms: number, from: number, to: number) => {
      v.setValue(from);
      return Animated.loop(Animated.timing(v, { toValue: to, duration: ms, easing: Easing.linear, useNativeDriver: true }));
    };
    const loops = [drift(a, 5200, 0, -period), drift(b, 8400, -period, 0)];
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [a, b, period, still]);

  const W = width + period;
  const path = (y: number, crest: number) => {
    const seg = period / 2;
    let d = `M0 ${y} Q ${seg / 2} ${crest} ${seg} ${y}`;
    for (let x = seg * 2; x <= W + 0.5; x += seg) d += ` T ${x} ${y}`;
    return d;
  };
  const slide = (v: Animated.Value) => ({
    position: 'absolute' as const, top: 0, left: 0, transform: [{ translateX: v }],
    ...(Platform.OS === 'web' ? { willChange: 'transform' } as object : {}),
  });
  const front = path(14, 5), back = path(11, 4);

  return (
    <View pointerEvents="none" {...decorative} style={{ position: 'absolute', left: 0, top: 0, width, height, overflow: 'hidden' }}>
      <Animated.View style={slide(b)}>
        <Svg width={W} height={height}>
          {!!backFill && <Path d={`${back} V ${height} H 0 Z`} fill={backFill} />}
          <Path d={back} fill="none" stroke={line} strokeOpacity={0.45} strokeWidth={1.2} />
        </Svg>
      </Animated.View>
      <Animated.View style={slide(a)}>
        <Svg width={W} height={height}>
          <Path d={`${front} V ${height} H 0 Z`} fill={fill} />
          <Path d={front} fill="none" stroke={line} strokeWidth={1.6} />
        </Svg>
      </Animated.View>
    </View>
  );
}

/** Under the surface: the odd bubble rising (the "alive" board). Nothing
 *  under Reduce Motion. */
const BUBBLES = [{ x: 0.88, s: 10, ms: 7000, at: 0 }, { x: 0.08, s: 7, ms: 8200, at: 2400 }, { x: 0.52, s: 5, ms: 6400, at: 4300 }];

export function Bubbles({ width }: { width: number }) {
  const rise = useRef(BUBBLES.map(() => new Animated.Value(0))).current;
  const still = useReducedMotion();

  useEffect(() => {
    if (still) { rise.forEach(v => v.setValue(0)); return; }
    const loops = BUBBLES.map((b, i) => Animated.loop(Animated.sequence([
      Animated.delay(b.at),
      Animated.timing(rise[i], { toValue: 1, duration: b.ms, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(rise[i], { toValue: 0, duration: 0, useNativeDriver: true }),
    ])));
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [rise, still]);

  return (
    <View pointerEvents="none" {...decorative} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden' }}>
      {BUBBLES.map((b, i) => (
        <Animated.View key={i} style={{
          position: 'absolute', left: width * b.x, bottom: 24, width: b.s, height: b.s, borderRadius: b.s / 2,
          borderWidth: 1.2, borderColor: 'rgba(184,229,248,0.55)', backgroundColor: 'rgba(184,229,248,0.10)',
          opacity: rise[i].interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 0.8, 0] }),
          transform: [{ translateY: rise[i].interpolate({ inputRange: [0, 1], outputRange: [0, -280] }) }],
        }}>
          <View style={{ position: 'absolute', left: b.s * 0.2, top: b.s * 0.15, width: b.s * 0.3, height: b.s * 0.3, borderRadius: b.s, backgroundColor: 'rgba(255,255,255,0.7)' }} />
        </Animated.View>
      ))}
    </View>
  );
}
