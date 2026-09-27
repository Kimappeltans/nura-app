import { inWorld } from '../src/world';
import { goBack } from '../src/nav';
import { withTabs } from '../src/components/WithTabs';
import { useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Primary, Mica } from '../src/ui';
import { useStore, useTheme } from '../src/store';
import { retroCapture } from '../src/db';
import { radius, type as T } from '../src/theme';

/**
 * Add what you did: the things that got done and never got written down.
 *
 * An ADHD day usually contains real work that never got logged, which is exactly
 * why the day feels empty. Backdating it repairs the record instead of arguing
 * with the feeling — and it pays, because work you forgot to write down was
 * still work.
 */
function Retro() {
  // Opened from the 20:00 reminder it's the afternoon; from the Calendar it
  // can be any time of day, so what you log is dated to the middle of the
  // stretch that's just gone.
  const since = (() => {
    const h = new Date().getHours();
    const at = (hh: number) => new Date().setHours(hh, 0, 0, 0);
    if (h < 12) return { backdate: Math.min(Date.now(), at(Math.max(0, h - 1))) };
    if (h < 17) return { backdate: at(Math.max(12, h - 1)) };
    return { backdate: at(15) };
  })();

  const t = useTheme();
  const [text, setText] = useState('');
  const refresh = useStore(s => s.refresh);
  const celebrate = useStore(s => s.celebrate);

  const save = async () => {
    const { count, light } = await retroCapture(text.split('\n'), since.backdate);
    await refresh();
    if (count) {
      celebrate({
        base: light, bonus: { n: 0, label: null, golden: false },
        total: light, reason: 'retro',
      });
    }
    goBack();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }} edges={['top']}>
      <Mica />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 2 }}>
        <Pressable onPress={() => goBack()} hitSlop={12} accessibilityRole="button" style={{ paddingVertical: 10 }}>
          <Text style={{ color: t.ink3, fontSize: 16, fontFamily: T.brand }}>← Back</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24, gap: 14 }} keyboardShouldPersistTaps="handled">
        {/* a plain title, not a question to answer for yourself */}
        <Text style={{ color: t.ink, fontSize: 34, lineHeight: 36, fontFamily: T.display, letterSpacing: -1.5 }}>
          Add what you did
        </Text>
        <Text style={{ color: t.ink3, fontSize: 14, lineHeight: 20 }}>One per line.</Text>

        {/* a card: a fill and a hairline, so it reads as a place to write */}
        <View style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: t.stroke, backgroundColor: t.card }}>
          <TextInput
            autoFocus multiline value={text} onChangeText={setText}
            placeholder={'emailed the registrar\nfound the bike pump\n10 min of reading'}
            placeholderTextColor={t.ink3}
            style={{
              minHeight: 190, textAlignVertical: 'top',
              color: t.ink, fontSize: 16.5, lineHeight: 27, padding: 16,
            }}
          />
        </View>

        {/* the button sits right under the field it acts on, not across a gap */}
        <View style={{ gap: 10, marginTop: 2 }}>
          <Primary label="Log it all" tone="ra" onPress={save} disabled={!text.trim()} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default inWorld('mixed', withTabs(Retro));
