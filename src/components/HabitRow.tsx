import { View, Text, Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../store';
import { type as T } from '../theme';
import { IconRepeat } from '../ui';
import { habitName, habitValue, type HabitView } from '../habits';

/**
 * A HABIT, AS A ROW: the task row's look (HeldRow), with a habit's glyph,
 * its name, and one value on the right: a tick when it's done today (tap it
 * to take it back), otherwise how many times it has happened, which only
 * rises. A paused one is fainter and says Paused. Tap or hold the row for
 * the habit's sheet.
 */
export function HabitRow({ view, onPress, onTick }: {
  view: HabitView;
  onPress: () => void;
  onTick: () => void;
}) {
  const t = useTheme();
  const dark = t.key === 'nu';
  const { habit, doneToday, paused } = view;
  const name = habitName(habit);
  const v = habitValue(view);
  const done = doneToday && !paused;
  // the row and its tick side by side, not one inside the other (a button can't hold a button on the web)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: t.stroke, opacity: paused ? 0.55 : 1 }}>
      <Pressable onPress={onPress} onLongPress={() => { Haptics.selectionAsync(); onPress(); }}
        accessibilityRole="button" accessibilityLabel={name}
        style={({ pressed }) => ({
          flex: 1, minWidth: 0, minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12,
          opacity: pressed ? 0.7 : 1,
        })}>
        <View style={{
          width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
          backgroundColor: dark ? 'rgba(170,185,255,0.09)' : 'rgba(23,19,19,0.06)',
        }}>
          <IconRepeat size={16} color={t.ink2} />
        </View>
        <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: paused ? t.ink2 : t.ink, fontSize: 15.5, fontFamily: T.brand, letterSpacing: -0.3 }}>{name}</Text>
        {done ? null : v.big ? (
          <Text style={{ color: t.ink, fontSize: 21, letterSpacing: -0.9, fontFamily: T.displayLight }}>
            {v.big}<Text style={{ color: t.ink3, fontSize: 11, letterSpacing: 0, fontFamily: T.brand }}> {v.small}</Text>
          </Text>
        ) : (
          <Text style={{ color: t.ink3, fontSize: 13, fontFamily: T.brand }}>{v.small}</Text>
        )}
      </Pressable>
      {done && (
        <Pressable onPress={() => { Haptics.selectionAsync(); onTick(); }} hitSlop={12}
          accessibilityRole="button" accessibilityLabel={`Take back today for ${name}`}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 7, opacity: pressed ? 0.7 : 1 })}>
          <Text style={{ color: t.ink3, fontSize: 12, fontFamily: T.brand }}>today</Text>
          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: t.ra, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={t.onRa} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M5 12.5l4.5 4.5L19 7.5" />
            </Svg>
          </View>
        </Pressable>
      )}
    </View>
  );
}
