import { useCallback, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, Image,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, useStore } from '../src/store';
import { capture, todayList, inbox as inboxQuery } from '../src/db';
import { route, describe, type Draft } from '../src/assistant';
import { activityById, SCENES, type ActivityId } from '../src/activities';
import { rankFor } from '../src/reward';
import { radius, elevation, type as T } from '../src/theme';
import { Mica, Surface, Character, IconChevron, IconSearch } from '../src/ui';
import { LabelGlyph } from '../src/components/LabelIcon';

interface Msg {
  id: string;
  from: 'you' | 'nura';
  text?: string;
  draft?: Draft;
  /** set once the draft has been added, so the card locks */
  added?: boolean;
}

const uid = () => Math.random().toString(36).slice(2);

const EXAMPLES = [
  'gym tuesday and thursday at 7',
  'pay the council tax on the 28th',
  'call mum tomorrow evening',
  'what should I do now?',
];

/**
 * Nura's assistant.
 *
 * No model behind it — see assistant.ts for why that's a deliberate choice
 * rather than a limitation. The valuable job here is turning one sentence into
 * a correctly-structured task, and that job is deterministic: instant, free,
 * works offline, and structurally incapable of inventing a date that wasn't in
 * what you typed.
 *
 * It never commits on your behalf. Every parse comes back as a card showing
 * exactly what it understood, and you press Add. An assistant that silently
 * creates the wrong recurring event is worse than no assistant at all.
 */
export default function Chat() {
  const t = useTheme();
  const { refresh, now, light, today, inbox } = useStore();
  const scroller = useRef<ScrollView>(null);
  const [text, setText] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([{
    id: 'hello',
    from: 'nura',
    text: 'Tell me what needs doing, the way you’d say it out loud. I’ll work out the date, the repeat and how long — and show you before anything is saved.',
  }]);

  const push = (m: Omit<Msg, 'id'>) => {
    setMsgs(prev => [...prev, { ...m, id: uid() }]);
    setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60);
  };

  const answer = useCallback(async (input: string) => {
    const intent = route(input);

    if (intent.kind === 'hello') {
      return push({ from: 'nura', text: 'Hello. What needs doing?' });
    }
    if (intent.kind === 'help') {
      return push({
        from: 'nura',
        text: 'Say things like "gym tuesday and thursday at 7", "dentist on the 12th", or "read for 30 min tomorrow". Ask me "what should I do now", "what’s on today", or "how am I doing".',
      });
    }
    if (intent.kind === 'now') {
      return push({
        from: 'nura',
        text: now
          ? `${now.title}. That’s the one I’d hand you — tap Focus on the home screen and it’s already loaded.`
          : 'Nothing waiting. That’s allowed.',
      });
    }
    if (intent.kind === 'today') {
      const list = await todayList();
      return push({
        from: 'nura',
        text: list.length
          ? `${list.length} on today:\n${list.slice(0, 6).map(x => `· ${x.title}`).join('\n')}`
          : 'Nothing scheduled for today.',
      });
    }
    if (intent.kind === 'progress') {
      const rank = rankFor(light);
      return push({
        from: 'nura',
        text: `${light} light, ${rank.name}. ${today} of that today. It only goes up — there’s no streak to break.`,
      });
    }
    if (intent.kind === 'count') {
      const open = await inboxQuery();
      return push({
        from: 'nura',
        text: open.length ? `${open.length} waiting. One at a time.` : 'Nothing waiting.',
      });
    }
    push({ from: 'nura', draft: intent.draft });
  }, [now, light, today]);

  const send = async () => {
    const v = text.trim();
    if (!v) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    push({ from: 'you', text: v });
    setText('');
    setTimeout(() => answer(v), 220);   // a beat, so it reads as a reply
  };

  const add = async (m: Msg) => {
    if (!m.draft) return;
    const d = m.draft;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await capture(d.title, {
      activity: d.activity, label: d.label, est_minutes: d.est_minutes,
      due_at: d.due_at, has_time: d.has_time,
      repeat_rule: d.repeat_rule, repeat_days: d.repeat_days, priority: d.priority,
    });
    await refresh();
    setMsgs(prev => prev.map(x => x.id === m.id ? { ...x, added: true } : x));
    push({ from: 'nura', text: 'Added. Anything else?' });
  };

  const DraftCard = ({ m }: { m: Msg }) => {
    const d = m.draft!;
    const a = activityById(d.activity);
    const c = a ? (t.key === 'ra' ? a.onLight : a.tint) : t.ra;
    const meta = describe(d);
    return (
      <View style={[{
        borderRadius: radius.lg, overflow: 'hidden', maxWidth: '92%',
        borderWidth: 1, borderColor: `${c}44`,
      }, elevation.e4]}>
        <LinearGradient colors={[`${c}2E`, `${c}10`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1, padding: 14, paddingRight: 4 }}>
              <Text style={{ color: t.ink, fontSize: 17, fontFamily: T.display, lineHeight: 23 }}>
                {d.title}
              </Text>
              {!!meta && (
                <Text style={{ color: t.ink2, fontSize: 13.5, marginTop: 4 }}>{meta}</Text>
              )}
              {!!d.label && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 }}>
                  <LabelGlyph id={d.label} size={14} color={c} />
                  <Text style={{ color: c, fontSize: 12.5, fontFamily: T.brand }}>
                    {a?.name ?? d.label}
                  </Text>
                </View>
              )}
            </View>
            {!!a && (
              <Image source={SCENES[a.id as ActivityId]}
                style={{ width: 96, height: 84, marginRight: -6 }} resizeMode="contain" />
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: 8, padding: 12, paddingTop: 0 }}>
            {m.added ? (
              <Text style={{ color: c, fontSize: 14, fontFamily: T.brand, paddingVertical: 8 }}>
                ✓ Added
              </Text>
            ) : (
              <>
                <Pressable onPress={() => add(m)} style={{
                  flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: radius.pill,
                  backgroundColor: `${c}3D`, borderWidth: 1, borderColor: `${c}66`,
                }}>
                  <Text style={{ color: t.ink, fontSize: 14.5, fontFamily: T.brand }}>Add it</Text>
                </Pressable>
                <Pressable onPress={() => { router.back(); router.push('/compose'); }} style={{
                  paddingHorizontal: 16, paddingVertical: 11, borderRadius: radius.pill,
                  borderWidth: 1, borderColor: t.strokeStrong,
                }}>
                  <Text style={{ color: t.ink2, fontSize: 14.5 }}>Edit</Text>
                </Pressable>
              </>
            )}
          </View>
        </LinearGradient>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Mica />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 2, paddingBottom: 8 }}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={{ paddingVertical: 8 }}>
            <Text style={{ color: t.ink3, fontSize: 16 }}>← Today</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          <Character name="nu-idle" size={34} motion="greet" />
        </View>

        <ScrollView
          ref={scroller}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 11 }}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {msgs.map(m => (
            <View key={m.id} style={{ alignItems: m.from === 'you' ? 'flex-end' : 'flex-start' }}>
              {m.draft ? <DraftCard m={m} /> : (
                <View style={{
                  maxWidth: '88%', paddingHorizontal: 15, paddingVertical: 11,
                  borderRadius: radius.lg,
                  backgroundColor: m.from === 'you' ? t.nuWash : t.layer,
                  borderWidth: 1,
                  borderColor: m.from === 'you' ? t.strokeStrong : t.stroke,
                }}>
                  <Text style={{ color: t.ink, fontSize: 15.5, lineHeight: 22 }}>{m.text}</Text>
                </View>
              )}
            </View>
          ))}

          {msgs.length <= 1 && (
            <View style={{ gap: 8, marginTop: 6 }}>
              <Text style={{ color: t.ink3, fontSize: 13, marginLeft: 3 }}>Try one:</Text>
              {EXAMPLES.map(x => (
                <Pressable key={x} onPress={() => { setText(x); }} style={{
                  alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 10,
                  borderRadius: radius.pill, borderWidth: 1, borderColor: t.strokeStrong,
                }}>
                  <Text style={{ color: t.ink2, fontSize: 14 }}>{x}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>

        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <Surface>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 8 }}>
              <TextInput
                value={text} onChangeText={setText}
                onSubmitEditing={send} returnKeyType="send" blurOnSubmit={false}
                placeholder="Say it however you'd say it…" placeholderTextColor={t.ink3}
                style={{ flex: 1, paddingVertical: 14, color: t.ink, fontSize: 16 }}
              />
              <Pressable onPress={send} disabled={!text.trim()} style={{
                width: 38, height: 38, borderRadius: 19,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: text.trim() ? t.ra : t.subtle,
              }}>
                <IconChevron size={19} color={text.trim() ? t.onRa : t.ink3} />
              </Pressable>
            </View>
          </Surface>
          <Text style={{ color: t.ink3, fontSize: 11.5, textAlign: 'center', marginTop: 7 }}>
            Runs on your phone. Nothing you type here is sent anywhere.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
