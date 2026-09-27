import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '../store';
import { useReducedMotion, decorative } from '../a11y';

/**
 * Your voice, as Nu hears it — a grid of dots (design v5, 7:14 Tell Nu).
 * Columns rise and fall while listening; still, and all dim, when not.
 */
export function DotWave({ active, width, cols = 15, rows = 11 }: { active: boolean; width: number; cols?: number; rows?: number }) {
  const t = useTheme();
  const mid = Math.floor(rows / 2);
  const [amp, setAmp] = useState<number[]>(() => Array(cols).fill(0));
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!active) { setAmp(Array(cols).fill(0)); return; }
    // Reduce Motion: lit, so it still says "listening", but it holds still
    if (reduce) {
      setAmp(Array.from({ length: cols }, (_, i) => Math.round(Math.min(mid + 1, 1 + Math.min(i, cols - 1 - i)) / 2)));
      return;
    }
    const id = setInterval(() => setAmp(a => a.map((_, i) => {
      const edge = Math.min(i, cols - 1 - i);
      return Math.max(0, Math.round(Math.random() * Math.min(mid + 1, 1 + edge)));
    })), 160);
    return () => clearInterval(id);
  }, [active, cols, mid, reduce]);
  const gap = 7;
  const dot = Math.max(8, (width - gap * (cols - 1)) / cols);
  const dark = t.key === 'nu';
  const off = dark ? '#1E2652' : '#E8E1D2';
  const on = dark ? '#AEB6D4' : '#4A4340';
  const hi = '#FF6B35';
  return (
    <View style={{ gap }} {...decorative}>
      {Array.from({ length: rows }, (_, r) => (
        <View key={r} style={{ flexDirection: 'row', gap }}>
          {amp.map((a, c) => {
            const d = Math.abs(r - mid);
            const lit = active && d <= a;
            return <View key={c} style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: lit ? (d <= a - 2 ? hi : on) : off }} />;
          })}
        </View>
      ))}
    </View>
  );
}
