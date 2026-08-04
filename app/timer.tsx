import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useTheme, useStore } from '../src/store';
import { complete, logEvent, capture, dropCrumb } from '../src/db';
import { reconcileNudges } from '../src/notifications';
import { Primary, Ghost } from '../src/ui';
import { type as T, copy } from '../src/theme';

const FIVE = 5 * 60;
const R = 89, C = 2 * Math.PI * R;

/**
 * The 5-minute contract.
 *
 * At five minutes it asks permission to STOP, with "keep going" as the loud
 * option. Counter-intuitively that's what makes starting cheap: quitting is
 * allowed, so beginning costs nothing.
 *
 * And stopping early still logs a win. Time spent is the achievement, not task
 * completion — the most important behaviour in the app.
 */
export default function Timer() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const refresh = useStore(s => s.refresh);
  const now = useStore(s => s.now);
  const [left, setLeft] = useState(FIVE);
  const [asking, setAsking] = useState(false);
  const [catching, setCatching] = useState(false);
  const [thought, setThought] = useState('');
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const run = (secs: number) => {
    setLeft(secs); setAsking(false);
    if (tick.current) clearInterval(tick.current);
    tick.current = setInterval(() => {
      setLeft(s => {
        if (s <= 1) {
          clearInterval(tick.current!);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setAsking(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    if (id) logEvent('started', id);
    (globalThis as any).__nuraRunning?.(id ?? null);
    run(FIVE);
    return () => {
      if (tick.current) clearInterval(tick.current);
      (globalThis as any).__nuraRunning?.(null);
    };
  }, [id]);

  const finish = async (partial: boolean) => {
    if (tick.current) clearInterval(tick.current);
    (globalThis as any).__nuraRunning?.(null);
    if (id) await complete(id, partial);
    await refresh();
    await reconcileNudges();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  const stash = async () => {
    if (!thought.trim()) return;
    await capture(thought);          // straight into Nu; the clock keeps running
    setThought(''); setCatching(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const total = asking ? 1 : left / FIVE;
  const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 8 }}>
        <Text style={{ color: t.ink, fontSize: 20, fontFamily: T.display }}>{now?.title ?? 'Focus'}</Text>
        <Text style={{ color: t.ink3, fontSize: 12, marginBottom: 22 }}>Phone quiet · five minutes</Text>

        {/* an analog ring, not digits — a shrinking arc is felt, "4:12" is read and forgotten */}
        <View style={{ width: 206, height: 206, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={206} height={206} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
            <Defs>
              <LinearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={t.ra} /><Stop offset="1" stopColor={t.raSoft} />
              </LinearGradient>
            </Defs>
            <Circle cx={103} cy={103} r={R} stroke={t.track} strokeWidth={8} fill="none" />
            <Circle cx={103} cy={103} r={R} stroke="url(#g)" strokeWidth={8} fill="none"
              strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - total)} />
          </Svg>
          <Text style={{ color: t.ink, fontSize: 40, fontFamily: T.displayLight }}>{mm}:{ss}</Text>
          <Text style={{ color: t.ink3, fontSize: 11, letterSpacing: 1.5, marginTop: 6 }}>
            {asking ? 'COMPLETE' : 'REMAINING'}
          </Text>
        </View>

        {/* a thought arrives mid-task. one tap parks it in Nu without leaving Ra —
            the alternative is how a five-minute task becomes a forty-minute detour */}
        {catching ? (
          <View style={{ width: '100%', marginTop: 8 }}>
            <TextInput
              autoFocus value={thought} onChangeText={setThought}
              onSubmitEditing={stash} returnKeyType="done"
              placeholder="park it and keep going…" placeholderTextColor={t.ink3}
              style={{
                color: t.ink, fontSize: 15, paddingVertical: 12, paddingHorizontal: 13,
                backgroundColor: t.card, borderRadius: 8,
                borderWidth: 1, borderColor: t.strokeStrong, borderBottomColor: t.nu, borderBottomWidth: 2,
              }}
            />
          </View>
        ) : (
          <Pressable onPress={() => setCatching(true)} hitSlop={10} style={{ marginTop: 8 }}>
            <Text style={{ color: t.ink3, fontSize: 13.5 }}>+ a thought just arrived</Text>
          </Pressable>
        )}

        <View style={{ width: '100%', gap: 8, marginTop: 20 }}>
          {asking ? (
            <>
              <Text style={{ color: t.ink2, fontSize: 14, textAlign: 'center', marginBottom: 6 }}>
                {copy.contract}
              </Text>
              <Primary label="Keep going · 10 more" tone="ra" onPress={() => run(10 * 60)} />
              {/* stopping on purpose is not the same as not starting */}
              <Ghost label={copy.stop} onPress={() => finish(true)} />
            </>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Ghost label="Stop" onPress={async () => {
                if (id) await dropCrumb(id, thought.trim() || undefined);
                finish(true);
              }} />
              <Ghost label="Done" onPress={() => finish(false)} />
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
