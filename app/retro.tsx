import { useState } from 'react';
import { View, Text, TextInput, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Primary, Ghost, Mica, Surface } from '../src/ui';
import { useStore, useTheme } from '../src/store';
import { retroCapture } from '../src/db';
import { radius, type as T } from '../src/theme';

/**
 * The evening anchor asks the wrong question. Not "what will you do" but
 * "what did you actually do?"
 *
 * An ADHD day usually contains real work that never got logged, which is exactly
 * why the day feels empty. Backdating it repairs the record instead of arguing
 * with the feeling — and it pays, because work you forgot to write down was
 * still work.
 */
export default function Retro() {
  // Opened from the 20:00 reminder it's the afternoon being asked about; from
  // the link in Nu it can be any time of day, so the question follows the
  // clock, and what you log is dated to the middle of that stretch.
  const since = (() => {
    const h = new Date().getHours();
    const at = (hh: number) => new Date().setHours(hh, 0, 0, 0);
    if (h < 12) return { phrase: 'this morning', backdate: Math.min(Date.now(), at(Math.max(0, h - 1))) };
    if (h < 17) return { phrase: 'so far today', backdate: at(Math.max(12, h - 1)) };
    return { phrase: 'since lunch', backdate: at(15) };
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
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Mica />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
        <Text style={{ color: t.ink, fontSize: 27, fontFamily: T.display, lineHeight: 35, letterSpacing: -0.6 }}>
          What did you actually do{'\n'}{since.phrase}?
        </Text>
        <Text style={{ color: t.ink3, fontSize: 14, lineHeight: 20 }}>
          One per line. Nothing is too small — answering an email counts, so does
          getting out of the house.
        </Text>

        {/* A raised surface with an accent edge, so it reads as somewhere to
            START rather than a hole in the page. A bare field with a hairline
            on a dark ground is indistinguishable from empty space, which is a
            bad invitation on the one screen whose whole job is to invite. */}
        <Surface accent="ra">
          <TextInput
            autoFocus multiline value={text} onChangeText={setText}
            placeholder={'emailed the registrar\nfound the bike pump\n10 min of reading'}
            placeholderTextColor={t.ink3}
            style={{
              minHeight: 190, textAlignVertical: 'top',
              color: t.ink, fontSize: 16.5, lineHeight: 27, padding: 16,
            }}
          />
        </Surface>

        {/* the button sits right under the field it acts on, not across a gap */}
        <View style={{ gap: 10, marginTop: 2 }}>
          <Primary label="Log it all" tone="ra" onPress={save} />
          <Ghost label="Nothing comes to mind" onPress={() => router.back()} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
