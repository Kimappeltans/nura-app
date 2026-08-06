import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useStore } from '../src/store';
import { capture, type RepeatRule } from '../src/db';
import { LABELS, guessLabel, labelById, type LabelId } from '../src/labels';
import {
  ACTIVITIES, guessActivity, activityById, searchActivities,
  isCustom, customName, makeCustomId, type ActivityId,
} from '../src/activities';
import { ActivityPick } from '../src/components/ActivityCard';
import { PRIORITIES, priorityOf } from '../src/priority';
import { radius, raTheme, type as T } from '../src/theme';
import { Mica, Surface, Primary, IconChevron, IconSearch } from '../src/ui';
import { LabelGlyph } from '../src/components/LabelIcon';
import { DatePicker, WeekdayPicker, formatDue } from '../src/components/DatePicker';

const MINUTES = [2, 5, 10, 15, 30, 60, 120];
const REPEATS: { label: string; rule: RepeatRule | null }[] = [
  { label: 'Never', rule: null },
  { label: 'Daily', rule: 'daily' },
  { label: 'Weekdays', rule: 'weekdays' },
  { label: 'Weekly', rule: 'weekly' },
  { label: 'Monthly', rule: 'monthly' },
];
const QUICK = [
  { label: 'Today',    add: 0, h: 18 },
  { label: 'Tomorrow', add: 1, h: 9 },
  { label: 'Next week',add: 7, h: 9 },
];
function quickDate(add: number, h: number) {
  const d = new Date(); d.setDate(d.getDate() + add); d.setHours(h, 0, 0, 0);
  return d.getTime();
}

/**
 * The composer.
 *
 * Capture used to be a bare field: type, return, done — and everything the NOW
 * engine actually reads stayed empty forever, because nobody makes a second
 * trip into a detail sheet to fill in an estimate. The engine then quietly
 * degraded into "oldest thing first".
 *
 * The fix is not to force the fields. It's to put them where you already are,
 * at the one moment you have the context: you know what "book the dentist"
 * involves while you're typing it, and you never will again.
 *
 * So the floor is unchanged — title, return key, done, and the label is
 * already guessed from your words. Everything else is one visible tap, and
 * skipping all of it costs nothing.
 */
export default function Compose() {
  // Fixed to the bright theme, not useTheme(). Compose is a form, not the Nu
  // or Ra experience itself — it was inheriting whichever mode you captured
  // from (Nu, dark, by default) and had no reason to. Auth.tsx already made
  // this call for the same reason; Connect.tsx should probably follow too.
  const t = raTheme;
  const refresh = useStore(s => s.refresh);
  const showToast = useStore(s => s.showToast);

  const [title, setTitle] = useState('');
  const [label, setLabel] = useState<LabelId | null>(null);
  const [touchedLabel, setTouchedLabel] = useState(false);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [due, setDue] = useState<number | null>(null);
  const [hasTime, setHasTime] = useState(false);
  const [repeat, setRepeat] = useState<RepeatRule | null>(null);
  const [priority, setPriority] = useState(0);
  const [showCal, setShowCal] = useState(false);
  const [activity, setActivity] = useState<ActivityId | null>(null);
  const [touchedAct, setTouchedAct] = useState(false);
  const [actQuery, setActQuery] = useState('');
  const [days, setDays] = useState<string>('');

  // the guess follows what you type, until you overrule it — after which it
  // stops second-guessing you
  const guessedAct0 = useMemo(() => guessActivity(title), [title]);
  // An activity's own label beats the keyword guess. "yoga before the meeting"
  // matched Yoga as the activity and Work as the label, because "meeting" is a
  // work word — but the thing you are doing is the yoga.
  const guessed = useMemo(
    () => activityById(guessedAct0)?.label ?? guessLabel(title),
    [title, guessedAct0],
  );
  useEffect(() => { if (!touchedLabel) setLabel(guessed); }, [guessed, touchedLabel]);

  // the activity guess runs on the same contract, and picking one fills in the
  // duration and the label for free — the two fields nobody ever types
  const guessedAct = guessedAct0;
  useEffect(() => { if (!touchedAct) setActivity(guessedAct); }, [guessedAct, touchedAct]);

  const matches = useMemo(() => searchActivities(actQuery), [actQuery]);

  const chooseActivity = (id: ActivityId | null) => {
    setTouchedAct(true);
    setActivity(id);
    const a = activityById(id);
    // the label IS a property of the activity; the duration is a property of
    // YOU, so it stays blank until you say otherwise
    if (a && !touchedLabel) setLabel(a.label);
  };

  const save = async () => {
    if (!title.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await capture(title, {
      label, est_minutes: minutes, due_at: due, has_time: hasTime,
      repeat_rule: repeat, priority, activity,
      repeat_days: repeat === 'weekly' ? (days || null) : null,
    });
    showToast('+1 ✦');
    await refresh();
    router.back();
  };

  const Section = ({ label: l, children }: { label: string; children: React.ReactNode }) => (
    <View style={{ marginTop: 20 }}>
      <Text style={{ color: t.ink2, fontSize: 12, letterSpacing: 1.6, fontFamily: T.brand, marginBottom: 9, marginLeft: 3 }}>
        {l.toUpperCase()}
      </Text>
      {children}
    </View>
  );

  const Chip = ({ on, children, onPress, tint }: {
    on: boolean; children: React.ReactNode; onPress: () => void; tint?: string;
  }) => {
    const c = tint ?? t.nu;
    return (
      <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 7,
          paddingHorizontal: 13, paddingVertical: 9, borderRadius: radius.pill,
          backgroundColor: on ? `${c}26` : 'transparent',
          borderWidth: 1.5, borderColor: on ? c : t.strokeStrong,
        }}>
        {children}
      </Pressable>
    );
  };

  const selectedLabel = labelById(label);
  const p = priorityOf(priority);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.base }}>
      <Mica force="ra" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>

        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 4 }}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={{ flex: 1, paddingVertical: 10 }}>
            <Text style={{ color: t.ink3, fontSize: 15 }}>Cancel</Text>
          </Pressable>
          <Text style={{ color: t.ink3, fontSize: 12.5 }}>Everything below is optional</Text>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 20 }}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* the only required field, and it still takes one return key */}
          <Surface accent="nu" style={{ marginTop: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 }}>
              {selectedLabel && (
                <View style={{ marginRight: 11 }}>
                  <LabelGlyph id={selectedLabel.id} size={20}
                    color={t.key === 'ra' ? selectedLabel.onLight : selectedLabel.color} />
                </View>
              )}
              <TextInput
                autoFocus value={title} onChangeText={setTitle}
                onSubmitEditing={save} returnKeyType="done" blurOnSubmit={false}
                placeholder="What needs doing?" placeholderTextColor={t.ink3}
                multiline
                style={{ flex: 1, paddingVertical: 17, color: t.ink, fontSize: 17, lineHeight: 23 }}
              />
            </View>
          </Surface>

          {/* Not all 36 at once.
              A wall of every option is a menu you have to READ before you can
              choose, and it buries the eight most people actually want. So:
              the common ones by default, a search box for the rest, and a way
              to add your own — because nobody's life fits a fixed list, and
              being told "your thing isn't a thing" is a bad first impression. */}
          <Section label="Activity">
            <Surface style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13 }}>
                <IconSearch size={16} color={t.ink3} />
                <TextInput
                  value={actQuery} onChangeText={setActQuery}
                  placeholder="Search activities, or type your own"
                  placeholderTextColor={t.ink3}
                  style={{ flex: 1, paddingVertical: 11, paddingLeft: 9, color: t.ink, fontSize: 14.5 }}
                />
                {!!actQuery && (
                  <Pressable onPress={() => setActQuery('')} hitSlop={10}>
                    <Text style={{ color: t.ink3, fontSize: 17 }}>×</Text>
                  </Pressable>
                )}
              </View>
            </Surface>

            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Chip on={!activity} onPress={() => chooseActivity(null)}>
                <Text style={{ color: !activity ? t.nu : t.ink, fontSize: 13.5, fontFamily: !activity ? T.brand : undefined }}>
                  None
                </Text>
              </Chip>

              {/* whatever you picked stays visible even when the search hides it */}
              {!!activity && isCustom(activity) && (
                <Chip on tint={t.ra} onPress={() => chooseActivity(null)}>
                  <Text style={{ color: t.ra, fontSize: 13.5, fontFamily: T.brand }}>
                    {customName(activity)}
                  </Text>
                </Chip>
              )}

              {matches.map(a => (
                <ActivityPick key={a.id} id={a.id} on={activity === a.id}
                  onPress={() => chooseActivity(activity === a.id ? null : a.id)} />
              ))}

              {/* the escape hatch, offered the moment nothing matches */}
              {!!actQuery.trim() && !matches.some(a => a.name.toLowerCase() === actQuery.trim().toLowerCase()) && (
                <Chip on={false} tint={t.ra}
                  onPress={() => { chooseActivity(makeCustomId(actQuery) as ActivityId); setActQuery(''); }}>
                  <Text style={{ color: t.ra, fontSize: 13.5, fontFamily: T.brand }}>
                    + Use “{actQuery.trim()}”
                  </Text>
                </Chip>
              )}
            </View>

            {!actQuery && (
              <Text style={{ color: t.ink3, fontSize: 12.5, marginTop: 8, marginLeft: 3 }}>
                {ACTIVITIES.length} in total — search to find the rest.
              </Text>
            )}
          </Section>

          <Section label="Type">
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {LABELS.map(l => {
                const on = label === l.id;
                const c = t.key === 'ra' ? l.onLight : l.color;
                return (
                  <Chip key={l.id} on={on} tint={c}
                    onPress={() => { setTouchedLabel(true); setLabel(on ? null : l.id); }}>
                    <LabelGlyph id={l.id} size={15} color={on ? c : t.ink} />
                    <Text style={{ color: on ? c : t.ink, fontSize: 13.5, fontFamily: on ? T.brand : undefined }}>
                      {l.name}
                    </Text>
                  </Chip>
                );
              })}
            </View>
            {!!guessed && !touchedLabel && (
              <Text style={{ color: t.ink3, fontSize: 13, marginTop: 8, marginLeft: 3 }}>
                Guessed from what you typed — tap to change.
              </Text>
            )}
          </Section>

          <Section label="How long">
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {MINUTES.map(m => (
                <Chip key={m} on={minutes === m} onPress={() => setMinutes(minutes === m ? null : m)}>
                  <Text style={{ color: minutes === m ? t.nu : t.ink, fontSize: 13.5, fontFamily: minutes === m ? T.brand : undefined }}>
                    {m < 60 ? `${m}m` : `${m / 60}h`}
                  </Text>
                </Chip>
              ))}
            </View>
          </Section>

          <Section label="When">
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Chip on={!due} onPress={() => { setDue(null); setHasTime(false); setShowCal(false); }}>
                <Text style={{ color: !due ? t.nu : t.ink, fontSize: 13.5, fontFamily: !due ? T.brand : undefined }}>Someday</Text>
              </Chip>
              {QUICK.map(q => {
                const target = quickDate(q.add, q.h);
                const on = !!due && Math.abs(due - target) < 3600_000 * 6;
                return (
                  <Chip key={q.label} on={on} tint={t.ra}
                    onPress={() => { setDue(target); setHasTime(true); }}>
                    <Text style={{ color: on ? t.ra : t.ink, fontSize: 13.5, fontFamily: on ? T.brand : undefined }}>{q.label}</Text>
                  </Chip>
                );
              })}
              <Chip on={showCal} tint={t.ra} onPress={() => setShowCal(v => !v)}>
                <Text style={{ color: showCal ? t.ra : t.ink, fontSize: 13.5, fontFamily: showCal ? T.brand : undefined }}>
                  Pick a date…
                </Text>
                <IconChevron size={14} color={showCal ? t.ra : t.ink3} />
              </Chip>
            </View>

            {!!due && (
              <Text style={{ color: t.ra, fontSize: 14, marginTop: 10, marginLeft: 3, fontFamily: T.brand }}>
                {formatDue(due, hasTime)}
              </Text>
            )}

            {showCal && (
              <View style={{ marginTop: 12 }}>
                <DatePicker value={due} hasTime={hasTime}
                  onChange={(ms, ht) => { setDue(ms); setHasTime(ht); }} />
              </View>
            )}
          </Section>

          <Section label="Repeats">
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {REPEATS.map(r => {
                const on = repeat === r.rule;
                return (
                  <Chip key={r.label} on={on} onPress={() => setRepeat(r.rule)}>
                    <Text style={{ color: on ? t.nu : t.ink, fontSize: 13.5, fontFamily: on ? T.brand : undefined }}>
                      {r.label}
                    </Text>
                  </Chip>
                );
              })}
            </View>
          </Section>

          {repeat === 'weekly' && (
            <View style={{ marginTop: 12 }}>
              <Text style={{ color: t.ink2, fontSize: 13, marginBottom: 9, marginLeft: 3 }}>
                On which days?
              </Text>
              <WeekdayPicker value={days} onChange={setDays} />
            </View>
          )}

          <Section label="Priority">
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {PRIORITIES.map(x => {
                const on = priority === x.n;
                const c = t.key === 'ra' ? x.onLight : x.color;
                return (
                  <Chip key={x.n} on={on} tint={c} onPress={() => setPriority(x.n)}>
                    {x.n > 0 && (
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: on ? c : t.ink3 }} />
                    )}
                    <Text style={{ color: on ? c : t.ink, fontSize: 13.5, fontFamily: on ? T.brand : undefined }}>
                      {x.name}
                    </Text>
                  </Chip>
                );
              })}
            </View>
            <Text style={{ color: t.ink3, fontSize: 13, marginTop: 8, marginLeft: 3, lineHeight: 17 }}>
              A tiebreak, not a tier — deadlines and your energy still come first.
            </Text>
          </Section>

          <View style={{ height: 22 }} />
          <Primary label="Add it" tone="ra" onPress={save}
            sub={p.n > 0 || minutes || due || repeat ? undefined : 'you can fill the rest in later, or never'} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
