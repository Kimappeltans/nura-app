import { inWorld } from '../src/world';
import { goBack } from '../src/nav';
import { withTabs } from '../src/components/WithTabs';
import { useCallback, useState } from 'react';
import type React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme, useStore } from '../src/store';
import { type as T } from '../src/theme';
import { Mica, IconChevron } from '../src/ui';
import { ActionSheet } from '../src/components/ActionSheet';
import { announce, decorative } from '../src/a11y';
import { setOff } from '../src/patterns';
import { learnedFrom, loadLearned, rowSaid, stageSaid, type Learned, type LearnedRow, type Stage } from '../src/learned';

/**
 * What Nura has learned about how you work, and the way to change what it
 * got wrong. Each pattern is one row: the fact, how far along it is (still
 * learning, starting to notice, learned: from there it says whether it
 * shapes your plan or what Nura suggests) and what it rests on. A new
 * account shows the same rows, still learning.
 *
 * Tap one Nura has noticed for "That's not me": it stays on the screen as
 * Off, Nura stops acting on it (src/patterns.ts), and the same tap turns it
 * back on. Opened from You.
 */
function LearnedScreen() {
  const t = useTheme();
  const [data, setData] = useState<Learned | null>(null);
  // the row the sheet is about stays while the sheet slides away
  const [picked, setPicked] = useState<LearnedRow | null>(null);
  const [asking, setAsking] = useState(false);

  // without the database there's still the screen: every row, still learning
  const load = useCallback(() => loadLearned().then(setData, () => setData(learnedFrom({ rows: [] }))), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const turn = async (row: LearnedRow, off: boolean) => {
    if (!row.pattern) return;
    await setOff(row.pattern, off);
    await load();
    announce(`${row.title}, ${off ? 'off' : 'back on'}`);
    useStore.getState().refresh();      // the planner follows at once
  };

  const used = picked?.stage === 'learned';
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

        {data?.groups.map(g => (
          <Group key={g.key} title={g.title}>
            {g.rows.map((r, i) => (
              <View key={r.key}>
                {i > 0 && <Line />}
                <Fact row={r} onPress={r.pattern ? () => { setPicked(r); setAsking(true); } : undefined} />
              </View>
            ))}
          </Group>
        ))}
      </ScrollView>

      <ActionSheet visible={asking} title={picked?.title ?? ''}
        subtitle={picked ? [stageSaid(picked), picked.evidence].filter(Boolean).join(' · ') : undefined}
        dismissLabel={picked?.off ? 'Leave it off' : 'Keep it'}
        onDismiss={() => setAsking(false)}
        actions={!picked ? [] : picked.off
          ? [{ key: 'on', glyph: '↻', label: 'Turn it back on', sub: used ? 'Nura uses it again' : undefined, onPress: () => turn(picked, false) }]
          : [{ key: 'off', glyph: '×', label: 'That’s not me',
              sub: !used ? 'Nura won’t use it' : picked.use === 'plan' ? 'Nura stops planning with it' : 'Nura stops suggesting from it',
              onPress: () => turn(picked, true) }]} />
    </SafeAreaView>
  );
}

/* Out here, like Profile's, so they aren't redefined on every render. */

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ marginTop: 24 }}>
      <Text accessibilityRole="header" accessibilityLabel={title} style={{ color: t.ink3, fontSize: 12, letterSpacing: 1.6, fontFamily: T.brand, marginBottom: 8, marginLeft: 4 }}>
        {title.toUpperCase()}
      </Text>
      {/* flat: a fill and a hairline */}
      <View style={{ borderRadius: 22, borderWidth: 1, borderColor: t.stroke, backgroundColor: t.card, overflow: 'hidden' }}>
        {children}
      </View>
    </View>
  );
}

function Line() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.stroke, marginLeft: 38 }} />;
}

/** How far along, as a dot: an empty ring, an ink ring, an ink dot (Nu's marks are ink; coral is for
 *  the one action). The words beside it say the same. */
function Mark({ stage, off }: { stage: Stage; off: boolean }) {
  const t = useTheme();
  const lit = !off && stage !== 'learning';
  return (
    <View {...decorative} style={{
      width: 10, height: 10, borderRadius: 5, borderWidth: 1.5,
      borderColor: lit ? t.nu : t.ink3, opacity: lit ? 1 : 0.5,
      backgroundColor: lit && stage === 'learned' ? t.nu : 'transparent',
    }} />
  );
}

/** One thing Nura has learned, or is learning. With `onPress` it opens the sheet that turns it off or back on. */
function Fact({ row, onPress }: { row: LearnedRow; onPress?: () => void }) {
  const t = useTheme();
  const learning = row.stage === 'learning';
  const body = (
    <>
      <Mark stage={row.stage} off={row.off} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: row.off ? t.ink3 : learning ? t.ink2 : t.ink, fontSize: 15.5, lineHeight: 21, fontFamily: T.brand }}>{row.title}</Text>
        <Text style={{ color: t.ink3, fontSize: 13, lineHeight: 18, marginTop: 2, fontFamily: T.brand }}>
          <Text style={{ color: row.off || learning ? t.ink3 : t.ink2 }}>{stageSaid(row)}</Text>
          {!!row.evidence && ` · ${row.evidence}`}
        </Text>
      </View>
    </>
  );
  const box = { minHeight: 64, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 } as const;
  if (!onPress) return <View accessible accessibilityLabel={rowSaid(row)} style={box}>{body}</View>;
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }} accessibilityRole="button" accessibilityLabel={rowSaid(row)}
      style={({ pressed }) => ({ ...box, backgroundColor: pressed ? t.subtle : 'transparent' })}>
      {body}
      <IconChevron size={16} color={t.ink3} />
    </Pressable>
  );
}

export default inWorld('utility', withTabs(LearnedScreen));
