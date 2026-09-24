import { useEffect, useRef, useState } from 'react';
import { View, Text, PanResponder, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../store';
import { type as T } from '../theme';

/**
 * A length, chosen by turning a dial — the same gesture as the ring on the
 * timer screen, so choosing how long and watching it count down feel like one
 * object. It replaced rows of minute chips, which were four to six equal
 * buttons on the one screen whose job is to hand you a single thing.
 *
 * The dial moves through a list of stops rather than a linear scale, so the
 * short end — where "two minutes" and "five minutes" are genuinely different
 * answers — gets as much room as the long end. The sweep leaves a gap at the
 * top, so the longest stop can't wrap round into the shortest mid-drag.
 */

export const SESSION_STOPS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 75, 90] as const;
export const ESTIMATE_STOPS = [2, 5, 10, 15, 20, 30, 45, 60, 90, 120] as const;

const GAP = 40;                       // degrees left open at the top
const SWEEP = 360 - GAP;

/** Nearest stop, for values saved before the stops existed (e.g. 25 on an
 *  estimate list without 25). */
export function nearestStop(stops: readonly number[], v: number) {
  return stops.reduce((best, s) => Math.abs(s - v) < Math.abs(best - v) ? s : best, stops[0]);
}

export function DurationDial({
  stops, value, onChange, onRelease, size = 156, label = 'min',
}: {
  stops: readonly number[];
  value: number;
  onChange: (minutes: number) => void;
  /** after a drag ends — for callers that save once rather than on every stop */
  onRelease?: (minutes: number) => void;
  size?: number;
  label?: string;
}) {
  const t = useTheme();
  const stroke = 10;
  const r = size / 2 - stroke - 4;
  const c = size / 2;

  const indexOf = (v: number) => Math.max(0, stops.indexOf(nearestStop(stops, v)));
  const [i, setI] = useState(indexOf(value));
  useEffect(() => { setI(indexOf(value)); }, [value]);   // eslint-disable-line react-hooks/exhaustive-deps

  // PanResponder is created once; these refs keep what it reads current.
  const iRef = useRef(i);
  useEffect(() => { iRef.current = i; }, [i]);
  const cb = useRef({ onChange, onRelease });
  cb.current = { onChange, onRelease };

  /** Touch point -> stop index. 0° is straight up, clockwise, like the timer. */
  const toIndex = (e: GestureResponderEvent) => {
    const { locationX: x, locationY: y } = e.nativeEvent;
    const deg = (Math.atan2(y - c, x - c) * 180 / Math.PI + 90 + 360) % 360;
    // inside the gap, snap to whichever end is nearer
    const within = deg < GAP / 2 ? 0 : deg > 360 - GAP / 2 ? SWEEP : deg - GAP / 2;
    return Math.round((within / SWEEP) * (stops.length - 1));
  };

  const move = (e: GestureResponderEvent) => {
    const n = toIndex(e);
    if (n !== iRef.current) {
      Haptics.selectionAsync();
      iRef.current = n;
      setI(n);
      cb.current.onChange(stops[n]);
    }
  };

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    // Holding a dial shouldn't scroll the screen underneath it.
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: move,
    onPanResponderMove: move,
    onPanResponderRelease: () => cb.current.onRelease?.(stops[iRef.current]),
    onPanResponderTerminate: () => cb.current.onRelease?.(stops[iRef.current]),
  })).current;

  // screen readers and keyboards adjust it one stop at a time
  const step = (d: number) => {
    const n = Math.max(0, Math.min(stops.length - 1, iRef.current + d));
    if (n === iRef.current) return;
    iRef.current = n; setI(n);
    cb.current.onChange(stops[n]);
    cb.current.onRelease?.(stops[n]);
  };

  const frac = stops.length > 1 ? i / (stops.length - 1) : 0;
  const start = GAP / 2;
  const end = start + frac * SWEEP;
  const point = (deg: number) => {
    const a = (deg - 90) * Math.PI / 180;
    return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
  };
  const arc = (from: number, to: number) => {
    const a = point(from), b = point(to);
    const large = to - from > 180 ? 1 : 0;
    return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
  };
  const knob = point(end);

  return (
    <View
      {...pan.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Length"
      accessibilityValue={{ text: `${stops[i]} minutes` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={e => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      style={{ width: size, height: size, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' }}>
      {/* Children ignore touches, so every touch lands on this View and its
          locationX/Y are measured from the dial's own corner — a touch on the
          number would otherwise be measured from the number. */}
      <View pointerEvents="none" style={{ position: 'absolute', width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="dial" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={t.raBtn[0]} /><Stop offset="1" stopColor={t.raBtn[1]} />
          </LinearGradient>
        </Defs>
        <Path d={arc(start, start + SWEEP)} stroke={t.track} strokeWidth={stroke} strokeLinecap="round" fill="none" />
        {frac > 0 && (
          <Path d={arc(start, end)} stroke="url(#dial)" strokeWidth={stroke} strokeLinecap="round" fill="none" />
        )}
        <Circle cx={knob.x} cy={knob.y} r={stroke + 3} fill={t.card} stroke={t.ra} strokeWidth={3} />
      </Svg>
      </View>
      <View pointerEvents="none" style={{ alignItems: 'center' }}>
        {/* not selectable: on web a drag across the dial otherwise highlights the number */}
        <Text selectable={false} style={{ color: t.ink, fontSize: size * 0.24, fontFamily: T.displayLight, letterSpacing: -1 }}>
          {stops[i]}
        </Text>
        <Text selectable={false} style={{ color: t.ink3, fontSize: 11, letterSpacing: 1.6, marginTop: -2 }}>
          {label.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}
