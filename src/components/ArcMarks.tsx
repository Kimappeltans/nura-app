import { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useStore, useTheme } from '../store';
import type { Task } from '../db';
import { type as T } from '../theme';
import { decorative } from '../a11y';
import { arcMarks, markSaid, type ArcDay, type Mark } from '../arcMarks';

/**
 * THE MARKS ON THE DAY'S ARC, drawn (the rules are src/arcMarks.ts). Used by
 * both arcs: the phone's (DayPath) and the desktop's (DayArc). Each gives
 * its own geometry (`at`: how far along the day to a point on its curve).
 *
 *   ArcDots   everything but the next move: a dot, a ring, a small mark, or
 *             a count. Under the pointer (or the keyboard's focus) one says
 *             what it is; tapped, a task to come opens, anything else opens
 *             the day in the Calendar.
 *   ArcNext   your next move, named, beside Ra. Tapping it is Start.
 */

const CORAL = '#FF6B35';
const ON_CORAL = '#3B1204';
const HIT = 30;

export type ArcThings = Pick<ArcDay, 'done' | 'ahead' | 'events' | 'next'> & {
  onStart: (id: string) => void;
  onOpen: (id: string) => void;
  /** the Calendar, on today */
  onDay: () => void;
};

/** What's on today's arc, from the store. `next`: the move in front, where there is one. */
export function useArcThings(next: Task | null): Pick<ArcDay, 'done' | 'ahead' | 'events' | 'next'> {
  const wins = useStore(s => s.wins);
  const inbox = useStore(s => s.inbox);
  const todayPicked = useStore(s => s.todayPicked);
  const agenda = useStore(s => s.agenda);
  return useMemo(() => {
    const from = new Date().setHours(0, 0, 0, 0), to = from + 86_400_000;
    const today = (ms: number | null | undefined): ms is number => ms != null && ms >= from && ms < to;
    const seen = new Set<string>();
    const timed = [...todayPicked, ...inbox].filter(x => !!x.has_time && today(x.due_at) && x.state !== 'done' && !x.parent_id
      && (seen.has(x.id) ? false : (seen.add(x.id), true)));
    return {
      done: wins.filter(w => today(w.completed_at)).map(w => ({ id: w.id, title: w.title, at: w.completed_at as number })),
      ahead: timed.map(x => ({ id: x.id, title: x.title, at: x.due_at as number })),
      events: agenda.filter(e => today(e.startsAt)).map(e => ({ id: String(e.id), title: e.title, at: e.startsAt })),
      next: next ? { id: next.id, title: next.title, at: next.has_time && today(next.due_at) ? next.due_at : null } : null,
    };
  }, [wins, inbox, todayPicked, agenda, next?.id, next?.title, next?.due_at, next?.has_time]);   // eslint-disable-line react-hooks/exhaustive-deps
}

/** The marks for an arc this wide. */
export function useMarks(things: ArcThings | undefined, now: number, dayStartMin: number, dayEndMin: number, width: number): Mark[] {
  return useMemo(
    () => (things ? arcMarks({ now, dayStartMin, dayEndMin, done: things.done, ahead: things.ahead, events: things.events, next: things.next }, width) : []),
    [things?.done, things?.ahead, things?.events, things?.next, Math.floor(now / 60_000), dayStartMin, dayEndMin, Math.round(width)],   // eslint-disable-line react-hooks/exhaustive-deps
  );
}

export function ArcDots({ marks, at, width, things }: {
  marks: Mark[];
  at: (p: number) => [number, number];
  /** the arc's box, so a title near an edge opens inward */
  width: number;
  things: ArcThings;
}) {
  const t = useTheme();
  const [over, setOver] = useState<number | null>(null);
  return (
    <>
      {marks.map((m, i) => {
        const [x, y] = at(m.p);
        if (m.kind === 'next') {
          // where Ra stands: the open ring of the move in front
          return <View key="next" {...decorative} pointerEvents="none" style={{
            position: 'absolute', left: x - 8, top: y - 8, width: 16, height: 16, borderRadius: 8,
            borderWidth: 2.5, borderColor: CORAL, backgroundColor: t.base,
          }} />;
        }
        const said = markSaid(m);
        const press = () => (m.kind === 'ahead' && m.id ? things.onOpen(m.id) : things.onDay());
        const edge = x < 110 ? 'left' : x > width - 110 ? 'right' : 'mid';
        return (
          <Pressable key={`${m.kind}${i}`} onPress={press} hitSlop={4}
            onHoverIn={() => setOver(i)} onHoverOut={() => setOver(v => (v === i ? null : v))}
            onFocus={() => setOver(i)} onBlur={() => setOver(v => (v === i ? null : v))}
            accessibilityRole="button" accessibilityLabel={m.kind === 'ahead' ? `${said}. Opens it.` : `${said}. Opens the day in the Calendar.`}
            style={{ position: 'absolute', left: x - HIT / 2, top: y - HIT / 2, width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center', zIndex: over === i ? 3 : 1 }}>
            <Dot m={m} />
            {over === i && (
              <View pointerEvents="none" style={{
                // as wide as its words, up to two lines of them (it hangs off a 30 px button, so it says its own width)
                position: 'absolute', bottom: HIT + 2, width: Math.min(250, Math.round(said.length * 7.4) + 24),
                ...(edge === 'left' ? { left: 0 } : edge === 'right' ? { right: 0 } : { alignSelf: 'center' }),
                paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9, backgroundColor: t.ink,
              }}>
                <Text numberOfLines={2} style={{ color: t.base, fontSize: 13, lineHeight: 17, fontFamily: T.brand }}>{said}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </>
  );
}

function Dot({ m }: { m: Mark }) {
  const t = useTheme();
  if (m.kind === 'done') {
    return <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: CORAL, borderWidth: 2.5, borderColor: t.base }} />;
  }
  if (m.kind === 'ahead') {
    return <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: t.base, borderWidth: 2, borderColor: t.ink }} />;
  }
  if (m.kind === 'event') {
    return <View style={{ width: 9, height: 9, borderRadius: 2.5, backgroundColor: t.ink2, borderWidth: 1.5, borderColor: t.base }} />;
  }
  // several in one place: what they were decides how it looks
  const all = m.of.done === m.count ? 'done' : m.of.ahead === m.count ? 'ahead' : 'mixed';
  return (
    <View style={{
      minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center',
      backgroundColor: all === 'done' ? CORAL : all === 'ahead' ? t.base : t.ink2,
      borderWidth: 2, borderColor: all === 'ahead' ? t.ink : t.base,
    }}>
      <Text style={{ color: all === 'done' ? ON_CORAL : all === 'ahead' ? t.ink : t.base, fontSize: 12, lineHeight: 14, fontFamily: T.display }}>{m.count}</Text>
    </View>
  );
}

/**
 * The move in front, named. The only name on the arc; tapping it is Start.
 * It sits under the arc, from Ra towards the middle of the day, where the
 * curve is higher than it is: so it never covers a mark. Where there's no
 * room under the arc (early or late in the day) it goes above Ra, and where
 * there's no room there either it isn't shown: the ring still marks the
 * move, and the card under the arc names it.
 */
export function ArcNext({ marks, at, width, ra, floor, things }: {
  marks: Mark[];
  at: (p: number) => [number, number];
  width: number;
  /** Ra's size, to stand clear of it */
  ra: number;
  /** the horizon's y: how much room there is under the arc */
  floor: number;
  things: ArcThings;
}) {
  const t = useTheme();
  const m = marks.find(x => x.kind === 'next');
  if (!m || !m.id) return null;
  const [x, y] = at(m.p);
  // a small arc (a phone): one line
  const small = width < 500;
  const tall = small ? 28 : 46, box = Math.min(small ? Math.round(width * 0.46) : 280, width - 16);
  const under = floor - y >= tall + 12;
  const over = y - ra * 0.86 - tall - 2;
  if (!under && over < -6) return null;
  // towards the middle of the day: to the right of Ra in the morning, to the left after noon
  const toRight = m.p < 0.5;
  const left = Math.max(0, Math.min(width - box, toRight ? x - 12 : x - box + 12));
  const time = m.at ? new Date(m.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;
  const id = m.id;
  const raInk = t.key === 'nu' ? '#FF9A70' : t.raDeep;
  return (
    <View pointerEvents="box-none" style={{
      position: 'absolute', left, width: box, zIndex: 4, alignItems: toRight ? 'flex-start' : 'flex-end',
      top: under ? y + 14 : over,
    }}>
      <Pressable onPress={() => things.onStart(id)} accessibilityRole="button" accessibilityLabel={`${markSaid(m)}. Start.`}
        style={(s) => {
          const { pressed, hovered } = s as { pressed: boolean; hovered?: boolean };
          return {
            maxWidth: box, borderRadius: 12, backgroundColor: t.card, borderWidth: 1, borderColor: pressed || hovered ? CORAL : t.stroke,
            ...(small ? { height: tall, paddingHorizontal: 10, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 }
              : { paddingHorizontal: 12, paddingVertical: 6 }),
          };
        }}>
        <Text style={{ color: raInk, fontSize: 11.5, letterSpacing: 0.9, fontFamily: T.display, textTransform: 'uppercase' }}>
          {time ? `Next · ${time}` : 'Next'}
        </Text>
        <Text numberOfLines={1} style={{ flexShrink: 1, color: t.ink, fontSize: small ? 13.5 : 14.5, lineHeight: 19, letterSpacing: -0.2, fontFamily: T.display }}>{m.title}</Text>
      </Pressable>
    </View>
  );
}
