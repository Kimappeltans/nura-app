import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../store';
import { radius, type as T } from '../theme';
import { ESTIMATE_STOPS } from './DurationDial';
import type { StepDraft } from '../projects';

/** A step being edited. `key` is stable across edits and reorders, even for
 *  a step that has no id yet. */
export type EditStep = StepDraft & { key: string };

let n = 0;
export const editKey = () => `e${Date.now().toString(36)}${n++}`;

/**
 * The path, editable: the move now, then what might come later. Tap a step
 * to change its words, its length or its place, make it the move now, or
 * take it out. Anything you change counts as yours — replanning keeps it as
 * you wrote it (planner.ts → mergePath).
 *
 * Not a checklist: there are no ticks here. Steps are done by doing the
 * move in Ra, one at a time; the finished ones are shown above, quietly,
 * and can't be edited.
 */
export function PathEditor({ steps, current, onChange, done = [] }: {
  steps: EditStep[];
  /** index of the move now, or -1 */
  current: number;
  onChange: (steps: EditStep[], current: number) => void;
  /** finished steps, shown above the path */
  done?: string[];
}) {
  const t = useTheme();
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState('');

  const patch = (key: string, p: Partial<StepDraft>) =>
    onChange(steps.map(s => (s.key === key ? { ...s, ...p, edited: true } : s)), current);

  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= steps.length) return;
    Haptics.selectionAsync();
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    // the move now stays the same step, wherever it went
    const cur = current === i ? j : current === j ? i : current;
    onChange(next.map(s => (s.key === steps[i].key ? { ...s, edited: true } : s)), cur);
  };

  const remove = (i: number) => {
    Haptics.selectionAsync();
    const next = steps.filter((_, k) => k !== i);
    setOpen(null);
    onChange(next, current === i ? (next.length ? 0 : -1) : current > i ? current - 1 : current);
  };

  const add = () => {
    const title = adding.trim();
    if (!title) return;
    Haptics.selectionAsync();
    setAdding('');
    onChange([...steps, { key: editKey(), title, first_action: null, why: null, est_minutes: null, edited: true }],
      current < 0 ? steps.length : current);
  };

  /** One stop up or down the estimate dial's stops (2, 5, 10, 15 … 120). */
  const stepMins = (s: EditStep, by: -1 | 1) => {
    const stops = ESTIMATE_STOPS as readonly number[];
    const m = s.est_minutes;
    if (m == null) return patch(s.key, { est_minutes: by > 0 ? stops[1] : stops[0] });
    const i = stops.findIndex(x => x >= m);
    const base = i < 0 ? stops.length - 1 : i;
    // between two stops, down goes to the one below and up to the one above
    const j = by > 0 ? (stops[base] === m ? base + 1 : base) : base - 1;
    patch(s.key, { est_minutes: stops[Math.max(0, Math.min(stops.length - 1, j))] });
  };

  const field = {
    color: t.ink, fontSize: 15.5, paddingVertical: 11, paddingHorizontal: 12,
    backgroundColor: t.layer, borderRadius: radius.md, borderWidth: 1, borderColor: t.strokeStrong,
  } as const;
  const small = (label: string, onPress: () => void, tone?: 'ra') => (
    <Pressable key={label} onPress={onPress} hitSlop={6} style={({ pressed }) => ({
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill,
      borderWidth: 1, borderColor: tone ? t.ra : t.strokeStrong, backgroundColor: pressed ? t.subtle : 'transparent',
    })}>
      <Text style={{ color: tone ? (t.key === 'ra' ? t.raDeep : t.ra) : t.ink2, fontSize: 13, fontFamily: T.brand }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ gap: 8 }}>
      {done.map((title, i) => (
        <View key={`done${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4, paddingVertical: 4 }}>
          <Text style={{ width: 34, textAlign: 'center', color: t.ra, fontSize: 15 }}>✓</Text>
          <Text style={{ flex: 1, color: t.ink3, fontSize: 14.5, textDecorationLine: 'line-through' }} numberOfLines={1}>{title}</Text>
        </View>
      ))}

      {steps.map((s, i) => {
        const now = i === current;
        const isOpen = open === s.key;
        return (
          <View key={s.key} style={{
            borderRadius: radius.lg, borderWidth: 1,
            borderColor: now ? t.ra : t.stroke, backgroundColor: now ? t.raWash : t.card,
          }}>
            <Pressable onPress={() => { Haptics.selectionAsync(); setOpen(isOpen ? null : s.key); }}
              accessibilityHint="Edit this step"
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 13 }}>
              <Text numberOfLines={1} style={{
                width: 34, textAlign: 'center', marginTop: 2,
                color: now ? (t.key === 'ra' ? t.raDeep : t.ra) : t.ink3, fontSize: now ? 11 : 12.5,
                letterSpacing: now ? 1 : 0, fontFamily: T.brand,
              }}>{now ? 'NOW' : String(i + 1).padStart(2, '0')}</Text>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ color: t.ink, fontSize: 15.5, lineHeight: 21, fontFamily: now ? T.brand : undefined }}>{s.title}</Text>
                {!!(s.first_action || s.why) && !isOpen && (
                  <Text style={{ color: t.ink3, fontSize: 13, lineHeight: 18 }} numberOfLines={2}>
                    {now ? s.first_action ?? s.why : s.why ?? s.first_action}
                  </Text>
                )}
              </View>
              {!!s.est_minutes && !isOpen && <Text style={{ color: t.ink3, fontSize: 12.5, marginTop: 2 }}>{s.est_minutes}m</Text>}
            </Pressable>

            {isOpen && (
              <View style={{ paddingHorizontal: 13, paddingBottom: 13, gap: 9 }}>
                <TextInput value={s.title} onChangeText={v => patch(s.key, { title: v })}
                  placeholder="What’s the step?" placeholderTextColor={t.ink3} style={field} multiline />
                <TextInput value={s.first_action ?? ''} onChangeText={v => patch(s.key, { first_action: v || null })}
                  placeholder="First physical move (optional)" placeholderTextColor={t.ink3} style={field} multiline />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ color: t.ink3, fontSize: 13, flex: 1 }}>About how long?</Text>
                  {small('−', () => stepMins(s, -1))}
                  <Text style={{ color: t.ink, fontSize: 14, minWidth: 52, textAlign: 'center' }}>
                    {s.est_minutes ? `${s.est_minutes} min` : '—'}
                  </Text>
                  {small('+', () => stepMins(s, 1))}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
                  {!now && small('Make this the move now', () => { Haptics.selectionAsync(); onChange(steps, i); }, 'ra')}
                  {i > 0 && small('Move up', () => move(i, -1))}
                  {i < steps.length - 1 && small('Move down', () => move(i, 1))}
                  {small('Remove', () => remove(i))}
                  {small('Done', () => setOpen(null))}
                </View>
              </View>
            )}
          </View>
        );
      })}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
        <TextInput value={adding} onChangeText={setAdding} onSubmitEditing={add} returnKeyType="done"
          placeholder="+ Add a step" placeholderTextColor={t.ink3}
          style={{ ...field, flex: 1, backgroundColor: 'transparent', borderStyle: 'dashed' }} />
        {!!adding.trim() && small('Add', add, 'ra')}
      </View>
    </View>
  );
}
