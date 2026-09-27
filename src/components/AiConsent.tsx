import { View, Text } from 'react-native';
import { useTheme } from '../store';
import { type as T } from '../theme';
import { Primary, Ghost } from '../ui';
import { Sheet } from './Sheet';

/**
 * Asked once, at the first moment it matters (Find my first move, or the
 * first sentence in Tell Nu the phone isn't sure about): may Nu send text to
 * Claude? The answer is kept (ai.ts, `ai.ok`) and can be changed under
 * Settings, Language and voice, AI help. Closing the sheet without an answer
 * decides nothing.
 */
export function AiConsent({ visible, onAnswer, onClose }: {
  visible: boolean;
  onAnswer: (ok: boolean) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={{ gap: 10, marginTop: 2 }}>
        <Text accessibilityRole="header" style={{ color: t.ink, fontSize: 22, fontFamily: T.display, letterSpacing: -0.4 }}>Nu can use Claude</Text>
        <Text style={{ color: t.ink2, fontSize: 15.5, lineHeight: 22, fontFamily: T.brand }}>
          To plan projects and read what you type when the phone isn’t sure, Nura sends that text to Claude, made by
          Anthropic. Suggestions send your open tasks’ titles too. Nura doesn’t keep any of it.
        </Text>
      </View>
      <View style={{ gap: 10, marginTop: 20 }}>
        <Primary label="Allow" tone="ra" onPress={() => onAnswer(true)} />
        <Ghost label="Not now" onPress={() => onAnswer(false)} />
      </View>
    </Sheet>
  );
}
