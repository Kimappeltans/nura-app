import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useStore, useTheme, PinnedPalette } from '../store';
import { SHEETS } from '../themeTrials';
import { capture } from '../db';
import { route, parseTask, describe, type Draft } from '../assistant';
import { type as T } from '../theme';
import { Character, Primary, Ghost } from '../ui';
import { MicButton } from './Voice';
import { NuGlow, NU_SIZE } from './NuGlow';
import { Sheet } from './Sheet';
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
  const room = useTheme();
  const sheetTrial = useStore(s => s.sheetTrial);
  // TRIAL: over a dark room, the sheet can be Nu's own light space
  const own = room.key === 'nu' ? SHEETS[sheetTrial] : null;
  return own
    ? <PinnedPalette.Provider value={own}><CaptureBody {...props} /></PinnedPalette.Provider>
    : <CaptureBody {...props} />;
}

const at = (days: number, h: number) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); return d.getTime(); };
const WHEN = [
  { label: 'Today', due: () => at(0, 18) },
  { label: 'Tomorrow', due: () => at(1, 9) },
  { label: 'Next week', due: () => at(7, 9) },
];
const HOW_LONG = [5, 15, 30, 60];

function CaptureBody({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const { refresh, showToast } = useStore();
  const [text, setText] = useState('');
  const [open, setOpen] = useState<'when' | 'long' | null>(null);
  const [when, setWhen] = useState<number | null>(null);      // index into WHEN
  const [mins, setMins] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  // what the coach made of it, for the text it was read for (only messy text reaches the model)
  const [smart, setSmart] = useState<{ text: string; read: StateRead } | null>(null);
  const input = useRef<TextInput>(null);

  useEffect(() => { if (!visible) { setText(''); setOpen(null); setWhen(null); setMins(null); setSmart(null); } }, [visible]);

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

  const Chip = ({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) => (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={({ pressed }) => ({
        flex: 1, minHeight: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
        borderWidth: 1, borderColor: on ? t.pickEdge ?? t.nu : t.strokeStrong, backgroundColor: on ? t.pick ?? t.nuWash : pressed ? t.subtle : t.layer,
      })}>
      <Text numberOfLines={1} style={{ color: on ? t.ink : t.ink2, fontSize: 13, fontFamily: T.brand }}>{label}</Text>
    </Pressable>
  );

  return (
    <Sheet visible={visible} onClose={onClose} onShow={() => setTimeout(() => input.current?.focus(), 80)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <NuGlow size={NU_SIZE.sheet}><Character name="nu-listen" size={NU_SIZE.sheet} motion="greet" /></NuGlow>
        <Text style={{ flex: 1, color: t.ink, fontSize: 21, fontFamily: T.display, letterSpacing: -0.4 }}>Tell Nu anything.</Text>
      </View>

      {/* in a View: on the web a bare input would sit under the sheet's gradient */}
      <View style={{
        marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1,
        borderColor: focused ? t.nu : t.strokeStrong, backgroundColor: t.layer, paddingLeft: 14, paddingRight: 6,
      }}>
        <TextInput ref={input} value={text} onChangeText={setText} multiline
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          placeholder="What needs doing?" placeholderTextColor={t.ink3}
          style={{ flex: 1, minHeight: 50, maxHeight: 150, color: t.ink, fontSize: 16, paddingTop: 14, paddingBottom: 14 }} />
        <MicButton value={text} onChange={setText} label="Say it to Nu" compact />
      </View>

      <View style={{ flexDirection: 'row', gap: 7, marginTop: 10 }}>
        <Chip label={when != null ? WHEN[when].label : 'When?'} on={open === 'when' || when != null} onPress={() => setOpen(o => (o === 'when' ? null : 'when'))} />
        <Chip label={mins != null ? `${mins} min` : 'How long?'} on={open === 'long' || mins != null} onPress={() => setOpen(o => (o === 'long' ? null : 'long'))} />
        <Chip label="+ Details" onPress={details} />
      </View>
      {open === 'when' && (
        <View style={{ flexDirection: 'row', gap: 7, marginTop: 7 }}>
          {WHEN.map((w, i) => <Chip key={w.label} label={w.label} on={when === i} onPress={() => { setWhen(when === i ? null : i); setOpen(null); }} />)}
        </View>
      )}
      {open === 'long' && (
        <View style={{ flexDirection: 'row', gap: 7, marginTop: 7 }}>
          {HOW_LONG.map(m => <Chip key={m} label={`${m} min`} on={mins === m} onPress={() => { setMins(mins === m ? null : m); setOpen(null); }} />)}
        </View>
      )}

      {/* Nu answers, when there's something kind to say (a feeling, a lot at once) */}
      {!!coached?.reply && coached.source === 'model' && (
        <Text style={{ color: t.nu, fontSize: 14, lineHeight: 20, marginTop: 10, fontFamily: T.brand }}>{coached.reply}</Text>
      )}
      {!!readback && (
        <Text style={{ color: read?.kind === 'project' ? t.nu : t.ink3, fontSize: 13, marginTop: 10 }}>{readback}</Text>
      )}

      <View style={{ flexDirection: 'row', gap: 9, marginTop: 14 }}>
        {read?.kind === 'project' && <Ghost label="Plan it with Nu" onPress={plan} style={{ flex: 1, borderColor: t.nu }} />}
        <Primary label={read?.kind === 'many' ? `Add all ${read.drafts.length}` : 'Add it'} tone="ra"
          onPress={add} disabled={!read} style={{ flex: 1 }} />
      </View>
    </Sheet>
  );
}
