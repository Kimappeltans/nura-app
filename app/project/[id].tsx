import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Alert, Platform, KeyboardAvoidingView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { PinnedMode, useStore, useTheme } from '../../src/store';
import {
  getProject, savePath, updateProject, finishProject, letProjectGo, advance, assumptionsOf,
  type Project, type Step,
} from '../../src/projects';
import { askAgain, PlannerError } from '../../src/planner';
import { grantLight } from '../../src/db';
import { radius, type as T } from '../../src/theme';
import { Mica, Primary, Ghost, Character, Eyebrow, Surface } from '../../src/ui';
import { ActionSheet, type SheetAction } from '../../src/components/ActionSheet';
import { PathEditor, type EditStep } from '../../src/components/PathEditor';
import { MoveHelp } from '../../src/components/MoveHelp';
import { HearIt } from '../../src/components/Voice';

/** Close this sheet — or, opened from a link with nothing under it, go home. */
const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

const toEdit = (s: Step): EditStep => ({
  key: s.id, id: s.id, title: s.title, first_action: s.first_action, why: s.why, est_minutes: s.est_minutes, edited: !!s.edited,
});

/**
 * One project: what done means, the move now, and the path — all editable,
 * saved only when you say so.
 *
 * With `after=done` it's the moment after finishing a move instead: a
 * little light, what's done, and two ways on — see the next move (Nu
 * replans with what happened) or stop there. Stopping is a real answer; the
 * next step on the path waits on the home screen.
 */
export default function ProjectScreen() {
  const { after } = useLocalSearchParams<{ after?: string }>();
  return (
    <PinnedMode.Provider value={after === 'done' ? 'ra' : 'nu'}>
      <Screen />
    </PinnedMode.Provider>
  );
}

function Screen() {
  const t = useTheme();
  const { id, after: afterParam } = useLocalSearchParams<{ id: string; after?: string }>();
  const { refresh, focusOn, toNu, showToast, celebrate } = useStore();
  const [after, setAfter] = useState(afterParam === 'done');
  const [data, setData] = useState<{ project: Project; steps: Step[] } | null>(null);
  const [steps, setSteps] = useState<EditStep[]>([]);
  const [current, setCurrent] = useState(-1);
  const [dirty, setDirty] = useState(false);
  const [title, setTitle] = useState('');
  const [doneMeans, setDoneMeans] = useState('');
  const [menu, setMenu] = useState(false);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; retry: () => void } | null>(null);
  const [note, setNote] = useState('');
  const [maybeDone, setMaybeDone] = useState<string | null>(null);   // the next move's task, held while we ask

  const load = useCallback(async () => {
    const got = await getProject(id);
    setData(got);
    if (!got) return;
    const open = got.steps.filter(s => s.state !== 'done');
    setSteps(open.map(toEdit));
    setCurrent(open.findIndex(s => s.state === 'current'));
    setTitle(got.project.title);
    setDoneMeans(got.project.done_means ?? '');
    setDirty(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const done = useMemo(() => (data?.steps ?? []).filter(s => s.state === 'done'), [data]);
  const lastDone = useMemo(() => [...done].sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0))[0], [done]);
  const move = data?.steps.find(s => s.state === 'current') ?? null;

  /** Show the move in Ra and close this sheet. */
  const goFocus = async (taskId: string | null) => {
    await refresh();
    if (taskId) await focusOn(taskId);
    else await toNu();
    leave();
  };

  const saveEdits = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await savePath(id, steps, current);
    await refresh(); await load();
    showToast('Path saved.');
  };

  const saveMeta = async () => {
    if (!data) return;
    if (title.trim() !== data.project.title || (doneMeans.trim() || null) !== data.project.done_means) {
      await updateProject(id, { title, done_means: doneMeans });
      await refresh();
    }
  };

  const lookAgain = async (event: 'done' | 'replan', withNote?: string) => {
    setError(null); setReply('');
    setBusy(event === 'done' ? 'Nu is finding the next move…' : 'Nu is looking at the path again…');
    try {
      const { res, taskId } = await askAgain(id, event, withNote);
      setBusy(null);
      setReply(res.reply);
      if (event === 'done' && res.maybe_done) { setMaybeDone(taskId ?? ''); return; }
      if (event === 'done') return taskId ? goFocus(taskId) : (await load(), setAfter(false));
      await refresh(); await load();
    } catch (e) {
      setBusy(null);
      setError({
        message: e instanceof PlannerError ? e.message : 'Nu couldn’t reach the planner.',
        retry: () => lookAgain(event, withNote),
      });
    }
  };

  const finish = () => {
    const go = async () => {
      await finishProject(id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh();
      await toNu();
      leave();
      showToast('Finished. That was a whole project.');
    };
    confirm('Finish this project?', 'It leaves your home screen. Everything you did stays in your wins.', 'Finish it', go);
  };

  const letGo = () => confirm('Let this project go?', 'It leaves your home screen. Nothing to explain.', 'Let it go', async () => {
    await letProjectGo(id);
    await refresh();
    leave();
  });

  const menuActions: SheetAction[] = [
    { key: 'again', glyph: '↻', label: 'Ask Nu to look at the path again', sub: 'keeps what you wrote, revises the rest',
      onPress: () => lookAgain('replan') },
    { key: 'finish', glyph: '✓', label: 'This project is finished', onPress: finish },
    { key: 'drop', glyph: '×', label: 'Let this project go', sub: 'gone, no explanation needed', tone: 'quiet', onPress: letGo },
  ];

  if (!data) return <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}><Mica /></SafeAreaView>;

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 4, height: 48 }}>
      <Pressable onPress={() => leave()} hitSlop={12} style={{ flex: 1, paddingVertical: 8 }}>
        <Text style={{ color: t.ink3, fontSize: 16 }}>← Back</Text>
      </Pressable>
      {!after && (
        <Pressable onPress={() => { Haptics.selectionAsync(); setMenu(true); }} hitSlop={10}
          accessibilityLabel="More" style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
          <Text style={{ color: t.ink2, fontSize: 18, fontFamily: T.brand }}>···</Text>
        </Pressable>
      )}
    </View>
  );

  const busyRow = busy && (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Character name="nu-thinking" size={44} motion="bob" />
      <Text style={{ color: t.ink2, fontSize: 15 }}>{busy}</Text>
    </View>
  );
  const errorBox = error && (
    <View style={{ gap: 6, padding: 12, borderRadius: radius.md, backgroundColor: t.subtle }}>
      <Text style={{ color: t.ink2, fontSize: 14, lineHeight: 20 }}>{error.message}</Text>
      {!after && (
        <Pressable onPress={error.retry} hitSlop={8} style={{ paddingVertical: 4 }}>
          <Text style={{ color: t.key === 'ra' ? t.raDeep : t.ra, fontSize: 14.5, fontFamily: T.brand }}>Try again</Text>
        </Pressable>
      )}
    </View>
  );

  /* ---------------- after a move is done ---------------- */
  if (after) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
        <Mica />
        <StatusBar style={t.statusBar} />
        {header}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 22, gap: 14 }} keyboardShouldPersistTaps="handled">
            <Character name="ra-celebrate" size={120} motion="celebrate" style={{ alignSelf: 'center' }} />
            <Eyebrow label="A little light" />
            <Text style={{ color: t.ink, fontSize: 32, lineHeight: 38, fontFamily: T.display, letterSpacing: -0.8 }}>
              You moved it forward.
            </Text>
            <Text style={{ color: t.ink2, fontSize: 16, lineHeight: 23 }}>
              {lastDone ? `“${lastDone.title}” is done. ` : ''}Nu can adjust the path with what you learned.
            </Text>

            {maybeDone !== null ? (
              <Surface accent="ra">
                <View style={{ padding: 16, gap: 10 }}>
                  <Text style={{ color: t.ink, fontSize: 17, fontFamily: T.brand }}>Is the whole project finished?</Text>
                  {!!data.project.done_means && (
                    <Text style={{ color: t.ink2, fontSize: 14.5, lineHeight: 20 }}>Done means: {data.project.done_means}</Text>
                  )}
                  {!!reply && <Text style={{ color: t.ink3, fontSize: 14, lineHeight: 20 }}>{reply}</Text>}
                  <Primary label="Yes, it’s finished" tone="ra" onPress={async () => {
                    await finishProject(id);
                    celebrate(await grantLight('complete'));
                    await refresh(); await toNu(); leave();
                    showToast('Finished. That was a whole project.');
                  }} />
                  <Ghost label="Not yet, keep going" onPress={async () => {
                    const next = maybeDone || (await advance(id));
                    if (next) return goFocus(next);
                    setMaybeDone(null); setAfter(false); await load();
                  }} />
                </View>
              </Surface>
            ) : (
              <>
                <TextInput value={note} onChangeText={setNote} multiline
                  placeholder="Anything that changes what comes next? (optional)" placeholderTextColor={t.ink3}
                  style={{
                    color: t.ink, fontSize: 15.5, lineHeight: 21, padding: 13, minHeight: 64,
                    backgroundColor: t.card, borderRadius: radius.md, borderWidth: 1, borderColor: t.strokeStrong,
                  }} />
                {busyRow}
                {errorBox}
              </>
            )}
          </ScrollView>
          {maybeDone === null && (
            <View style={{ paddingHorizontal: 22, paddingBottom: 8, gap: 10 }}>
              {error ? (
                <>
                  <Primary label="Try again" tone="ra" onPress={error.retry} />
                  <Ghost label="Use the next step on my path" onPress={async () => goFocus(await advance(id))} />
                </>
              ) : (
                <>
                  <Primary label="See the next move" tone="ra" disabled={!!busy} onPress={() => lookAgain('done', note.trim() || undefined)} />
                  <Ghost label="That’s enough for now" onPress={async () => {
                    // the next step waits on the home screen; no planner call
                    await advance(id);
                    await refresh(); await toNu(); leave();
                  }} />
                </>
              )}
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  /* ---------------- the project ---------------- */
  const guesses = assumptionsOf(data.project);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Mica />
      <StatusBar style={t.statusBar} />
      {header}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, gap: 18 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 6 }}>
            <Eyebrow label="Project" tone="nu" />
            <TextInput value={title} onChangeText={setTitle} onBlur={saveMeta} multiline
              style={{ color: t.ink, fontSize: 28, lineHeight: 34, fontFamily: T.display, letterSpacing: -0.6, padding: 0 }} />
            <TextInput value={doneMeans} onChangeText={setDoneMeans} onBlur={saveMeta} multiline
              placeholder="Done means… (tap to say what finished looks like)" placeholderTextColor={t.ink3}
              style={{ color: t.ink2, fontSize: 15, lineHeight: 21, padding: 0 }} />
          </View>

          {!!reply && (
            <View style={{ gap: 2, padding: 12, borderRadius: radius.md, backgroundColor: t.nuWash }}>
              <Text style={{ color: t.ink2, fontSize: 14.5, lineHeight: 20 }}>{reply}</Text>
              <HearIt text={reply} auto />
            </View>
          )}
          {busyRow}
          {errorBox}

          {/* the move now */}
          <Surface accent="ra">
            <View style={{ padding: 16, gap: 10 }}>
              <Eyebrow label={move ? 'Current move' : 'No move yet'} />
              {move ? (
                <>
                  <Text style={{ color: t.ink, fontSize: 20, lineHeight: 26, fontFamily: T.display }}>{move.title}</Text>
                  {!!move.first_action && (
                    <View style={{ borderLeftWidth: 3, borderLeftColor: t.ra, paddingLeft: 12 }}>
                      <Text style={{ color: t.ink2, fontSize: 15, lineHeight: 21 }}>{move.first_action}</Text>
                    </View>
                  )}
                  <Primary label="Focus on this" tone="ra" onPress={() => goFocus(move.task_id)} />
                  <MoveHelp projectId={id} onMoved={async (_task, res) => { setReply(res.reply); await refresh(); await load(); }} />
                </>
              ) : (
                <>
                  <Text style={{ color: t.ink2, fontSize: 15, lineHeight: 21 }}>
                    Ask Nu for the next move, or open a step below and make it the move now.
                  </Text>
                  <Primary label="Find the next move with Nu" tone="ra" disabled={!!busy} onPress={() => lookAgain('replan')} />
                </>
              )}
            </View>
          </Surface>

          <View style={{ gap: 8 }}>
            <Text style={{ color: t.ink3, fontSize: 12, letterSpacing: 1.6, fontFamily: T.brand }}>THE PATH SO FAR</Text>
            <PathEditor steps={steps} current={current} done={done.map(s => s.title)}
              onChange={(s, c) => { setSteps(s); setCurrent(c); setDirty(true); }} />
          </View>

          {!!guesses.length && (
            <View style={{ gap: 6 }}>
              <Text style={{ color: t.ink3, fontSize: 12, letterSpacing: 1.6, fontFamily: T.brand }}>NU’S GUESSES</Text>
              {guesses.map((g, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ flex: 1, color: t.ink2, fontSize: 14, lineHeight: 20 }}>I’m assuming: {g}</Text>
                  <Pressable hitSlop={10} accessibilityLabel="That's wrong, remove this guess" onPress={async () => {
                    await updateProject(id, { assumptions: guesses.filter((_, k) => k !== i) });
                    await load();
                  }}>
                    <Text style={{ color: t.ink3, fontSize: 17 }}>×</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {dirty && (
          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 }}>
            <Ghost style={{ flex: 1 }} label="Undo changes" onPress={load} />
            <View style={{ flex: 1.4 }}><Primary label="Save the path" tone="ra" onPress={saveEdits} /></View>
          </View>
        )}
      </KeyboardAvoidingView>

      <ActionSheet visible={menu} title={data.project.title} actions={menuActions} dismissLabel="Close" onDismiss={() => setMenu(false)} />
    </SafeAreaView>
  );
}

function confirm(title: string, body: string, yes: string, go: () => void) {
  if (Platform.OS === 'web') { if (window.confirm(`${title}\n\n${body}`)) go(); return; }
  Alert.alert(title, body, [{ text: 'Cancel', style: 'cancel' }, { text: yes, onPress: go }]);
}
