import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTheme } from '../store';
import { radius, type as T } from '../theme';
import { BUTTON } from '../ui';
import { useDictation, say, hush, canSpeak, useSpeaking, readsAloud } from '../voice';

/**
 * Speak into a text field. What you say lands in the field after whatever
 * was already there, where you can read and change it; nothing is sent until
 * you press the screen's own button. Renders nothing where the phone can't
 * listen — the field is still there to type in.
 */
export function MicButton({ value, onChange, label = 'Speak to Nu', compact }: {
  value: string;
  onChange: (text: string) => void;
  label?: string;
  /** a round mic button that sits inside a field, no words */
  compact?: boolean;
}) {
  const t = useTheme();
  const base = useRef('');
  const { state, note, toggle } = useDictation(heard => onChange([base.current, heard].filter(Boolean).join(' ')));
  if (state === 'unavailable') return null;
  const on = state === 'listening';
  if (compact) {
    return (
      <Pressable onPress={() => { Haptics.selectionAsync(); if (!on) base.current = value.trim(); toggle(); }}
        accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={on ? 'Stop listening' : label}
        hitSlop={6} style={({ pressed }) => ({
          width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
          borderWidth: 1.5, borderColor: on ? t.ra : t.strokeStrong,
          backgroundColor: on ? t.raWash : pressed ? t.subtle : 'transparent',
        })}>
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={on ? t.ra : t.ink2} strokeWidth={2} strokeLinecap="round">
          <Rect x={9} y={3} width={6} height={12} rx={3} /><Path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </Svg>
      </Pressable>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <Pressable
        onPress={() => { Haptics.selectionAsync(); if (!on) base.current = value.trim(); toggle(); }}
        accessibilityRole="button" accessibilityState={{ selected: on }}
        accessibilityLabel={on ? 'Stop listening' : label}
        style={({ pressed }) => ({
          alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8,
          paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill,
          borderWidth: 1.5, borderColor: on ? t.ra : t.strokeStrong,
          backgroundColor: on ? t.raWash : pressed ? t.subtle : 'transparent',
        })}>
        <View style={{ width: 9, height: 9, borderRadius: on ? 2 : 5, backgroundColor: on ? t.ra : t.nu }} />
        <Text style={{ color: t.ink, fontSize: 14, fontFamily: T.brand }}>{on ? 'Stop listening' : label}</Text>
      </Pressable>
      {!!note && <Text style={{ color: t.ink3, fontSize: 12.5, lineHeight: 17 }}>{note}</Text>}
    </View>
  );
}

/**
 * The mic beside a screen's main button: tap it and say the button's word
 * ("begin", "done"). Square, the same size as the button next to it; warm
 * while it's listening. Nothing where the phone or browser can't listen.
 */
export function VoiceCommandButton({ listening, unavailable, onPress, label }: {
  listening: boolean; unavailable?: boolean; onPress: () => void; label: string;
}) {
  const t = useTheme();
  if (unavailable) return null;
  const c = listening ? (t.key === 'ra' ? t.raDeep : t.ra) : t.ink2;
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }}
      accessibilityRole="button" accessibilityState={{ selected: listening }}
      accessibilityLabel={listening ? 'Stop listening' : label}
      style={({ pressed }) => ({
        width: BUTTON.md.height, height: BUTTON.md.height, borderRadius: BUTTON.md.radius,
        alignItems: 'center', justifyContent: 'center', borderWidth: 1.5,
        borderColor: listening ? c : t.strokeStrong,
        backgroundColor: listening ? t.raWash : pressed ? t.subtle : 'transparent',
      })}>
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round">
        <Rect x={9} y={3} width={6} height={12} rx={3} /><Path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </Svg>
    </Pressable>
  );
}

/**
 * Nu or Ra says it out loud, in your language and voice. Tap again to stop.
 * With "read aloud" on in Settings, `auto` says it once when it appears.
 */
export function HearIt({ text, label = 'Hear it', auto }: { text: string; label?: string; auto?: boolean }) {
  const t = useTheme();
  const speaking = useSpeaking();
  const [none, setNone] = useState(false);
  const said = useRef('');

  useEffect(() => {
    if (!auto || !text || said.current === text) return;
    said.current = text;
    readsAloud().then(on => on && say(text));
  }, [auto, text]);

  if (!canSpeak() || !text.trim()) return null;
  return (
    <View style={{ gap: 4 }}>
      <Pressable
        onPress={async () => {
          Haptics.selectionAsync();
          if (speaking) return hush();
          setNone(!(await say(text)));
        }}
        hitSlop={8} accessibilityRole="button"
        style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}>
        <Text style={{ color: t.key === 'ra' ? t.raDeep : t.nu, fontSize: 13.5, fontFamily: T.brand }}>
          {speaking ? '■ Stop' : `▸ ${label}`}
        </Text>
      </Pressable>
      {none && (
        <Text style={{ color: t.ink3, fontSize: 12 }}>
          This phone has no voice for that language, so it’s here to read instead.
        </Text>
      )}
    </View>
  );
}
