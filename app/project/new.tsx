import { goBack } from '../../src/nav';
import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { PinnedMode, useStore, useTheme } from '../../src/store';
import { capture } from '../../src/db';
import { createProject, type Note } from '../../src/projects';
import { start, draftPlan, PlannerError, type PlanResult, type Question } from '../../src/planner';
import { radius, type as T } from '../../src/theme';
import { Mica, Primary, Ghost, Character, Surface } from '../../src/ui';
import { NuGlow } from '../../src/components/NuGlow';
import { Moving } from '../../src/components/Moving';
import { PathEditor, editKey, type EditStep } from '../../src/components/PathEditor';
import { MicButton, HearIt } from '../../src/components/Voice';
import { AiConsent } from '../../src/components/AiConsent';
import { aiConsent, setAiConsent } from '../../src/ai';
import { readable } from '../../src/components/Desk';

/** Close this sheet — or, opened from a link with nothing under it, go home. */
const leave = () => (goBack());

type Phase =
  | { at: 'goal' }
  | { at: 'thinking'; line: string }
  | { at: 'task'; title: string; reply: string }
  | { at: 'question'; reply: string; q: Question }
  | { at: 'path'; plan: PlanResult }
  | { at: 'error'; message: string; retry: () => void };

/**
 * "Something bigger" — Nu, listening.
 *
 * You say or type what you're trying to move forward. Nu decides whether
 * it's one task (and offers to just add it) or a project; for a project it
 * asks at most one question — which you can skip — and then shows the
 * first move, at full size, with Start with this. The whole path (what
 * done means, Nu's guesses, the later steps) is one tap away, editable, and
 * nothing is saved until you keep it.
 *
 * From Tell Nu (auto), the goal is already said: planning starts at once,
 * with no screen to confirm the words and no second button to press.
 *
 * Nu's screen, so Nu's navy whatever mode you came from.
 */
function NewProject() {
  return (
    <PinnedMode.Provider value="nu">
      <Screen />
    </PinnedMode.Provider>
  );
}

function Screen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ goal?: string; auto?: string }>();
  const { refresh, focusOn, showToast } = useStore();
  const [goal, setGoal] = useState(params.goal ?? '');
  // from Tell Nu: the goal is said, so Nu starts on it
  const auto = params.auto === '1' && !!params.goal?.trim();
  const [phase, setPhase] = useState<Phase>(auto ? { at: 'thinking', line: 'Nu is looking for a way in…' } : { at: 'goal' });
  // the first move at full size; the whole path behind See the whole plan
  const [whole, setWhole] = useState(false);
  const [answer, setAnswer] = useState('');
  const [notes, setNotes] = useState<Note[]>([]);

  // the proposal, as you edit it
  const [title, setTitle] = useState('');
  const [doneMeans, setDoneMeans] = useState('');
  const [guesses, setGuesses] = useState<string[]>([]);
  const [steps, setSteps] = useState<EditStep[]>([]);
  const [current, setCurrent] = useState(0);
  const [saving, setSaving] = useState(false);

  const fail = (e: unknown, retry: () => void) =>
    setPhase({ at: 'error', message: e instanceof PlannerError ? e.message : 'Something went wrong on the way to the planner.', retry });

  const showPlan = (plan: PlanResult) => {
    setTitle(plan.title);
    setDoneMeans(plan.done_means);
    setGuesses(plan.assumptions);
    setSteps(plan.steps.map(s => ({
      key: editKey(), title: s.title, first_action: s.first_action, why: s.why, est_minutes: s.est_minutes, edited: false,
    })));
    setCurrent(plan.current);
    setWhole(!plan.steps.length);
    setPhase({ at: 'path', plan });
  };

  // the planner is Claude: ask first, once (Not now keeps "write it myself")
  const [asking, setAsking] = useState(false);
  const answerAsk = async (ok: boolean) => {
    setAsking(false);
    await setAiConsent(ok);
    if (ok) send();
    else setPhase({ at: 'error', message: 'Nu plans with Claude, so it needs your yes first.', retry: send });
  };

  const send = async () => {
    const g = goal.trim();
    if (!g) return;
    if ((await aiConsent()) !== 'yes') return setAsking(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPhase({ at: 'thinking', line: 'Nu is looking for a way in…' });
    try {
      const r = await start(g);
      if (r.kind === 'task') return setPhase({ at: 'task', title: r.title, reply: r.reply });
      if (r.question) { setAnswer(''); return setPhase({ at: 'question', reply: r.reply, q: r.question }); }
      if (r.plan) showPlan({ ...r.plan, reply: r.plan.reply || r.reply });
    } catch (e) { fail(e, send); }
  };

  // from Tell Nu: plan the goal as soon as the screen is up, once
  const started = useRef(false);
  useEffect(() => {
    if (auto && !started.current) { started.current = true; send(); }
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const plan = async (withNotes: Note[]) => {
    setNotes(withNotes);
    setPhase({ at: 'thinking', line: 'Nu is sketching a path…' });
    try { showPlan(await draftPlan(goal.trim(), withNotes)); } catch (e) { fail(e, () => plan(withNotes)); }
  };

  const keep = async (focus: boolean) => {
    if (saving || !steps.length) return;
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const { taskId } = await createProject({
      goal: goal.trim(), title, done_means: doneMeans, assumptions: guesses, notes,
      steps, current: Math.max(0, current),
    });
    await refresh();
    // Ra is already showing the move when this sheet slides away
    if (focus && taskId) await focusOn(taskId);
    else showToast('Saved. The first move is on your home screen.');
    leave();
  };

  /** No planner: write the first move yourself. Still a project, still a path. */
  const byHand = () => {
    const g = goal.trim();
    setTitle(g.replace(/^(i need to|i have to|i want to|help me)\s+/i, '').replace(/^\w/, c => c.toUpperCase()).slice(0, 60));
    setDoneMeans('');
    setGuesses([]);
    setSteps([]);
    setCurrent(-1);
    setWhole(true);
    setPhase({ at: 'path', plan: { title: g, done_means: '', assumptions: [], reply: '', steps: [], current: -1 } });
  };

  const field = {
    color: t.ink, fontSize: 16.5, lineHeight: 23, padding: 14,
    backgroundColor: t.card, borderRadius: radius.lg, borderWidth: 1, borderColor: t.strokeStrong,
  } as const;

  const body = (() => {
    switch (phase.at) {
      case 'goal': return (
        <View style={{ gap: 18 }}>
          {/* Nu, listening, in her glow (room above so the glow isn't cut square) */}
          <View style={{ alignItems: 'center', marginTop: 34 }}>
            <NuGlow size={124}><Moving name="nu-breathe" style={{ width: 124, height: 132 }} /></NuGlow>
            <Text style={{ color: t.ink, fontSize: 34, lineHeight: 36, fontFamily: T.display, letterSpacing: -1.5, marginTop: 12, textAlign: 'center' }}>
              Plan a project
            </Text>
          </View>
          <TextInput value={goal} onChangeText={setGoal} multiline autoFocus={!params.goal}
            placeholder="e.g. I need to finish my website" placeholderTextColor={t.ink3}
            style={{ ...field, borderColor: t.stroke, minHeight: 110, textAlignVertical: 'top' }} />
          <MicButton value={goal} onChange={setGoal} />
        </View>
      );

      case 'thinking': return (
        <View style={{ alignItems: 'center', gap: 16, paddingTop: 40 }}>
          <Character name="nu-thinking" size={120} motion="bob" />
          <Text style={{ color: t.ink2, fontSize: 16 }}>{phase.line}</Text>
        </View>
      );

      case 'task': return (
        <View style={{ gap: 14 }}>
          <Character name="nu-idle" size={86} motion="greet" />
          <Text style={{ color: t.ink, fontSize: 24, lineHeight: 30, fontFamily: T.display }}>This sounds like one task.</Text>
          {!!phase.reply && <Text style={{ color: t.ink2, fontSize: 15.5, lineHeight: 22 }}>{phase.reply}</Text>}
          <Surface><Text style={{ color: t.ink, fontSize: 17, padding: 16, fontFamily: T.brand }}>{phase.title}</Text></Surface>
        </View>
      );

      case 'question': return (
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Character name="nu-ask" size={72} motion="greet" />
            {!!phase.reply && <Text style={{ flex: 1, color: t.ink2, fontSize: 15, lineHeight: 21 }}>{phase.reply}</Text>}
          </View>
          <Text style={{ color: t.ink, fontSize: 25, lineHeight: 31, fontFamily: T.display, letterSpacing: -0.4 }}>{phase.q.text}</Text>
          <HearIt text={phase.q.text} label="Hear the question" auto />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {phase.q.options.map(o => {
              const on = answer === o;
              return (
                <Pressable key={o} onPress={() => { Haptics.selectionAsync(); setAnswer(on ? '' : o); }} style={{
                  paddingHorizontal: 15, paddingVertical: 10, borderRadius: radius.pill,
                  borderWidth: 1.5, borderColor: on ? t.nu : t.strokeStrong, backgroundColor: on ? t.nuWash : 'transparent',
                }}>
                  <Text style={{ color: on ? t.ink : t.ink2, fontSize: 14.5, fontFamily: on ? T.brand : undefined }}>{o}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput value={phase.q.options.includes(answer) ? '' : answer} onChangeText={setAnswer} multiline
            placeholder="Or say it in your own words" placeholderTextColor={t.ink3} style={{ ...field, minHeight: 70 }} />
          <MicButton value={answer} onChange={setAnswer} label="Answer by voice" />
        </View>
      );

      case 'path': {
        // the move now, at full size: the rest of the plan is one tap away
        const move = steps[Math.max(0, current)];
        if (!whole && move) return (
          <View style={{ gap: 12, paddingTop: 28 }}>
            <Text style={{ color: t.ink3, fontSize: 12, letterSpacing: 1.6, fontFamily: T.brand }}>{title.toUpperCase()}</Text>
            <Text style={{ color: t.ink, fontSize: 34, lineHeight: 37, fontFamily: T.display, letterSpacing: -1.4 }}>{move.title}</Text>
            {!!move.first_action && move.first_action !== move.title && (
              <Text style={{ color: t.ink2, fontSize: 16.5, lineHeight: 23 }}>{move.first_action}</Text>
            )}
            {!!move.est_minutes && <Text style={{ color: t.ink3, fontSize: 15, fontFamily: T.brand }}>About {move.est_minutes} min</Text>}
            <Pressable onPress={() => { Haptics.selectionAsync(); setWhole(true); }} hitSlop={8} accessibilityRole="button"
              style={{ alignSelf: 'flex-start', marginTop: 10 }}>
              <Text style={{ color: t.nu, fontSize: 15, fontFamily: T.display }}>See the whole plan ›</Text>
            </Pressable>
          </View>
        );
        return (
        <View style={{ gap: 16 }}>
          <TextInput value={title} onChangeText={setTitle} placeholder="Name it" placeholderTextColor={t.ink3} multiline
            style={{ color: t.ink, fontSize: 26, lineHeight: 32, fontFamily: T.display, letterSpacing: -0.5, padding: 0 }} />
          {!!phase.plan.reply && (
            <View style={{ gap: 2 }}>
              <Text style={{ color: t.ink2, fontSize: 15, lineHeight: 21 }}>{phase.plan.reply}</Text>
              <HearIt text={phase.plan.reply} auto />
            </View>
          )}

          <View style={{ gap: 6 }}>
            <Text style={{ color: t.ink3, fontSize: 12, letterSpacing: 1.6, fontFamily: T.brand }}>DONE MEANS</Text>
            <TextInput value={doneMeans} onChangeText={setDoneMeans} multiline
              placeholder="What does finished look like? (optional)" placeholderTextColor={t.ink3}
              style={{ ...field, fontSize: 15, padding: 12 }} />
          </View>

          {!!guesses.length && (
            <View style={{ gap: 6 }}>
              <Text style={{ color: t.ink3, fontSize: 12, letterSpacing: 1.6, fontFamily: T.brand }}>NU’S GUESSES</Text>
              {guesses.map((g, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ flex: 1, color: t.ink2, fontSize: 14, lineHeight: 20 }}>I’m assuming: {g}</Text>
                  <Pressable onPress={() => setGuesses(guesses.filter((_, k) => k !== i))} hitSlop={10}
                    accessibilityLabel="That's wrong, remove this guess">
                    <Text style={{ color: t.ink3, fontSize: 17 }}>×</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <View style={{ gap: 8 }}>
            <Text style={{ color: t.ink3, fontSize: 12, letterSpacing: 1.6, fontFamily: T.brand }}>
              {steps.length ? 'THE MOVE NOW, THEN LATER IF NEEDED' : 'WHAT’S THE FIRST MOVE?'}
            </Text>
            <PathEditor steps={steps} current={current} onChange={(s, c) => { setSteps(s); setCurrent(c); }} />
          </View>

        </View>
        );
      }

      case 'error': return (
        <View style={{ gap: 14, paddingTop: 20 }}>
          <Character name="nu-idle" size={86} motion="none" />
          <Text style={{ color: t.ink, fontSize: 22, lineHeight: 28, fontFamily: T.display }}>Nu couldn’t plan this right now.</Text>
          <Text style={{ color: t.ink2, fontSize: 15.5, lineHeight: 22 }}>{phase.message}</Text>
        </View>
      );
    }
  })();

  const footer = (() => {
    switch (phase.at) {
      case 'goal': return (
        <>
          <Primary label="Find my first move" tone="ra" disabled={!goal.trim()} onPress={send} />
        </>
      );
      case 'task': return (
        <>
          <Primary label="Add it as a task" tone="ra" onPress={async () => {
            await capture(phase.title);
            await refresh();
            showToast('Added.');
            leave();
          }} />
          <Ghost label="Plan it as a project anyway" onPress={() => plan([])} />
        </>
      );
      case 'question': return (
        <>
          <Primary label="See a possible path" tone="ra"
            onPress={() => plan(answer.trim() ? [{ q: phase.q.text, a: answer.trim() }] : [{ q: phase.q.text, a: '(skipped)' }])} />
          <Pressable onPress={() => plan([{ q: phase.q.text, a: '(skipped)' }])} hitSlop={8} style={{ alignSelf: 'center', paddingVertical: 4 }}>
            <Text style={{ color: t.ink3, fontSize: 14 }}>Skip this question</Text>
          </Pressable>
        </>
      );
      case 'path': return (
        <>
          <Primary label="Start with this" tone="ra" disabled={!steps.length || saving} onPress={() => keep(true)} />
          <Ghost label="Keep it for later" onPress={() => keep(false)} />
        </>
      );
      case 'error': return (
        <>
          <Primary label="Try again" tone="ra" onPress={phase.retry} />
          <Ghost label="Write the first move myself" onPress={byHand} />
        </>
      );
      default: return null;
    }
  })();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Mica />
      <StatusBar style={t.statusBar} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 4, height: 48 }}>
          <Pressable onPress={() => {
            // the whole plan folds back to the first move; otherwise out
            if (phase.at === 'path' && whole && phase.plan.steps.length) return setWhole(false);
            if (auto || phase.at === 'goal' || phase.at === 'thinking') return leave();
            setPhase({ at: 'goal' });
          }}
            hitSlop={12} style={{ flex: 1, paddingVertical: 8 }}>
            <Text style={{ color: t.ink3, fontSize: 16, fontFamily: T.brand }}>← Back</Text>
          </Pressable>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {body}
        </ScrollView>
        {!!footer && <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8, gap: 10 }}>{footer}</View>}
      </KeyboardAvoidingView>
      {/* closed without an answer: back to the goal, so the screen isn't left thinking */}
      <AiConsent visible={asking} onAnswer={answerAsk}
        onClose={() => { setAsking(false); if (phase.at === 'thinking') setPhase({ at: 'goal' }); }} />
    </SafeAreaView>
  );
}

/** On a wide web window, in a readable column (src/components/Desk.tsx). */
export default readable(NewProject);
