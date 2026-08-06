import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { radius, type as T } from '../theme';
import { useTheme } from '../store';
import { Surface, IconChevron } from '../ui';

/**
 * A real month grid and a real clock.
 *
 * The four relative chips (None / Tonight / Tomorrow / This week) are still
 * here because they cover the overwhelming majority of real use in one tap —
 * but they cannot express "the 14th" or "Tuesday at 3", and a task app that
 * can't say when something actually is isn't a task app.
 *
 * Built rather than installed: @react-native-community/datetimepicker isn't a
 * dependency, and it opens the OS wheel, which on iOS is a modal spinner that
 * takes four gestures to set a date two weeks out. A month you can see is
 * faster and it shows which days already have something on them.
 */

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** Monday-first offset for a given month. */
function gridFor(year: number, month: number) {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;               // Sun=0 -> 6
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return cells;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The days of the week, Monday first, ISO numbering (Mon=1 … Sun=7).
 *
 * Plenty of people plan to the hour and to the weekday — "gym Tuesday and
 * Thursday at 7" is a completely ordinary sentence, and an app that can only
 * offer "weekly" and "evening" cannot hold it.
 */
export const DAY_LABELS: [number, string][] = [
  [1, 'M'], [2, 'T'], [3, 'W'], [4, 'T'], [5, 'F'], [6, 'S'], [7, 'S'],
];

export function WeekdayPicker(
  { value, onChange }: { value: string | null; onChange: (csv: string) => void },
) {
  const t = useTheme();
  const on = (value ?? '').split(',').filter(Boolean).map(Number);
  const toggle = (d: number) => {
    Haptics.selectionAsync();
    const next = on.includes(d) ? on.filter(x => x !== d) : [...on, d].sort((a, b) => a - b);
    onChange(next.join(','));
  };
  return (
    <View style={{ flexDirection: 'row', gap: 7 }}>
      {DAY_LABELS.map(([d, l], i) => {
        const sel = on.includes(d);
        return (
          <Pressable key={i} onPress={() => toggle(d)}
            style={{
              flex: 1, aspectRatio: 1, maxWidth: 44, borderRadius: 22,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: sel ? t.ra : 'transparent',
              borderWidth: 1.5, borderColor: sel ? t.ra : t.strokeStrong,
            }}>
            <Text style={{
              color: sel ? t.onRa : t.ink, fontSize: 14,
              fontFamily: sel ? T.brand : undefined,
            }}>{l}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Hour and minute, exactly. Two snapping rows rather than an OS wheel. */
export function TimePicker(
  { value, onChange }: { value: number | null; onChange: (h: number, m: number) => void },
) {
  const t = useTheme();
  const d = value ? new Date(value) : null;
  const h = d?.getHours() ?? 9;
  const m = d?.getMinutes() ?? 0;

  const Cell = ({ label, sel, onPress }: { label: string; sel: boolean; onPress: () => void }) => (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={{
        paddingHorizontal: 13, paddingVertical: 8, borderRadius: radius.pill,
        backgroundColor: sel ? t.ra : 'transparent',
        borderWidth: 1.5, borderColor: sel ? t.ra : t.strokeStrong,
      }}>
      <Text style={{ color: sel ? t.onRa : t.ink, fontSize: 14, fontFamily: sel ? T.brand : undefined }}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={{ gap: 9 }}>
      <Text style={{ color: t.ink3, fontSize: 12.5 }}>Hour</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingRight: 12 }}>
        {HOURS.map(x => <Cell key={x} label={pad(x)} sel={x === h} onPress={() => onChange(x, m)} />)}
      </ScrollView>
      <Text style={{ color: t.ink3, fontSize: 12.5, marginTop: 2 }}>Minute</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingRight: 12 }}>
        {MINUTES.map(x => <Cell key={x} label={pad(x)} sel={x === m} onPress={() => onChange(h, x)} />)}
      </ScrollView>
    </View>
  );
}

export function DatePicker(
  { value, hasTime, onChange, busyDays }:
  {
    value: number | null;
    hasTime: boolean;
    onChange: (ms: number | null, hasTime: boolean) => void;
    /** day-of-month numbers in the visible month that already carry something */
    busyDays?: Set<string>;
  },
) {
  const t = useTheme();
  const today = new Date();
  const sel = value ? new Date(value) : null;
  const [cursor, setCursor] = useState(() => new Date((sel ?? today).getFullYear(), (sel ?? today).getMonth(), 1));

  const cells = useMemo(() => gridFor(cursor.getFullYear(), cursor.getMonth()), [cursor]);

  const pickDay = (d: number) => {
    Haptics.selectionAsync();
    const next = new Date(cursor.getFullYear(), cursor.getMonth(), d);
    if (hasTime && sel) next.setHours(sel.getHours(), sel.getMinutes(), 0, 0);
    else next.setHours(9, 0, 0, 0);
    onChange(next.getTime(), hasTime);
  };

  const pickTime = (h: number, m: number) => {
    Haptics.selectionAsync();
    const base = sel ?? new Date();
    const next = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0, 0);
    onChange(next.getTime(), true);
  };

  const step = (n: number) => {
    Haptics.selectionAsync();
    setCursor(c => new Date(c.getFullYear(), c.getMonth() + n, 1));
  };

  return (
    <Surface>
      <View style={{ padding: 14 }}>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Pressable onPress={() => step(-1)} hitSlop={14} style={{ transform: [{ rotate: '180deg' }] }}>
            <IconChevron size={19} color={t.ink2} />
          </Pressable>
          <Text style={{ flex: 1, textAlign: 'center', color: t.ink, fontSize: 16.5, fontFamily: T.brand }}>
            {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
          </Text>
          <Pressable onPress={() => step(1)} hitSlop={14}>
            <IconChevron size={19} color={t.ink2} />
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', marginBottom: 4 }}>
          {DOW.map((d, i) => (
            <Text key={i} style={{
              flex: 1, textAlign: 'center', color: t.ink3, fontSize: 12,
              letterSpacing: 0.5, fontFamily: T.brand,
            }}>{d}</Text>
          ))}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {cells.map((d, i) => {
            if (d === null) return <View key={i} style={{ width: `${100 / 7}%`, height: 40 }} />;
            const date = new Date(cursor.getFullYear(), cursor.getMonth(), d);
            const isToday = sameDay(date, today);
            const isSel = !!sel && sameDay(date, sel);
            const past = date < new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const busy = busyDays?.has(date.toLocaleDateString('en-CA'));
            return (
              <Pressable key={i} onPress={() => pickDay(d)}
                style={{ width: `${100 / 7}%`, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{
                  width: 34, height: 34, borderRadius: 17,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isSel ? t.ra : 'transparent',
                  borderWidth: isToday && !isSel ? 1.5 : 0, borderColor: t.ra,
                }}>
                  <Text style={{
                    color: isSel ? t.onRa : past ? t.ink3 : t.ink,
                    fontSize: 14, fontFamily: isSel || isToday ? T.brand : undefined,
                    opacity: past && !isSel ? 0.55 : 1,
                  }}>{d}</Text>
                </View>
                {/* a day that already carries something */}
                {busy && !isSel && (
                  <View style={{
                    position: 'absolute', bottom: 3,
                    width: 4, height: 4, borderRadius: 2, backgroundColor: t.nu,
                  }} />
                )}
              </Pressable>
            );
          })}
        </View>

        <View style={{ height: 1, backgroundColor: t.stroke, marginVertical: 12 }} />

        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ color: t.ink2, fontSize: 12.5, letterSpacing: 1.2, fontFamily: T.brand, flex: 1 }}>
            TIME
          </Text>
          <Pressable onPress={() => { Haptics.selectionAsync(); onChange(value, !hasTime); }}
            style={{
              paddingHorizontal: 13, paddingVertical: 7, borderRadius: radius.pill,
              borderWidth: 1.5, borderColor: !hasTime ? t.ra : t.strokeStrong,
              backgroundColor: !hasTime ? t.raWash : 'transparent',
            }}>
            <Text style={{ color: !hasTime ? t.ra : t.ink, fontSize: 13.5, fontFamily: !hasTime ? T.brand : undefined }}>
              All day
            </Text>
          </Pressable>
        </View>

        {hasTime && <TimePicker value={value} onChange={(h, m) => pickTime(h, m)} />}

        {!!value && (
          <Pressable onPress={() => { Haptics.selectionAsync(); onChange(null, false); }}
            style={{ marginTop: 12, alignSelf: 'flex-start' }}>
            <Text style={{ color: t.ink3, fontSize: 13 }}>Clear the date</Text>
          </Pressable>
        )}
      </View>
    </Surface>
  );
}

/** "Tue 12 Aug · 15:00" — one line, wherever a date needs showing. */
export function formatDue(ms: number, hasTime: boolean) {
  const d = new Date(ms);
  const day = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return hasTime
    ? `${day} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : day;
}
