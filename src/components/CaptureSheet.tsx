import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal, View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useStore, useTheme } from '../store';
import { capture } from '../db';
import { route, parseTask, describe, type Draft } from '../assistant';
import { radius, type as T } from '../theme';
import { Character } from '../ui';
import { MicButton } from './Voice';
import { NuGlow } from './NuGlow';

/**
 * CAPTURE — the one way in. "Add a task" and "Say it" used to be two
 * screens; now there is one sheet over whichever room you're in, and Nu
 * works out what you gave it:
 *   - one line is a task — dates, times, repeats and lengths read out of the
 *     sentence ("dentist friday at 10 for 30 min") and shown back;
 *   - several lines are a brain dump — each line its own task;
 *   - something open-ended ("work on the thesis") is a project, and goes to
 *     Nu's planner with the words already in it.
 * "More details" opens the full composer with the draft filled in.
 */
export function CaptureSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { refresh, showToast } = useStore();
  const [text, setText] = useState('');
  const input = useRef<TextInput>(null);

  useEffect(() => { if (!visible) setText(''); }, [visible]);

  // what Nu makes of it, as you type
  const lines = useMemo(() => text.split('\n').map(s => s.trim()).filter(Boolean), [text]);
  const read = useMemo(() => {
    if (!lines.length) return null;
    if (lines.length > 1) return { kind: 'many' as const, drafts: lines.map(parseTask) };
    const intent = route(lines[0]);
    if (intent.kind === 'vague') return { kind: 'project' as const, draft: intent.draft };
    return { kind: 'task' as const, draft: intent.kind === 'create' ? intent.draft : parseTask(lines[0]) };
  }, [lines]);

  const save = async (d: Draft) => capture(d.title, {
    activity: d.activity, label: d.label, est_minutes: d.est_minutes,
    due_at: d.due_at, has_time: d.has_time,
    repeat_rule: d.repeat_rule, repeat_days: d.repeat_days, priority: d.priority,
  });

  const add = async () => {
    if (!read) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (read.kind === 'many') {
      for (const d of read.drafts) await save(d);
      showToast(`${read.drafts.length} things put down`);
    } else {
      await save(read.draft);
      showToast('Put down');
    }
    await refresh();
    onClose();
  };

  const plan = () => {
    const goal = lines.join(' ');
    onClose();
    router.push({ pathname: '/project/new', params: { goal } });
  };

  const details = () => {
    const d = read && read.kind !== 'many' ? read.draft : parseTask(lines[0] ?? '');
    onClose();
    router.push({
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
    });
  };

  const readback = read?.kind === 'task' ? describe(read.draft)
    : read?.kind === 'many' ? `${read.drafts.length} separate things — each one its own task`
    : read?.kind === 'project' ? 'That sounds bigger than one task.'
    : '';

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}
      onShow={() => setTimeout(() => input.current?.focus(), 80)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable onPress={() => { Keyboard.dismiss(); onClose(); }} style={{ flex: 1, backgroundColor: 'rgba(5,8,23,0.72)' }}
          accessibilityLabel="Close" />
        <View style={{
          borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden',
          borderWidth: 1, borderBottomWidth: 0, borderColor: t.strokeStrong,
          paddingHorizontal: 18, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 16),
        }}>
          <LinearGradient colors={t.key === 'nu' ? ['#1E2750', '#121833'] : [t.card, t.base]}
            style={{ position: 'absolute', inset: 0 }} />
          <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: t.strokeStrong, alignSelf: 'center', marginBottom: 14 }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <NuGlow size={66}><Character name="nu-listen" size={60} motion="greet" /></NuGlow>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 20, fontFamily: T.display, letterSpacing: -0.4 }}>Tell Nu.</Text>
              <Text style={{ color: t.ink2, fontSize: 13.5, marginTop: 1 }}>What’s on your mind? Get it out first — details can wait.</Text>
            </View>
          </View>

          {/* in a View: on the web a bare input would sit under the sheet's gradient */}
          <View>
          <TextInput ref={input} value={text} onChangeText={setText} multiline
            placeholder="Anything — one thing, or everything, one per line"
            placeholderTextColor={t.ink3}
            style={{
              marginTop: 14, minHeight: 52, maxHeight: 160, borderRadius: 14, borderWidth: 1,
              borderColor: t.strokeStrong, backgroundColor: t.layer, color: t.ink,
              fontSize: 16, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 14,
            }} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, minHeight: 22 }}>
            <View style={{ flex: 1 }}>
              {!!readback && <Text style={{ color: read?.kind === 'project' ? t.nu : t.ink3, fontSize: 13 }}>{readback}</Text>}
            </View>
            {!!lines.length && (
              <Pressable onPress={details} hitSlop={8} accessibilityRole="button">
                <Text style={{ color: t.nu, fontSize: 13, fontFamily: T.brand }}>More details</Text>
              </Pressable>
            )}
          </View>

          <View style={{ marginTop: 10 }}>
            <MicButton value={text} onChange={setText} label="Say it to Nu" />
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            {read?.kind === 'project' && (
              <Pressable onPress={plan} accessibilityRole="button" style={({ pressed }) => ({
                flex: 1, minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: t.nu, backgroundColor: pressed ? t.nuWash : 'transparent',
              })}>
                <Text style={{ color: t.nu, fontSize: 15, fontFamily: T.brand }}>Plan it with Nu</Text>
              </Pressable>
            )}
            <Pressable onPress={add} disabled={!read} accessibilityRole="button"
              style={({ pressed }) => ({ flex: 1, opacity: read ? (pressed ? 0.9 : 1) : 0.45 })}>
              <LinearGradient colors={t.raBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: t.onRa, fontSize: 15, fontFamily: T.display }}>
                  {read?.kind === 'many' ? `Put down all ${read.drafts.length}` : read?.kind === 'project' ? 'Just add it' : 'Put it down'}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
