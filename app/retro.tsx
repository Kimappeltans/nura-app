import { useState } from 'react';
import { View, Text, TextInput, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Primary, Ghost } from '../src/ui';
import { useStore, useTheme } from '../src/store';
import { retroCapture } from '../src/db';
import { radius, type as T } from '../src/theme';

/**
 * The evening anchor asks the wrong question. Not "what will you do" but
 * "what did you actually do?"
 *
 * An ADHD day usually contains real work that never got logged, which is exactly
 * why the day feels empty. Backdating it repairs the record instead of arguing
 * with the feeling.
 */
export default function Retro() {
  const t = useTheme();
  const [text, setText] = useState('');
  const refresh = useStore(s => s.refresh);

  const save = async () => {
    const lines = text.split('\n');
    const n = await retroCapture(lines);
    if (n) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await refresh();
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 14 }}>
        <Text style={{ color: t.ink, fontSize: 25, fontFamily: T.display, lineHeight: 32 }}>
          What did you actually do{'\n'}since lunch?
        </Text>
        <Text style={{ color: t.ink3, fontSize: 13.5, lineHeight: 19 }}>
          One per line. Nothing is too small — answering an email counts, so does
          getting out of the house.
        </Text>

        <TextInput
          autoFocus multiline value={text} onChangeText={setText}
          placeholder={'emailed the registrar\nfound the bike pump\n10 min of reading'}
          placeholderTextColor={t.ink3}
          style={{
            minHeight: 190, textAlignVertical: 'top', color: t.ink, fontSize: 16, lineHeight: 25,
            backgroundColor: t.card, borderRadius: radius.md, padding: 14,
            borderWidth: 1, borderColor: t.strokeStrong,
          }}
        />

        <Primary label="Log it all" tone="ra" onPress={save} />
        <Ghost label="Nothing comes to mind" onPress={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}
