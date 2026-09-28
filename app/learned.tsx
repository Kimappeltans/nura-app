import { inWorld } from '../src/world';
import { goBack } from '../src/nav';
import { withTabs } from '../src/components/WithTabs';
import { useCallback, useState } from 'react';
import type React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Line as SvgLine, Circle, Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { useTheme, useStore, useRoomsLight } from '../src/store';
import { type as T } from '../src/theme';
import { Mica } from '../src/ui';
import { ActionSheet, type SheetAction } from '../src/components/ActionSheet';
import { announce, decorative } from '../src/a11y';
import { setOff } from '../src/patterns';
import { getFlag, setFlag } from '../src/db';
import { GUIDE_KEYS } from '../src/guide';
import { labelById } from '../src/labels';
import { learnedFrom, loadLearned, rowSaid, stageSaid, shareOf, type Learned, type LearnedRow } from '../src/learned';

/**
 * What Nura has learned about how you work, and the way to change what it
 * got wrong. Laid out by how much each thing matters, not as rows of equals:
 *
 *   - your pace, at full size: the one pattern that changes every plan;
 *   - your day: the day's path with your best hours on it, and what a day holds;
 *   - how you work: sessions and project steps as number tiles;
 *   - by label: each label in its own colour, and the ones that get moved.
 *
 * A new account shows the same places, still learning. Tap anything Nura has
 * noticed for "That's not me": it stays on the screen as Off, Nura stops
 * acting on it (src/patterns.ts), and the same tap turns it back on. The
 * rows come from src/learned.ts. Opened from You.
 */
function LearnedScreen() {
  const t = useTheme();
  const [data, setData] = useState<Learned | null>(null);
  // the patterns the sheet is about stay while the sheet slides away
  const [picked, setPicked] = useState<{ title: string; rows: LearnedRow[] } | null>(null);
  const [asking, setAsking] = useState(false);

  // without the database there's still the screen: everything, still learning
  const load = useCallback(() => loadLearned().then(setData, () => setData(learnedFrom({ rows: [] }))), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  // opened once: the guide's last step is done (src/guide.ts)
  useFocusEffect(useCallback(() => {
    const k = GUIDE_KEYS.step(5);
    getFlag(k).then(v => (v ? null : setFlag(k, String(Date.now())))).catch(() => {});
  }, []));

  const turn = async (row: LearnedRow, off: boolean) => {
    if (!row.pattern) return;
    await setOff(row.pattern, off);
    await load();
    announce(`${row.title}, ${off ? 'off' : 'back on'}`);
    useStore.getState().refresh();      // the planner follows at once
  };

  // tapping a place opens the sheet for what's under it; nothing noticed yet, nothing to turn off
  const pick = (title: string, rows: LearnedRow[]) => {
    const live = rows.filter(r => r.pattern);
    if (!live.length) return undefined;
    return () => { setPicked({ title, rows: live }); setAsking(true); };
  };

  const group = (key: string) => data?.groups.find(g => g.key === key)?.rows ?? [];
  const planning = group('planning');
  const pace = planning[0];
  const labelPace = planning.slice(1);
  const [session, early] = group('focus');
  const [big, stuck] = group('projects');
  const starting = group('starting');
  const dayRows = group('day');
  const hours = dayRows.filter(r => r.pattern?.kind === 'best_hour' || r.key === 'best_hour');
  const holds = dayRows.find(r => r.pattern?.kind === 'capacity' || r.key === 'capacity');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }} edges={['top']}>
      <Mica />

      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 2 }}>
        <Pressable onPress={() => goBack()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={{ paddingVertical: 10 }}>
          <Text style={{ color: t.ink3, fontSize: 16, fontFamily: T.brand }}>← Back</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 34 }} showsVerticalScrollIndicator={false}>
        {/* two-tone: the second line is how much history it rests on */}
        <View accessible accessibilityRole="header" accessibilityLabel={`What Nura has learned${data ? `, ${data.basis}` : ''}`}
          style={{ marginTop: 6, marginHorizontal: 4 }}>
          <Text style={{ color: t.ink, fontSize: 34, lineHeight: 36, fontFamily: T.display, letterSpacing: -1.5 }}>What Nura has learned</Text>
          {!!data && <Text style={{ color: t.mute ?? t.ink3, fontSize: 34, lineHeight: 36, fontFamily: T.display, letterSpacing: -1.5 }}>{data.basis}</Text>}
        </View>

        {!!data && (
          <>
            {pace && <Pace row={pace} onPress={pick(pace.title, [pace])} />}

            <Heading>Your day</Heading>
            <Day hours={hours} holds={holds} onPress={pick('Your day', [...hours, ...(holds ? [holds] : [])])} />

            <Heading>How you work</Heading>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {session && <Tile row={session} big={session.pattern ? `${Math.round(session.pattern.value)}` : null} unit="min" caption="A usual focus session" onPress={pick(session.title, [session])} />}
              {early && <Tile row={early} big={early.pattern ? shareOf(early.pattern.value) : null} caption="Sessions end before the timer" onPress={pick(early.title, [early])} />}
              {big && <Tile row={big} big={big.pattern ? shareOf(big.pattern.value) : null} caption="Project steps turn out too big" onPress={pick(big.title, [big])} />}
              {stuck && <Tile row={stuck} big={stuck.pattern ? shareOf(stuck.pattern.value) : null} caption="Project steps get stuck" onPress={pick(stuck.title, [stuck])} />}
            </View>

            <Heading>By label</Heading>
            <Card>
              {[...labelPace, ...starting].map((r, i) => (
                <View key={r.key}>
                  {i > 0 && <View style={{ height: 1, backgroundColor: t.stroke, marginLeft: 38 }} />}
                  <LabelRow row={r} onPress={pick(r.title, [r])} />
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>

      <ActionSheet visible={asking}
        title={picked?.rows.length === 1 ? picked.rows[0].title : picked?.title ?? ''}
        subtitle={picked?.rows.length === 1 ? [stageSaid(picked.rows[0]), picked.rows[0].evidence].filter(Boolean).join(' · ') : undefined}
        dismissLabel={picked?.rows.length === 1 && picked.rows[0].off ? 'Leave it off' : 'Keep it'}
        onDismiss={() => setAsking(false)}
        actions={(picked?.rows ?? []).map((r): SheetAction => {
          const used = r.stage === 'learned';
          const one = picked?.rows.length === 1;
          return r.off
            ? { key: r.key, glyph: '↻', label: one ? 'Turn it back on' : r.title, sub: one ? (used ? 'Nura uses it again' : undefined) : 'Off. Turn it back on', onPress: () => turn(r, false) }
            : { key: r.key, glyph: '×', label: one ? 'That’s not me' : r.title,
                sub: !one ? 'That’s not me' : !used ? 'Nura won’t use it' : r.use === 'plan' ? 'Nura stops planning with it' : 'Nura stops suggesting from it',
                onPress: () => turn(r, true) };
        })} />
    </SafeAreaView>
  );
}

/* Out here, like Profile's, so they aren't redefined on every render. */

function Heading({ children }: { children: string }) {
  const t = useTheme();
  return (
    <Text accessibilityRole="header" accessibilityLabel={children}
      style={{ color: t.ink3, fontSize: 12, letterSpacing: 1.6, fontFamily: T.brand, marginTop: 24, marginBottom: 8, marginLeft: 4 }}>
      {children.toUpperCase()}
    </Text>
  );
}

/** Flat: a fill and a hairline. Pressable when there's something under it to turn off. */
function Card({ children, onPress, label, style }: { children: React.ReactNode; onPress?: () => void; label?: string; style?: object }) {
  const t = useTheme();
  const box = { borderRadius: 22, borderWidth: 1, borderColor: t.stroke, backgroundColor: t.card, overflow: 'hidden' as const, ...style };
  if (!onPress) return <View accessible={!!label} accessibilityLabel={label} style={box}>{children}</View>;
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ ...box, backgroundColor: pressed ? t.subtle : t.card })}>
      {children}
    </Pressable>
  );
}

/** What it shapes (or how far along it is), and what it rests on. */
function Foot({ row }: { row: LearnedRow }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12 }}>
      <View style={{ borderRadius: 999, backgroundColor: t.layer, paddingHorizontal: 9, paddingVertical: 4 }}>
        <Text style={{ color: row.off || row.stage === 'learning' ? t.ink3 : t.ink, fontSize: 12, fontFamily: T.display }}>{stageSaid(row)}</Text>
      </View>
      {!!row.evidence && <Text style={{ color: t.ink3, fontSize: 12.5, fontFamily: T.brand, flexShrink: 1, textAlign: 'right' }}>{row.evidence}</Text>}
    </View>
  );
}

/** Your pace: the one pattern every plan is built on, at full size. */
function Pace({ row, onPress }: { row: LearnedRow; onPress?: () => void }) {
  const t = useTheme();
  const ratio = row.pattern ? Math.round(row.pattern.value * 10) / 10 : null;
  const title = ratio == null ? 'How long things take you'
    : ratio > 1 ? 'Things take you longer than you guess'
    : ratio < 1 ? 'Things take you less time than you guess'
    : 'Things take about as long as you guess';
  // the pace on a 30 minute guess, so the number reads as time
  const takes = ratio == null ? null : Math.round(30 * row.pattern!.value);
  const dim = row.off ? 0.45 : 1;
  return (
    <Card onPress={onPress} label={rowSaid(row)} style={{ marginTop: 18, padding: 18 }}>
      <Text style={{ color: t.ink, fontSize: 18, lineHeight: 22, fontFamily: T.display, letterSpacing: -0.6 }}>{title}</Text>
      {ratio != null && takes != null ? (
        <View style={{ opacity: dim }}>
          <Text style={{ color: t.ink, fontSize: 56, lineHeight: 60, marginTop: 6, fontFamily: T.displayLight, letterSpacing: -2.6 }}>
            {ratio}<Text style={{ fontSize: 22, letterSpacing: 0 }}>×</Text>
          </Text>
          <View style={{ marginTop: 10, gap: 7 }}>
            <Bar label="You guess" minutes={30} of={Math.max(30, takes)} ink={false} />
            <Bar label="It takes" minutes={takes} of={Math.max(30, takes)} ink />
          </View>
        </View>
      ) : null}
      <Foot row={row} />
    </Card>
  );
}

function Bar({ label, minutes, of, ink }: { label: string; minutes: number; of: number; ink: boolean }) {
  const t = useTheme();
  return (
    <View {...decorative} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text style={{ width: 66, color: t.ink3, fontSize: 12.5, fontFamily: T.brand }}>{label}</Text>
      <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: 'transparent' }}>
        <View style={{ width: `${Math.round((minutes / of) * 100)}%`, height: 10, borderRadius: 5, backgroundColor: ink ? t.ink : t.track }} />
      </View>
      <Text style={{ width: 50, textAlign: 'right', color: t.ink, fontSize: 12.5, fontFamily: T.display, fontVariant: ['tabular-nums'] }}>{minutes} min</Text>
    </View>
  );
}

const hourSaid = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' });
const clockSaid = (min: number) => new Date(2000, 0, 1, Math.floor(min / 60) % 24, min % 60).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const spanSaid = (min: number) => { const m = Math.round(min); const h = Math.floor(m / 60); return h ? (m % 60 ? `${h}h ${m % 60}m` : `${h}h`) : `${m}m`; };

/** Your day: the day's path, your best hours on it, and what a usual day holds. */
function Day({ hours, holds, onPress }: { hours: LearnedRow[]; holds?: LearnedRow; onPress?: () => void }) {
  const t = useTheme();
  const start = useStore(s => s.dayStartMin);
  const end = useStore(s => s.dayEndMin);
  const span = Math.max(60, end - start);
  // the same curve as Home's path: a point on it for a time of day
  const at = (min: number) => {
    const k = Math.min(1, Math.max(0, (min - start) / span));
    const x = (1 - k) ** 2 * 10 + 2 * (1 - k) * k * 140 + k ** 2 * 270;
    const y = (1 - k) ** 2 * 92 + 2 * (1 - k) * k * -16 + k ** 2 * 92;
    return { x, y };
  };
  const marks = hours.filter(r => r.pattern && !r.off).map(r => ({ key: r.key, h: r.pattern!.value, ...at(r.pattern!.value * 60) }));
  const said = [...hours, ...(holds ? [holds] : [])].map(rowSaid).join('. ');
  const first = holds ?? hours[0];
  return (
    <Card onPress={onPress} label={said} style={{ padding: 16 }}>
      <Svg viewBox="0 0 280 104" style={{ width: '100%', aspectRatio: 280 / 104 }} {...decorative}>
        <Defs>
          <LinearGradient id="dawn" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.ra} stopOpacity={0.22} />
            <Stop offset="1" stopColor={t.ra} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d="M10 92 Q140 -16 270 92 Z" fill="url(#dawn)" />
        <Path d="M10 92 Q140 -16 270 92" fill="none" stroke={t.ink} strokeWidth={2} />
        <SvgLine x1={0} y1={92} x2={280} y2={92} stroke={t.ink} strokeOpacity={0.2} />
        {marks.map(m => <Circle key={m.key} cx={m.x} cy={m.y} r={7} fill={t.ra} />)}
        {marks.map(m => (
          <SvgText key={`${m.key}-t`} x={m.x} y={m.y - 13} fontSize={10} fontWeight="600" fill={t.ink} textAnchor="middle">{hourSaid(m.h)}</SvgText>
        ))}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
        <Text style={{ color: t.ink3, fontSize: 11.5, fontFamily: T.brand }}>{clockSaid(start)}</Text>
        <Text style={{ color: t.ink3, fontSize: 11.5, fontFamily: T.brand }}>{marks.length ? 'Your best hours' : 'Still learning your best hours'}</Text>
        <Text style={{ color: t.ink3, fontSize: 11.5, fontFamily: T.brand }}>{clockSaid(end)}</Text>
      </View>
      {holds?.pattern && (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 12, opacity: holds.off ? 0.45 : 1 }}>
          <Text style={{ color: t.ink, fontSize: 34, fontFamily: T.displayLight, letterSpacing: -1.6 }}>{spanSaid(holds.pattern.value)}</Text>
          <Text style={{ color: t.ink3, fontSize: 13, fontFamily: T.brand, flexShrink: 1 }}>of focus fits a usual day</Text>
        </View>
      )}
      {first && <Foot row={first} />}
    </Card>
  );
}

/** A number tile: the number big, what it counts small under it. */
function Tile({ row, big, unit, caption, onPress }: { row: LearnedRow; big: string | null; unit?: string; caption: string; onPress?: () => void }) {
  const t = useTheme();
  const box = { flexBasis: '48%' as const, flexGrow: 1, borderRadius: 20, borderWidth: 1, borderColor: t.stroke, padding: 13, minHeight: 104 };
  const body = (
    <>
      {big ? (
        <Text style={{ color: row.off ? t.ink3 : t.ink, fontSize: 30, lineHeight: 34, fontFamily: T.displayLight, letterSpacing: -1.4 }}>
          {big}{!!unit && <Text style={{ fontSize: 13, letterSpacing: 0, fontFamily: T.brand }}> {unit}</Text>}
        </Text>
      ) : (
        <Text style={{ color: t.ink3, fontSize: 15, lineHeight: 34, fontFamily: T.brand }}>Still learning</Text>
      )}
      <Text style={{ color: t.ink3, fontSize: 12.5, lineHeight: 16, marginTop: 6, fontFamily: T.brand }}>{caption}</Text>
      {row.off && <Text style={{ color: t.ink3, fontSize: 11.5, marginTop: 4, fontFamily: T.display }}>Off</Text>}
    </>
  );
  if (!onPress) return <View accessible accessibilityLabel={rowSaid(row)} style={{ ...box, backgroundColor: t.card }}>{body}</View>;
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }} accessibilityRole="button" accessibilityLabel={rowSaid(row)}
      style={({ pressed }) => ({ ...box, backgroundColor: pressed ? t.subtle : t.card })}>
      {body}
    </Pressable>
  );
}

/** One label: its own colour, and what Nura knows about it. A ring while it's still noticing. */
function LabelRow({ row, onPress }: { row: LearnedRow; onPress?: () => void }) {
  const t = useTheme();
  const light = useRoomsLight();
  const label = row.pattern ? labelById(row.pattern.scope) : null;
  const colour = label ? (light ? label.onLight : label.color) : t.ink3;
  const learned = row.stage === 'learned' && !row.off;
  const v = row.pattern?.value;
  const value = !row.pattern ? null
    : row.pattern.kind === 'putoff_rate' ? 'often moved to later'
    : v != null && Math.round(v * 10) / 10 === 1 ? 'on time' : `${Math.round((v ?? 1) * 10) / 10}×`;
  const body = (
    <>
      <View {...decorative} style={{ width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: colour, backgroundColor: learned ? colour : 'transparent', opacity: row.off ? 0.45 : 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: row.off ? t.ink3 : t.ink, fontSize: 15.5, fontFamily: T.brand }}>{label?.name ?? row.title}</Text>
        {(!learned || !label) && (
          <Text style={{ color: t.ink3, fontSize: 12.5, marginTop: 2, fontFamily: T.brand }}>
            {[stageSaid(row), row.evidence].filter(Boolean).join(' · ')}
          </Text>
        )}
      </View>
      {value && (
        value.endsWith('×')
          ? <Text style={{ color: row.off ? t.ink3 : t.ink, fontSize: 20, fontFamily: T.displayLight, letterSpacing: -0.8 }}>{value}</Text>
          : <Text style={{ color: t.ink3, fontSize: 13, fontFamily: T.brand }}>{value}</Text>
      )}
    </>
  );
  const box = { minHeight: 52, paddingHorizontal: 16, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 12 } as const;
  if (!onPress) return <View accessible accessibilityLabel={rowSaid(row)} style={box}>{body}</View>;
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }} accessibilityRole="button" accessibilityLabel={rowSaid(row)}
      style={({ pressed }) => ({ ...box, backgroundColor: pressed ? t.subtle : 'transparent' })}>
      {body}
    </Pressable>
  );
}

export default inWorld('utility', withTabs(LearnedScreen));
