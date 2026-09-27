import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../store';
import { Primary, Mica, Character } from '../ui';
import { type as T } from '../theme';
import { setFlag } from '../db';
import { FooterLink } from '../components/OnbFrame';
import { requestPermission, setupSchedules } from '../notifications';

/**
 * Only for people who said "remembering things" gets in the way. One plain
 * sentence about what the reminders are like BEFORE the system prompt, so the
 * yes/no in iOS's dialog is an informed one — and "not now" is a real answer
 * (Nu can still ask later, in context).
 */
export default function RemindAsk({ onDone }: { onDone: (yes: boolean) => void }) {
  const t = useTheme();

  const answer = async (yes: boolean) => {
    await setFlag('notif_asked', '1');
    let granted = false;
    if (yes) {
      granted = await requestPermission();
      if (granted) await setupSchedules();
    }
    onDone(granted);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Mica />
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 12 }}>
        <Text style={{ color: t.ink3, fontSize: 12, letterSpacing: 1.8, fontFamily: T.brand }}>REMINDERS</Text>

        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 18 }}>
          <Character name="nu-thinking" size={120} motion="greet" />
          <Text accessibilityRole="header" style={{
            color: t.ink, fontSize: 30, lineHeight: 36, fontFamily: T.display,
            letterSpacing: -0.8, textAlign: 'center',
          }}>Want a nudge{'\n'}now and then?</Text>
        </View>

        <View style={{ gap: 14 }}>
          <Primary label="Yes, remind me" tone="ra" onPress={() => answer(true)} />
          <FooterLink label="Not now" onPress={() => answer(false)} />
        </View>
      </View>
    </SafeAreaView>
  );
}
