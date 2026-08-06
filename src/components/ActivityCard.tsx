import { useState } from 'react';
import { View, Text, Image, Pressable, ScrollView, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { activityById, SCENES, isCustom, customName, type ActivityId } from '../activities';
import { radius, elevation, type as T } from '../theme';
import { useTheme } from '../store';
import { Check, IconChevron } from '../ui';
import { formatDue } from './DatePicker';
import type { Task } from '../db';

/** Warm, specific, and never a grade. */
const PRAISE = ['Great job!', 'Nicely done.', 'That one is gone.', 'Logged.', 'Done and dusted.'];
const praiseFor = (id: string) =>
  PRAISE[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % PRAISE.length];

/**
 * A scheduled activity, as a card.
 *
 * The ACTIVITY is the headline and your own words are the subtitle — "Exercise"
 * over "morning workout" — because the activity is the thing your eye can catch
 * at a glance across a whole day, and the wording is the detail you only need
 * once you've stopped on it.
 *
 * Used only for things carrying a date. A screen of these is a mood board, not
 * a list; past four or five the picture stops being information. Undated work
 * stays as compact rows.
 */
export function ActivityCard(
  { task, onPress, onDone }:
  { task: Task; onPress: () => void; onDone: () => void },
) {
  const t = useTheme();
  const custom = isCustom(task.activity);
  const a = custom ? null : activityById(task.activity);
  const done = task.state === 'done';
  const c = a ? (t.key === 'ra' ? a.onLight : a.tint) : t.nu;

  const when = task.due_at
    ? (task.has_time
        ? new Date(task.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : formatDue(task.due_at, false))
    : null;
  const mins = task.est_minutes
    ? (task.est_minutes < 60 ? `${task.est_minutes} min` : `${Math.round(task.est_minutes / 60)} hr`)
    : null;

  // activity name leads; the typed title becomes the detail underneath
  const name = a?.name ?? (custom ? customName(task.activity!) : null);
  const headline = name ?? task.title;
  const sub = name && task.title.toLowerCase() !== name.toLowerCase() ? task.title : null;

  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => ({
        marginBottom: 11, opacity: pressed ? 0.94 : 1,
        transform: [{ scale: pressed ? 0.99 : 1 }],
      })}>
      <View style={[{
        borderRadius: radius.xl, overflow: 'hidden',
        borderWidth: 1, borderColor: `${c}38`,
      }, elevation.e8]}>
        <LinearGradient
          colors={done ? [`${c}18`, `${c}08`] : [`${c}33`, `${c}12`]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ flexDirection: 'row', alignItems: 'center', minHeight: 124 }}>

          <View style={{ flex: 1, paddingLeft: 16, paddingVertical: 15, paddingRight: 2 }}>
            {(!!when || !!mins) && (
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 3 }}>
                {!!when && (
                  <Text style={{ color: t.ink, fontSize: 15.5, fontFamily: T.brand }}>{when}</Text>
                )}
                {!!mins && <Text style={{ color: t.ink2, fontSize: 13.5 }}>{mins}</Text>}
                {!!task.repeat_rule && <Text style={{ color: t.ink2, fontSize: 13 }}>↻</Text>}
              </View>
            )}

            <Text
              numberOfLines={1}
              style={{
                color: done ? t.ink2 : t.ink, fontSize: 22, fontFamily: T.display, lineHeight: 28,
                textDecorationLine: done ? 'line-through' : 'none',
              }}>
              {headline}
            </Text>

            {done ? (
              <Text style={{ color: c, fontSize: 15, fontFamily: T.brand, marginTop: 2 }}>
                {praiseFor(task.id)}
              </Text>
            ) : !!sub && (
              <Text numberOfLines={1} style={{ color: t.ink2, fontSize: 14.5, marginTop: 2 }}>
                {sub}
              </Text>
            )}
          </View>

          {/* the scene, bled past the right edge so the card reads as a window
              onto it rather than a box with a sticker in it */}
          {!!a && (
            <Image
              source={SCENES[a.id as ActivityId]}
              style={{ width: 138, height: 118, marginRight: -10, opacity: done ? 0.5 : 1 }}
              resizeMode="contain"
            />
          )}

          <View style={{ paddingRight: 15, paddingLeft: 4 }}>
            {done ? (
              <View style={{
                width: 26, height: 26, borderRadius: 13,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1.8, borderColor: c, backgroundColor: `${c}2A`,
              }}>
                <Text style={{ color: c, fontSize: 14 }}>✓</Text>
              </View>
            ) : (
              <Check tone="ra" onPress={onDone} />
            )}
          </View>
        </LinearGradient>
      </View>
    </Pressable>
  );
}

/**
 * The hero — the one thing you'd be handed next, at full size.
 *
 * Same anatomy as the row cards (time, activity name, your own words, scene)
 * but scaled up and carrying the action, because on a phone the top of the
 * screen is the only real estate you can count on someone seeing. If the task
 * has no activity it falls back to the brand coral, so the slot never looks
 * broken for a plain task.
 */
export function HeroCard(
  { task, onStart }: { task: Task; onStart: () => void },
) {
  const t = useTheme();
  const custom = isCustom(task.activity);
  const a = custom ? null : activityById(task.activity);
  const c = a ? (t.key === 'ra' ? a.onLight : a.tint) : t.ra;

  const when = task.due_at
    ? (task.has_time
        ? new Date(task.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : formatDue(task.due_at, false))
    : null;
  const mins = task.est_minutes
    ? (task.est_minutes < 60 ? `${task.est_minutes} min` : `${Math.round(task.est_minutes / 60)} hr`)
    : null;

  const name = a?.name ?? (custom ? customName(task.activity!) : null);
  const headline = name ?? task.title;
  const sub = name && task.title.toLowerCase() !== name.toLowerCase() ? task.title : null;

  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onStart(); }}
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.99 : 1 }] })}>
      <View style={[{
        borderRadius: radius.xl, overflow: 'hidden',
        borderWidth: 1, borderColor: `${c}4D`,
      }, elevation.e16]}>
        <LinearGradient
          colors={[`${c}47`, `${c}1A`]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ paddingTop: 15, paddingBottom: 16, paddingLeft: 18 }}>

          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, paddingRight: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
                <Text style={{ color: c, fontSize: 12, letterSpacing: 1.8, fontFamily: T.brand }}>
                  UP NEXT
                </Text>
                {/* ink2, not ink3: the hero's tint can be any of 36 hues, and
                    the dimmest ink fell under 4.5:1 on the warm ones */}
                {!!when && <Text style={{ color: t.ink2, fontSize: 13 }}>{when}</Text>}
                {!!mins && <Text style={{ color: t.ink2, fontSize: 13 }}>{mins}</Text>}
              </View>

              <Text numberOfLines={2} style={{
                color: t.ink, fontSize: 28, fontFamily: T.display,
                lineHeight: 34, letterSpacing: -0.6, marginTop: 6,
              }}>
                {headline}
              </Text>

              {!!sub && (
                <Text numberOfLines={1} style={{ color: t.ink2, fontSize: 15, marginTop: 3 }}>
                  {sub}
                </Text>
              )}
            </View>

            {!!a && (
              <Image
                source={SCENES[a.id as ActivityId]}
                style={{ width: 150, height: 122, marginRight: -12, marginTop: -6 }}
                resizeMode="contain"
              />
            )}
          </View>

          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
            marginTop: 12, paddingHorizontal: 18, paddingVertical: 12,
            borderRadius: radius.pill, backgroundColor: `${c}3D`,
            borderWidth: 1, borderColor: `${c}66`,
          }}>
            <Text style={{ color: t.ink, fontSize: 15.5, fontFamily: T.brand }}>Begin</Text>
            <IconChevron size={16} color={t.ink} />
          </View>
        </LinearGradient>
      </View>
    </Pressable>
  );
}

/**
 * A DECK of hero cards you swipe through.
 *
 * Two things have to be legible without a word of instruction: that there is
 * more than one, and that you get at them by swiping. So the next card peeks
 * in from the right edge — a card that is visibly cut off is the strongest
 * "there is more this way" signal there is — and two offset edges sit behind
 * the deck, which is what the eye reads as a stack rather than a panel.
 *
 * Built on a plain horizontal ScrollView with snapping. A pan-gesture
 * implementation would need react-native-gesture-handler, which isn't a
 * dependency; snapToInterval gives the same feel with none of that, and it
 * keeps momentum and rubber-banding native.
 */
export function HeroDeck(
  { tasks, onStart }: { tasks: Task[]; onStart: (t: Task) => void },
) {
  const t = useTheme();
  const [i, setI] = useState(0);
  const W = Dimensions.get('window').width;
  const GUTTER = 16, PEEK = 26, GAP = 12;

  if (!tasks.length) return null;
  const single = tasks.length === 1;
  // PEEK is reserved so the next card shows a sliver at the edge — the "there's
  // more, swipe" affordance. With one card there's nothing to peek at, so it
  // must claim the full row width, or it reads as narrower than every other
  // card on the screen for no reason a user can see.
  const CARD = single ? W - GUTTER * 2 : W - GUTTER * 2 - PEEK;

  return (
    // 16, not an odd-one-out 14 — every other gap on Home runs on the same
    // 4pt rhythm (space(4)), and this was the one card breaking it.
    <View style={{ marginBottom: 16 }}>
      {/* the deck: two edges behind, so a stack is visible even on the last card */}
      {!single && (
        <>
          <View style={{
            position: 'absolute', left: 16, right: PEEK + 16, top: 10, bottom: -10,
            borderRadius: radius.xl, backgroundColor: t.layer,
            borderWidth: 1, borderColor: t.stroke, opacity: 0.5,
            transform: [{ scaleX: 0.94 }],
          }} />
          <View style={{
            position: 'absolute', left: 16, right: PEEK + 16, top: 5, bottom: -5,
            borderRadius: radius.xl, backgroundColor: t.layer,
            borderWidth: 1, borderColor: t.stroke, opacity: 0.75,
            transform: [{ scaleX: 0.97 }],
          }} />
        </>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD + GAP}
        decelerationRate="fast"
        disableIntervalMomentum
        contentContainerStyle={{ paddingHorizontal: GUTTER, paddingRight: GUTTER + (single ? 0 : PEEK) }}
        onMomentumScrollEnd={e =>
          setI(Math.round(e.nativeEvent.contentOffset.x / (CARD + GAP)))}
        scrollEventThrottle={16}>
        {tasks.map((task, k) => (
          <View key={task.id} style={{ width: CARD, marginRight: k === tasks.length - 1 ? 0 : GAP }}>
            <HeroCard task={task} onStart={() => onStart(task)} />
          </View>
        ))}
      </ScrollView>

      {!single && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: -2 }}>
          {tasks.map((_, k) => (
            <View key={k} style={{
              width: k === i ? 18 : 6, height: 6, borderRadius: 3,
              backgroundColor: k === i ? t.ra : t.strokeStrong,
            }} />
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * The picker: a plain pill, no artwork.
 *
 * Twenty-one illustrated tiles in a row is a shop window — you browse it
 * instead of choosing from it, and the pictures compete with each other rather
 * than telling you anything. Choosing is a text job: you already know whether
 * you mean Yoga or Coding, you just need to find the word.
 *
 * The scene is the REWARD for having scheduled the thing, and it only appears
 * on the day view where it does its real work — making a list of chores look
 * like a day worth having.
 */
export function ActivityPick(
  { id, on, onPress }: { id: ActivityId; on: boolean; onPress: () => void },
) {
  const t = useTheme();
  const a = activityById(id)!;
  const c = t.key === 'ra' ? a.onLight : a.tint;
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 13, paddingVertical: 9, borderRadius: radius.pill,
        backgroundColor: on ? `${c}26` : 'transparent',
        borderWidth: 1.5, borderColor: on ? c : t.strokeStrong,
      }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: on ? c : `${c}88` }} />
      <Text style={{ color: on ? c : t.ink, fontSize: 13.5, fontFamily: on ? T.brand : undefined }}>
        {a.name}
      </Text>
    </Pressable>
  );
}
