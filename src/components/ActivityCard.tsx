import { View, Text, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { activityById, type ActivityId } from '../activities';
import { radius, type as T } from '../theme';
import { useTheme } from '../store';

/** Warm, specific, and never a grade. */
const PRAISE = ['Great job!', 'Nicely done.', 'That one is gone.', 'Logged.', 'Done and dusted.'];
export const praiseFor = (id: string) =>
  PRAISE[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % PRAISE.length];

/**
 * The picker: a plain pill, no artwork.
 *
 * Twenty-one illustrated tiles in a row is a shop window: you browse it
 * instead of choosing from it, and the pictures compete with each other rather
 * than telling you anything. Choosing is a text job: you already know whether
 * you mean Yoga or Coding, you just need to find the word.
 *
 * The scene is the REWARD for having scheduled the thing, and it only appears
 * on the day view where it does its real work, making a list of chores look
 * like a day worth having.
 */
export function ActivityPick(
  { id, on, onPress }: { id: ActivityId; on: boolean; onPress: () => void },
) {
  const t = useTheme();
  const a = activityById(id)!;
  const c = t.key === 'ra' ? a.onLight : a.tint;
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }}
      accessibilityRole="radio" aria-checked={on}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 13, paddingVertical: 9, borderRadius: radius.pill,
        backgroundColor: on ? `${c}26` : 'transparent',
        borderWidth: 1.5, borderColor: on ? c : t.strokeStrong,
      }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: on ? c : `${c}88` }} />
      <Text style={{ color: on && t.key !== 'ra' ? c : t.ink, fontSize: 13.5, fontFamily: on ? T.brand : undefined }}>
        {a.name}
      </Text>
    </Pressable>
  );
}
