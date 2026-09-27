import { View, Text } from 'react-native';
import { useTheme } from '../store';
import { priorityOf } from '../priority';
import { radius, type as T } from '../theme';

/**
 * A task's priority label — High, Medium or Low — shown wherever the task is.
 * Priorities used to be a hidden tie-break set deep in the task sheet; now
 * they're visible, sortable, and the order Focus works through your Today.
 * None shows nothing, so an unlabelled list stays quiet.
 */
export function PriorityChip({ n }: { n: number }) {
  const t = useTheme();
  if (!n) return null;
  const p = priorityOf(n);
  const c = t.key === 'ra' ? p.onLight : p.color;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill,
      borderWidth: 1, borderColor: `${c}66`, backgroundColor: `${c}1F`,
    }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c }} />
      <Text style={{ color: c, fontSize: 12, fontFamily: T.brand }}>{p.name}</Text>
    </View>
  );
}
