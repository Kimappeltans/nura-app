import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../store';
import { radius, type as T } from '../theme';
import { Character } from '../ui';
import { ActionSheet } from './ActionSheet';
import { askAgain, PlannerError, type Question, type ReplanResult } from '../planner';
import { HearIt } from './Voice';
import { announce } from '../a11y';

const IN_THE_WAY = [
  'Waiting on someone',
  'Missing a file, a login or some information',
  'I don’t know where to start',
  'It’s not the right time or place',
];

/**
 * "This feels too big" and "I'm blocked" for a project's move — the two
 * answers that make Nu replan. Shown under the move on Ra and on the
 * project page.
 *
 * Too big asks straight away for a smaller first piece. Blocked asks what's
 * in the way first (tap one, type your own, or skip), then asks for a move
 * that goes around it. If Nu comes back with a question instead of a move,
 * the question shows here and answering it asks again.
 *
 * `onMoved` gets the new move's task when there is one; the caller shows it.
 */
export function MoveHelp({ projectId, onMoved }: {
  projectId: string;
  onMoved: (taskId: string | null, res: ReplanResult) => void;
}) {
  const t = useTheme();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; retry: () => void } | null>(null);
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState('');
  const [question, setQuestion] = useState<Question | null>(null);
  const [reply, setReply] = useState('');

  const run = async (event: 'too_big' | 'blocked', note?: string) => {
    Haptics.selectionAsync();
    setError(null); setQuestion(null); setReply('');
    setBusy(event === 'too_big' ? 'Nu is finding a smaller way in…' : 'Nu is looking for a way around…');
    try {
      const { res, taskId } = await askAgain(projectId, event, note);
      setBusy(null);
      if (res.question) setQuestion(res.question);
      if (!taskId) setReply(res.reply);
      onMoved(taskId, res);
    } catch (e) {
      setBusy(null);
      setError({
        message: e instanceof PlannerError ? e.message : 'Nu couldn’t reach the planner.',
        retry: () => run(event, note),
      });
    }
  };

  // what's happening, said aloud as it changes: working on it, a question back, or what went wrong
  useEffect(() => { announce(busy); }, [busy]);
  useEffect(() => { if (question) announce([reply, question.text].filter(Boolean).join(' ')); }, [question]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { announce(error?.message); }, [error]);

  const link = (label: string, onPress: () => void, spoken?: string) => (
    <Pressable onPress={onPress} disabled={!!busy} aria-disabled={!!busy} hitSlop={8} style={{ paddingVertical: 6 }}
      accessibilityRole="button" accessibilityLabel={spoken ?? label}>
      <Text style={{ color: t.raDeep, fontSize: 14.5, fontFamily: T.brand, opacity: busy ? 0.4 : 1 }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ gap: 8 }}>
      {busy ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
          <Character name="nu-thinking" size={40} motion="bob" />
          <Text accessibilityLiveRegion="polite" style={{ color: t.ink2, fontSize: 14.5 }}>{busy}</Text>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 20 }}>
          {link('This feels too big', () => run('too_big'))}
          {link('I’m blocked · another move', () => setAsking(true), 'I’m blocked, another move')}
        </View>
      )}

      {!!error && (
        <View style={{ gap: 6, padding: 12, borderRadius: radius.md, backgroundColor: t.subtle }}>
          <Text accessibilityLiveRegion="polite" style={{ color: t.ink2, fontSize: 14, lineHeight: 20 }}>{error.message}</Text>
          <View style={{ flexDirection: 'row', gap: 18 }}>
            {link('Try again', error.retry)}
            {link('Not now', () => setError(null))}
          </View>
        </View>
      )}

      {!!question && (
        <View style={{ gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: t.subtle }}>
          {!!reply && <Text style={{ color: t.ink2, fontSize: 14, lineHeight: 20 }}>{reply}</Text>}
          <Text style={{ color: t.ink, fontSize: 15.5, fontFamily: T.brand }}>{question.text}</Text>
          <HearIt text={question.text} label="Hear the question" auto />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {question.options.map(o => (
              <Pressable key={o} onPress={() => run('blocked', o)} accessibilityRole="button" style={{
                paddingHorizontal: 13, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: t.strokeStrong,
              }}>
                <Text style={{ color: t.ink2, fontSize: 13.5 }}>{o}</Text>
              </Pressable>
            ))}
          </View>
          {link('Not now', () => setQuestion(null))}
        </View>
      )}

      <ActionSheet visible={asking} title="What’s in the way?" subtitle="Nu will look for a move that goes around it."
        dismissLabel="Cancel"
        onDismiss={() => setAsking(false)}
        actions={[
          ...IN_THE_WAY.map((label, i) => ({ key: `w${i}`, glyph: '·', label, onPress: () => run('blocked', label) })),
          { key: 'skip', glyph: '↔', label: 'Skip, just find another move', tone: 'quiet' as const, onPress: () => run('blocked') },
        ]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }}>
          <TextInput value={typed} onChangeText={setTyped} placeholder="Or in your own words"
            accessibilityLabel="What’s in the way, in your own words"
            placeholderTextColor={t.ink3} returnKeyType="send"
            onSubmitEditing={() => { if (typed.trim()) { setAsking(false); run('blocked', typed.trim()); setTyped(''); } }}
            style={{
              flex: 1, color: t.ink, fontSize: 15, paddingVertical: 11, paddingHorizontal: 12,
              // the edge is what shows it's a field: an ink strong enough to see (3:1 and up)
              backgroundColor: t.card, borderRadius: radius.md, borderWidth: 1, borderColor: t.ink3,
            }} />
        </View>
      </ActionSheet>
    </View>
  );
}
