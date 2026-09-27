import { useTheme, useStore } from '../src/store';
import { inWorld } from '../src/world';
import { goBack } from '../src/nav';
import { withTabs } from '../src/components/WithTabs';
import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { createHabit, getHabit, updateHabit } from '../src/db';
import { radius, type as T } from '../src/theme';
import { StatusBar } from 'expo-status-bar';
import { Mica, Primary } from '../src/ui';
import { Moving } from '../src/components/Moving';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';

/**
 * A new habit, or one you're changing (?id=): cue, tiny action, and an
 * honest fallback for a bad day.
 *
 * Deliberately not "set a time and a repeat rule": that's what a
 * recurring task is for, and it's already a tap away on Compose. This
 * form only accepts the shape that actually builds automaticity — an
 * existing moment in your day, and something small enough to survive it.
 */
function HabitForm() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const refreshHabits = useStore(s => s.refreshHabits);
  const [cue, setCue] = useState('');
  const [action, setAction] = useState('');
  const [minimum, setMinimum] = useState('');
  const [busy, setBusy] = useState(false);

  // editing: the habit's own words in the fields
  useEffect(() => {
    if (!id) return;
    let dead = false;
    getHabit(id).then(h => {
      if (dead || !h) return;
      setCue(h.cue); setAction(h.action); setMinimum(h.minimum ?? '');
    });
    return () => { dead = true; };
  }, [id]);

  const canSave = cue.trim().length > 0 && action.trim().length > 0;

  const save = async () => {
    if (!canSave || busy) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (id) await updateHabit(id, cue, action, minimum);
    else await createHabit(cue, action, minimum);
    await refreshHabits();
    goBack();
  };

  // 300: what the account keeps of each (supabase/schema.sql)
  const field = (label: string, value: string, onChange: (v: string) => void, placeholder: string) => (
    <View style={{ gap: 8 }}>
      <Text style={{ color: t.ink3, fontSize: 12, letterSpacing: 1.6, fontFamily: T.brand, marginLeft: 4 }}>{label.toUpperCase()}</Text>
      <TextInput
        value={value} onChangeText={onChange}
        placeholder={placeholder} placeholderTextColor={t.ink3}
        multiline maxLength={300}
        style={{
          color: t.ink, fontSize: 16.5, lineHeight: 22, padding: 14,
          backgroundColor: t.card, borderRadius: radius.lg,
          borderWidth: 1, borderColor: t.stroke, minHeight: 54,
        }}
      />
    </View>
  );

  return (
    <>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1, backgroundColor: t.base }} edges={['top']}>
        <Mica />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          {/* the header every inner screen has: back, then the title */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 2, zIndex: 1 }}>
            <Pressable onPress={() => goBack()} hitSlop={12} accessibilityRole="button" style={{ paddingVertical: 10 }}>
              <Text style={{ color: t.ink3, fontSize: 16, fontFamily: T.brand }}>← Back</Text>
            </Pressable>
          </View>

          <ScrollView style={{ marginTop: -38 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30, gap: 22 }} keyboardShouldPersistTaps="handled">
            {/* Ra in the opening's glow, his rays pulsing: a habit comes round every day, like the sun */}
            {/* room above for the glow: the scroll view would cut it off square */}
            <View style={{ alignItems: 'center', marginTop: 38 }}>
              <View style={{ width: 128, height: 128, alignItems: 'center', justifyContent: 'center' }}>
                <Svg width={200} height={200} style={{ position: 'absolute', left: -36, top: -36 }}>
                  <Defs>
                    <RadialGradient id="habitglow" cx="50%" cy="50%" r="50%">
                      <Stop offset="0" stopColor="#FFE2B8" stopOpacity={0.6} />
                      <Stop offset="0.35" stopColor="#FFB067" stopOpacity={0.3} />
                      <Stop offset="0.7" stopColor="#FF8A5C" stopOpacity={0.1} />
                      <Stop offset="1" stopColor="#FF6B35" stopOpacity={0} />
                    </RadialGradient>
                  </Defs>
                  <Circle cx={100} cy={100} r={100} fill="url(#habitglow)" />
                </Svg>
                <Moving name="ra-rays" style={{ width: 124, height: 132 }} />
              </View>
              <Text style={{ color: t.ink, fontSize: 34, lineHeight: 36, fontFamily: T.display, letterSpacing: -1.5, marginTop: 10, textAlign: 'center' }}>
                {id ? 'Edit habit' : 'New habit'}
              </Text>
            </View>

            {field('After', cue, setCue, 'I make coffee')}
            {field('I will', action, setAction, 'revise one paragraph')}
            {field('On a bad day (optional)', minimum, setMinimum, 'read one sentence')}

            <Primary label={busy ? 'Saving…' : id ? 'Save' : 'Add habit'} tone="ra" onPress={save} disabled={!canSave} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

export default inWorld('nu', withTabs(HabitForm));
