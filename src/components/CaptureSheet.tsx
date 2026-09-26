import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Modal, Image, useWindowDimensions, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useStore, useTheme } from '../store';
import { capture } from '../db';
import { route, parseTask, describe, type Draft } from '../assistant';
import { type as T } from '../theme';
import { poseImage } from '../ui';
import Svg, { Path, Circle } from 'react-native-svg';
import { labelById } from '../labels';
import { LabelGlyph } from './LabelIcon';
import { useDictation } from '../voice';
import { DotWave } from './DotWave';
import { readInput } from '../coach';
import type { StateRead } from '../learn/types';

/**
 * TELL NU ANYTHING — the one way in. "Add a task" and "Say it" used to be
 * two screens; now it's one sheet over whichever room you're in, and Nu
 * works out what you gave it:
 *   - one line is a task — dates, times, repeats and lengths read out of the
 *     sentence ("dentist friday at 10 for 30 min") and shown back;
 *   - several lines are a brain dump — each line its own task;
 *   - something open-ended ("work on the thesis") is a project, and goes to
 *     Nu's planner with the words already in it.
 * When? and How long? set those in a tap; + Details opens the full composer.
 */
export function CaptureSheet(props: { visible: boolean; onClose: () => void }) {
  return <CaptureBody {...props} />;
}

const at = (days: number, h: number) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); return d.getTime(); };
const WHEN = [
  { label: 'Today', due: () => at(0, 18) },
  { label: 'Tomorrow', due: () => at(1, 9) },
  { label: 'Next week', due: () => at(7, 9) },
];
const HOW_LONG = [5, 15, 30, 60];
const CORAL_ON = '#FF6B35';

function CaptureBody({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const { refresh, showToast } = useStore();
  const [text, setText] = useState('');
  const [open, setOpen] = useState<'when' | 'long' | null>(null);
  const [when, setWhen] = useState<number | null>(null);      // index into WHEN
  const [mins, setMins] = useState<number | null>(null);
  // what the coach made of it, for the text it was read for (only messy text reaches the model)
  const [smart, setSmart] = useState<{ text: string; read: StateRead } | null>(null);
  const input = useRef<TextInput>(null);
  const [room, setRoom] = useState(999);   // the height left for Nu

  useEffect(() => {
    if (!visible) { setText(''); setOpen(null); setWhen(null); setMins(null); setSmart(null); return; }
    // opened with words already (a dev link, later the share sheet)
    const draft = useStore.getState().tellDraft;
    if (draft) { setText(draft); useStore.setState({ tellDraft: null }); }
  }, [visible]);

  // when you pause: read it properly. readInput decides on the phone first and
  // asks the model only when the phone isn't sure
  useEffect(() => {
    const v = text.trim();
    if (v.split(/\s+/).length < 4 || v.includes('\n')) return;
    let dead = false;
    const timer = setTimeout(() => {
      readInput(v).then(r => { if (!dead) setSmart({ text: v, read: r }); }).catch(() => {});
    }, 900);
    return () => { dead = true; clearTimeout(timer); };
  }, [text]);

  // what Nu makes of it, as you type
  const lines = useMemo(() => text.split('\n').map(s => s.trim()).filter(Boolean), [text]);
  const coached = smart && smart.text === text.trim() ? smart.read : null;
  const read = useMemo(() => {
    if (!lines.length) return null;
    if (lines.length > 1) return { kind: 'many' as const, drafts: lines.map(parseTask) };
    // one run-on sentence that was really several things
    if (coached?.kind === 'tasks' && (coached.items?.length ?? 0) > 1) return { kind: 'many' as const, drafts: coached.items!.map(parseTask) };
    if (coached?.kind === 'project') return { kind: 'project' as const, draft: parseTask(lines[0]) };
    const intent = route(lines[0]);
    if (intent.kind === 'vague') return { kind: 'project' as const, draft: intent.draft };
    return { kind: 'task' as const, draft: intent.kind === 'create' ? intent.draft : parseTask(lines[0]) };
  }, [lines, coached]);

  // what you set with a tap wins over what was read from the words
  const withChoices = (d: Draft): Draft => ({
    ...d,
    ...(when != null ? { due_at: WHEN[when].due(), has_time: false } : {}),
    ...(mins != null ? { est_minutes: mins } : {}),
  });

  const save = async (d: Draft) => capture(d.title, {
    activity: d.activity, label: d.label, est_minutes: d.est_minutes,
    due_at: d.due_at, has_time: d.has_time,
    repeat_rule: d.repeat_rule, repeat_days: d.repeat_days, priority: d.priority,
  });

  const add = async () => {
    if (!read) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (read.kind === 'many') {
      for (const d of read.drafts) await save(withChoices(d));
      showToast(`${read.drafts.length} things put down`);
    } else {
      await save(withChoices(read.draft));
      showToast('Put down');
    }
    await refresh();
    onClose();
  };

  const plan = () => {
    const goal = lines.join(' ');
    onClose();
    setTimeout(() => router.push({ pathname: '/project/new', params: { goal } }), 250);
  };

  const details = () => {
    const d = withChoices(read && read.kind !== 'many' ? read.draft : parseTask(lines[0] ?? ''));
    onClose();
    setTimeout(() => router.push({
      pathname: '/compose',
      params: {
        title: d.title,
        ...(d.est_minutes ? { minutes: String(d.est_minutes) } : {}),
        ...(d.due_at ? { due: String(d.due_at), hasTime: d.has_time ? '1' : '0' } : {}),
        ...(d.repeat_rule ? { repeat: d.repeat_rule } : {}),
        ...(d.repeat_days ? { days: d.repeat_days } : {}),
        ...(d.priority ? { priority: String(d.priority) } : {}),
        ...(d.activity ? { activity: d.activity } : {}),
        ...(d.label ? { label: d.label } : {}),
      },
    }), 250);
  };

  const readback = read?.kind === 'task' ? describe(withChoices(read.draft))
    : read?.kind === 'many' ? `${read.drafts.length} separate things`
    : read?.kind === 'project' ? 'That sounds bigger than one task.'
    : '';

  const Chip = ({ label, on, onPress, icon }: { label: string; on?: boolean; onPress: () => void; icon?: React.ReactNode }) => (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={({ pressed }) => ({
        height: 34, borderRadius: 17, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13,
        borderWidth: 1, borderColor: t.stroke, backgroundColor: pressed ? t.subtle : t.card,
      })}>
      {icon}
      <Text numberOfLines={1} style={{ color: t.nu, fontSize: 13, fontFamily: T.brand }}>{label}</Text>
    </Pressable>
  );

  // Tell Nu listens as soon as it opens (v5, 7:14); Aa is for typing instead
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const base = useRef('');
  const dict = useDictation(heard => setText([base.current, heard].filter(Boolean).join(' ')));
  const listening = dict.state === 'listening';
  const nuSize = Math.min(listening ? 150 : 190, room + 18);
  // type or say it — both there from the start: the field is ready for the
  // keyboard, the mic is one tap away, and either one fills the same words
  useEffect(() => {
    if (!visible) { if (listening) dict.toggle(); return; }
    const id = setTimeout(() => input.current?.focus(), 120);
    return () => clearTimeout(id);
  }, [visible]);   // eslint-disable-line react-hooks/exhaustive-deps
  const toggleMic = () => {
    Haptics.selectionAsync();
    if (!listening) { base.current = text.trim(); input.current?.blur(); }
    dict.toggle();
  };

  // what Nu understood, as chips: when, what kind, how long
  const d = read && read.kind !== 'many' ? withChoices(read.draft) : null;
  const label = d?.label ? labelById(d.label) : null;
  const whenText = d?.due_at ? new Date(d.due_at).toLocaleDateString(undefined, { weekday: 'long' }) === new Date(Date.now() + 86400_000).toLocaleDateString(undefined, { weekday: 'long' })
    ? `Tomorrow${d.has_time ? ` · ${new Date(d.due_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`
    : describe({ ...d, est_minutes: null }) : null;
  const words = text.trim().split(/\s+/).filter(Boolean);
  const tail = listening && words.length > 3 ? 2 : 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: t.base, paddingTop: insets.top + 22, paddingBottom: Math.max(insets.bottom, 16) + 14, paddingHorizontal: 24 }}>
        {/* what you're saying or typing, as big as a headline */}
        <TextInput ref={input} value={text} onChangeText={setText} multiline
          placeholder="Type it, or say it." placeholderTextColor={t.mute ?? t.ink3}
          style={{ color: t.ink, fontSize: 36, lineHeight: 37, fontFamily: T.display, letterSpacing: -1.6, maxHeight: 190, padding: 0 }} />

        {/* what Nu understood */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 18 }}>
          {!!whenText && <Chip label={whenText} on={open === 'when'} onPress={() => setOpen(o => (o === 'when' ? null : 'when'))}
            icon={<Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={t.nu} strokeWidth={1.8} strokeLinecap="round"><Circle cx={12} cy={12} r={9} /><Path d="M12 7v5l3 2" /></Svg>} />}
          {!!label && <Chip label={label.name} onPress={details} icon={<LabelGlyph id={label.id} size={15} color={t.nu} />} />}
          {!!d?.est_minutes && <Chip label={`${d.est_minutes} min`} on={open === 'long'} onPress={() => setOpen(o => (o === 'long' ? null : 'long'))} />}
          {read?.kind === 'many' && <Chip label={`${read.drafts.length} separate things`} onPress={() => {}} />}
          {!!words.length && !whenText && read?.kind !== 'many' && <Chip label="When?" onPress={() => setOpen(o => (o === 'when' ? null : 'when'))} />}
          {!!words.length && <Chip label="+ Details" onPress={details} />}
        </View>
        {open === 'when' && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 7 }}>
            {WHEN.map((w, i) => <Chip key={w.label} label={w.label} on={when === i} onPress={() => { setWhen(when === i ? null : i); setOpen(null); }} />)}
          </View>
        )}
        {open === 'long' && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 7 }}>
            {HOW_LONG.map(m => <Chip key={m} label={`${m} min`} on={mins === m} onPress={() => { setMins(mins === m ? null : m); setOpen(null); }} />)}
          </View>
        )}
        {!!coached?.reply && coached.source === 'model' && (
          <Text style={{ color: t.nu, fontSize: 14, lineHeight: 20, marginTop: 12, fontFamily: T.brand }}>{coached.reply}</Text>
        )}
        {read?.kind === 'project' && (
          <Pressable onPress={plan} hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: 12 }}>
            <Text style={{ color: t.nu, fontSize: 14.5, fontFamily: T.display }}>Plan it with Nu ›</Text>
          </Pressable>
        )}

        {/* your voice, in dots */}
        {listening && <View style={{ marginTop: 28 }}><DotWave active width={width - 48} /></View>}

        {/* Nu, listening — as big as the room above the buttons allows (the keyboard takes most of it) */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }} pointerEvents="none"
          onLayout={e => setRoom(e.nativeEvent.layout.height)}>
          {nuSize >= 72 && <Image source={poseImage('nu-listen')} resizeMode="contain" style={{ width: nuSize, height: nuSize, marginBottom: -18 }} />}
        </View>

        {/* Aa · ✓ · × */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {dict.state !== 'unavailable' ? (
            <Pressable onPress={toggleMic} accessibilityRole="button" accessibilityLabel={listening ? 'Stop listening' : 'Say it'}
              accessibilityState={{ selected: listening }}
              style={({ pressed }) => ({
                width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center',
                borderWidth: listening ? 2 : 1, borderColor: listening ? CORAL_ON : t.stroke,
                backgroundColor: listening ? 'rgba(255,107,53,0.12)' : pressed ? t.subtle : t.card,
              })}>
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={listening ? CORAL_ON : t.nu} strokeWidth={2} strokeLinecap="round"><Path d="M9 6a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0M12 18v3" /></Svg>
            </Pressable>
          ) : <View style={{ width: 54 }} />}
          <Pressable onPress={add} disabled={!read} accessibilityRole="button"
            accessibilityLabel={read?.kind === 'many' ? `Add all ${read.drafts.length}` : 'Add it'}
            style={({ pressed }) => ({
              width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center',
              backgroundColor: t.nu, opacity: read ? 1 : 0.45, transform: [{ scale: pressed ? 0.96 : 1 }],
            })}>
            <Svg width={30} height={30} viewBox="0 0 24 24"><Path d="M5 12.5l4.5 4.5L19 7.5" stroke={t.onNu} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg>
          </Pressable>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close"
            style={({ pressed }) => ({ width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.stroke, backgroundColor: pressed ? t.subtle : t.card })}>
            <Svg width={20} height={20} viewBox="0 0 24 24"><Path d="M6 6l12 12M18 6L6 18" stroke={t.nu} strokeWidth={1.9} strokeLinecap="round" /></Svg>
          </Pressable>
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
