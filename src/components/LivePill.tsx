import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useStore, useTheme } from '../store';
import { type as T } from '../theme';
import { poseImage } from '../ui';
import { announce, decorative, spokenDuration } from '../a11y';
import { backToSession } from '../nav';

const CORAL = '#FF6B35';

const mmss = (secs: number) => `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;

/**
 * THE IN-PROGRESS PILL (guidelines/components/overview.md). A session you left
 * with ⌄ keeps running; this sits above the tab bar in every room — Ra resting
 * in a ring of how far along it is, the task, the time, and pause. Tap it to go
 * back to the session.
 */
export function LivePill() {
  const t = useTheme();
  const running = useStore(s => s.running);
  const pause = useStore(s => s.pauseRunning);
  const resume = useStore(s => s.resumeRunning);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running || running.pausedAt) return;
    const id = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [running?.id, running?.pausedAt]);

  const at = running ? running.pausedAt ?? Date.now() : 0;
  const left = running?.endAt ? Math.max(0, Math.round((running.endAt - at) / 1000)) : null;
  // a screen reader hears the pill change state, not every second of it
  const state = !running ? null : running.pausedAt ? 'paused' : left === 0 ? 'up' : 'running';
  const seen = useRef<{ id: string; state: string } | null>(null);
  useEffect(() => {
    if (!running || !state) { seen.current = null; return; }
    const prev = seen.current;
    seen.current = { id: String(running.id), state };
    if (!prev) return;                                   // already running when it appeared
    if (prev.id !== String(running.id)) announce(`${running.title} started`);
    else if (prev.state === state) return;
    else if (state === 'paused') announce('Paused');
    else if (state === 'up') announce(`Time’s up: ${running.title}`);
    else announce('Resumed');
  }, [running?.id, state]);                              // eslint-disable-line react-hooks/exhaustive-deps

  if (!running) return null;

  const elapsed = Math.max(0, Math.round((at - running.startedAt) / 1000));
  const progress = running.endAt ? Math.min(1, 1 - (left ?? 0) / Math.max(1, running.span)) : Math.min(1, elapsed / (25 * 60));
  const line = running.pausedAt ? 'Paused'
    : left === 0 ? 'Time’s up'
    : left != null ? `${mmss(left)} left` : `${mmss(elapsed)} so far`;
  const spoken = running.pausedAt ? 'Paused'
    : left === 0 ? 'Time’s up'
    : left != null ? `${spokenDuration(left)} left` : `${spokenDuration(elapsed)} so far`;
  const dark = t.key === 'nu';
  const C = 2 * Math.PI * 20;

  return (
    <View style={{
      minHeight: 62, borderRadius: 31, flexDirection: 'row', alignItems: 'center', paddingRight: 8, marginBottom: 10,
      backgroundColor: dark ? '#1E2652' : '#1B1830', borderWidth: 1, borderColor: dark ? t.stroke : 'transparent',
    }}>
    <Pressable onPress={() => backToSession(running)}
      accessibilityRole="button" accessibilityLabel={`${running.title}, ${spoken}. Back to the session`}
      style={({ pressed }) => ({ flex: 1, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 8, paddingRight: 12, opacity: pressed ? 0.85 : 1 })}>
      <View {...decorative} style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={46} height={46} style={{ position: 'absolute' }}>
          <Circle cx={23} cy={23} r={20} fill="none" stroke="rgba(242,244,251,0.16)" strokeWidth={3} />
          <Circle cx={23} cy={23} r={20} fill="none" stroke={CORAL} strokeWidth={3} strokeLinecap="round"
            strokeDasharray={`${C * progress} ${C}`} transform="rotate(-90 23 23)" />
        </Svg>
        <Image source={poseImage('ra-rest')} style={{ width: 34, height: 34, marginTop: 2 }} resizeMode="contain" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: '#F2F4FB', fontSize: 15, fontFamily: T.display, letterSpacing: -0.2 }}>{running.title}</Text>
        <Text style={{ color: 'rgba(242,244,251,0.62)', fontSize: 12.5, fontFamily: T.brand, marginTop: 2 }}>{line}</Text>
      </View>
    </Pressable>
      <Pressable onPress={() => { Haptics.selectionAsync(); running.pausedAt ? resume() : pause(); }} hitSlop={6}
        accessibilityRole="button" accessibilityLabel={running.pausedAt ? 'Resume' : 'Pause'}
        style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: CORAL, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={18} height={18} viewBox="0 0 24 24">
          {running.pausedAt
            ? <Path d="M8 5.5v13l10.5-6.5z" fill="#3B1204" />
            : <><Rect x={5.5} y={4} width={4.5} height={16} rx={1.6} fill="#3B1204" /><Rect x={14} y={4} width={4.5} height={16} rx={1.6} fill="#3B1204" /></>}
        </Svg>
      </Pressable>
    </View>
  );
}
