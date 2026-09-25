import { useEffect, useState } from 'react';
import { View, Text, Pressable, Platform, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../store';
import { getFlag, setFlag, getBlockers } from '../db';
import { requestPermission, setupSchedules } from '../notifications';
import { radius, type as T } from '../theme';
import { Surface } from '../ui';

/**
 * The few things home still asks, each once and in context — at most one
 * at a time:
 *   - in the evening, for someone who said "getting back on track" is what
 *     they need: what did you actually do today? (promised in onboarding);
 *   - once there's something on the list: would you like a nudge now and
 *     then? (iPhone only — the web can't send them).
 * `taskCount` is how much is on the list; `style` places the card.
 */
export function HomeAsks({ taskCount, style }: { taskCount: number; style?: ViewStyle }) {
  const t = useTheme();
  const [askNudge, setAskNudge] = useState(false);
  const [eveningAsk, setEveningAsk] = useState(false);
  const eveningKey = `evening.asked.${new Date().toDateString()}`;

  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'web' && !(await getFlag('notif_asked')) && taskCount >= 1) setAskNudge(true);
    })();
  }, [taskCount]);

  useEffect(() => {
    (async () => {
      if (new Date().getHours() < 18 || (await getFlag(eveningKey))) return;
      setEveningAsk((await getBlockers()).includes('returning'));
    })();
  }, [eveningKey]);

  const answerNudge = async (yes: boolean) => {
    setAskNudge(false);
    await setFlag('notif_asked', '1');
    if (yes && await requestPermission()) await setupSchedules();
  };
  const closeEvening = async (log: boolean) => {
    setEveningAsk(false);
    await setFlag(eveningKey, '1');
    if (log) router.push('/retro');
  };

  if (eveningAsk) {
    return (
      <AskCard accent="ra" style={style} text="What did you actually do today?"
        sub="Small things count — they’re usually the ones that never get written down."
        no="Not tonight" yes="Log it" onNo={() => closeEvening(false)} onYes={() => closeEvening(true)}
        yesColor={t.ra} yesInk={t.onRa} />
    );
  }
  if (askNudge) {
    return (
      <AskCard style={style} sub="Want a nudge now and then? They get quieter if you’re not answering."
        no="No thanks" yes="Yes" onNo={() => answerNudge(false)} onYes={() => answerNudge(true)}
        yesColor={t.nu} yesInk={t.key === 'nu' ? '#0B1029' : t.onNu} />
    );
  }
  return null;
}

/** One quiet ask: a line, a way out, and one button. */
function AskCard({ accent, style, text, sub, no, yes, onNo, onYes, yesColor, yesInk }: {
  accent?: 'ra'; style?: ViewStyle; text?: string; sub: string; no: string; yes: string;
  onNo: () => void; onYes: () => void; yesColor: string; yesInk: string;
}) {
  const t = useTheme();
  return (
    <Surface accent={accent} style={style}>
      <View style={{ padding: 14, gap: 10 }}>
        {!!text && <Text style={{ color: t.ink, fontSize: 15.5, fontFamily: T.brand }}>{text}</Text>}
        <Text style={{ color: t.ink2, fontSize: 14, lineHeight: 19 }}>{sub}</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable onPress={onNo} hitSlop={8} style={{ paddingVertical: 8 }}>
            <Text style={{ color: t.ink3, fontSize: 13.5 }}>{no}</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Pressable onPress={onYes}
              style={{ paddingVertical: 10, borderRadius: radius.pill, backgroundColor: yesColor, alignItems: 'center' }}>
              <Text style={{ color: yesInk, fontSize: 14, fontFamily: T.brand }}>{yes}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Surface>
  );
}
