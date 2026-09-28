import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, PanResponder, Platform, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { type as T } from '../theme';
import { useReducedMotion } from '../a11y';
import { getFlag, setFlag } from '../db';

/**
 * A ROW YOU CAN SWIPE (guidelines/components/overview.md). Swipe right for
 * what's on its left (Done), swipe left for what's on its right (where else
 * it could go, and Delete). A short swipe opens the buttons; a long one does
 * the outermost straight away. It works with a finger, a mouse drag, and on
 * the web a two-finger swipe on a trackpad. One row is open at a time, and
 * tapping an open row closes it.
 *
 * The buttons are only ever as wide as the gap the row has left, so the row
 * itself can stay clear (it sits on the water, on cream or on navy). The same
 * actions are on the row for a screen reader (the row's own
 * accessibilityActions) and under the pointer on the desktop.
 */

export interface SwipeAction {
  key: string;
  label: string;
  /** the button's fill and its ink */
  fill: string;
  ink: string;
  icon?: (ink: string) => React.ReactNode;
  run: () => void;
}

const BUTTON = 76;

/** The row that's open now: opening another closes it. */
let closeOpen: (() => void) | null = null;

export function SwipeRow({ left = [], right = [], children, style, peek, disabled }: {
  /** revealed by swiping right; the first is what a long swipe does (Done) */
  left?: SwipeAction[];
  /** revealed by swiping left; the last is what a long swipe does (Delete) */
  right?: SwipeAction[];
  children: React.ReactNode;
  style?: ViewStyle;
  /** once, on arrival: the row slides open a little and back, to show it can */
  peek?: boolean;
  disabled?: boolean;
}) {
  const x = useRef(new Animated.Value(0)).current;
  const at = useRef(0);            // where the row is now
  const from = useRef(0);          // where a drag started
  const width = useRef(360);
  const [side, setSide] = useState<'left' | 'right' | null>(null);   // which buttons are showing
  const [long, setLong] = useState(false);                          // past the point a release does the action
  const still = useReducedMotion();
  const box = useRef<View>(null);
  const lw = left.length * BUTTON, rw = right.length * BUTTON;
  const acts = useRef({ left, right });
  acts.current = { left, right };

  useEffect(() => {
    const id = x.addListener(({ value }) => { at.current = value; });
    return () => x.removeListener(id);
  }, [x]);

  // how far a long swipe goes: half a phone's row, and no more than 240 on a wide one (a mouse travels less)
  const farAt = () => Math.max(150, Math.min(width.current * 0.5, 240));
  const clamp = (v: number) => {
    if (!acts.current.left.length) v = Math.min(v, 0);
    if (!acts.current.right.length) v = Math.max(v, 0);
    return Math.max(-width.current, Math.min(width.current, v));
  };
  const track = (v: number) => {
    x.setValue(v);
    setSide(v > 0 ? 'left' : v < 0 ? 'right' : null);
    const far = Math.abs(v) > farAt();
    setLong(was => {
      if (far && !was && Platform.OS !== 'web') Haptics.selectionAsync();
      return far;
    });
  };
  const to = (v: number, done?: () => void) => {
    if (v === 0 && closeOpen === close) closeOpen = null;
    Animated.timing(x, { toValue: v, duration: still ? 0 : 180, useNativeDriver: false }).start(() => {
      if (v === 0) { setSide(null); setLong(false); }
      done?.();
    });
  };
  const close = () => to(0);
  const open = (v: number) => {
    if (closeOpen && closeOpen !== close) closeOpen();
    closeOpen = close;
    to(v);
  };
  const fire = (a: SwipeAction, dir: 1 | -1) => {
    if (closeOpen === close) closeOpen = null;
    to(dir * width.current, () => { a.run(); x.setValue(0); setSide(null); setLong(false); });
  };
  /** A drag (or a trackpad swipe) let go at v, moving at vx. `reach`: a long swipe may do the outermost action. */
  const settle = (v: number, vx: number, reach = true) => {
    const { left: l, right: r } = acts.current;
    if (reach && v > farAt() && l.length) return fire(l[0], 1);
    if (reach && -v > farAt() && r.length) return fire(r[r.length - 1], -1);
    if (v > 0 && (v > (l.length * BUTTON) / 2 || vx > 0.6)) return open(l.length * BUTTON);
    if (v < 0 && (-v > (r.length * BUTTON) / 2 || vx < -0.6)) return open(-r.length * BUTTON);
    close();
  };

  // measured from where the finger (or the pointer) went down, not from where the drag was
  // recognised, so a quick flick counts its whole length
  const startX = useRef(0);
  const sideways = (e: { nativeEvent: { pageX: number } }, g: { dx: number; dy: number }) => {
    const ok = !disabled && Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6;
    if (ok) startX.current = e.nativeEvent.pageX - g.dx;
    return ok;
  };
  const moved = (e: { nativeEvent: { pageX: number } }) => clamp(from.current + e.nativeEvent.pageX - startX.current);
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: sideways,
    onMoveShouldSetPanResponder: sideways,
    onPanResponderGrant: () => {
      if (closeOpen && closeOpen !== close) closeOpen();
      x.stopAnimation();
      from.current = at.current;
    },
    onPanResponderMove: e => track(moved(e)),
    onPanResponderRelease: (e, g) => settle(moved(e), g.vx),
    onPanResponderTerminate: () => settle(at.current, 0),
    onPanResponderTerminationRequest: () => false,
  }), [disabled]);   // eslint-disable-line react-hooks/exhaustive-deps

  // a two-finger swipe on a trackpad (the web): sideways wheel moves the row, and it settles once the wheel stops.
  // It only ever opens the buttons: the wheel keeps coming after the fingers lift (inertia), so how far it
  // travels isn't a decision, and Done or Delete is a click on the button.
  useEffect(() => {
    if (Platform.OS !== 'web' || disabled) return;
    const el = box.current as unknown as HTMLElement | null;
    if (!el?.addEventListener) return;
    let v: number | null = null;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;   // scrolling the page: leave it be
      e.preventDefault();
      if (v == null) {
        if (closeOpen && closeOpen !== close) closeOpen();
        x.stopAnimation();
        v = at.current;
      }
      const { left: l, right: r } = acts.current;
      v = Math.max(-r.length * BUTTON, Math.min(l.length * BUTTON, clamp(v - e.deltaX)));
      x.setValue(v);
      setSide(v > 0 ? 'left' : v < 0 ? 'right' : null);
      clearTimeout(idle);
      idle = setTimeout(() => { const end = v ?? 0; v = null; settle(end, 0, false); }, 140);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => { el.removeEventListener('wheel', onWheel); clearTimeout(idle); };
  }, [disabled]);   // eslint-disable-line react-hooks/exhaustive-deps

  // once, to show it can: a little way open, then back
  useEffect(() => {
    if (!peek || still || !right.length) return;
    const id = setTimeout(() => {
      Animated.sequence([
        Animated.timing(x, { toValue: -rw, duration: 420, useNativeDriver: false }),
        Animated.delay(1100),
        Animated.timing(x, { toValue: 0, duration: 300, useNativeDriver: false }),
      ]).start();
      setSide('right');
    }, 700);
    return () => clearTimeout(id);
  }, [peek]);   // eslint-disable-line react-hooks/exhaustive-deps

  // the buttons fill exactly the gap the row leaves
  const leftGap = x.interpolate({ inputRange: [0, 4000], outputRange: [0, 4000], extrapolateLeft: 'clamp' });
  const rightGap = x.interpolate({ inputRange: [-4000, 0], outputRange: [4000, 0], extrapolateRight: 'clamp' });
  const buttons = (xs: SwipeAction[], gap: Animated.AnimatedInterpolation<number>, at: 'left' | 'right') => {
    // past the point of no return, only the one a release will do
    const shown = long ? [at === 'left' ? xs[0] : xs[xs.length - 1]] : xs;
    return (
      <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, [at]: 0, width: gap, flexDirection: 'row', overflow: 'hidden' }}>
        {shown.map(a => (
          <Pressable key={a.key} onPress={() => fire(a, at === 'left' ? 1 : -1)} accessible={false}
            style={{ flex: 1, minWidth: 0, backgroundColor: a.fill, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 4 }}>
            {a.icon?.(a.ink)}
            <Text numberOfLines={1} style={{ color: a.ink, fontSize: 12.5, fontFamily: T.display }}>{a.label}</Text>
          </Pressable>
        ))}
      </Animated.View>
    );
  };

  return (
    <View ref={box} onLayout={e => { width.current = e.nativeEvent.layout.width; }}
      // the web: a finger scrolls the page up and down but swipes the row sideways, and a
      // drag that starts on the title moves the row instead of selecting its words
      style={[{ overflow: 'hidden' }, Platform.OS === 'web' ? ({ touchAction: 'pan-y', userSelect: 'none' } as object) : null, style]}>
      {side === 'left' && left.length > 0 && buttons(left, leftGap, 'left')}
      {side === 'right' && right.length > 0 && buttons(right, rightGap, 'right')}
      <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: x }] }}>
        {children}
        {/* open: a tap on the row closes it rather than opening the task */}
        {!!side && (
          <Pressable onPress={close} accessible={false}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        )}
      </Animated.View>
    </View>
  );
}

/* The actions tasks swipe to, in our palette: Done in the sun's coral, a
   place to go in a quiet fill, Delete in the deep coral. */

const CHECK = (ink: string) => (
  <Text style={{ color: ink, fontSize: 17, lineHeight: 18, fontFamily: T.display }}>✓</Text>
);

export function doneAction(run: () => void): SwipeAction {
  return { key: 'done', label: 'Done', fill: '#FF6B35', ink: '#3B1204', icon: CHECK, run };
}

export function deleteAction(run: () => void): SwipeAction {
  return { key: 'delete', label: 'Delete', fill: '#C2410C', ink: '#FFFFFF', run };
}

export function moveAction(key: string, label: string, run: () => void, dark: boolean, first: boolean): SwipeAction {
  return first
    ? { key, label, fill: dark ? '#F2F4FB' : '#1B1830', ink: dark ? '#1B1830' : '#FAF7F0', run }
    : { key, label, fill: dark ? '#2B3566' : '#E9E3D5', ink: dark ? '#F2F4FB' : '#171313', run };
}

/** True once ever: the first list with tasks shows that a row can be swiped (its first row peeks open). */
export function useSwipeHint(has: boolean) {
  const [peek, setPeek] = useState(false);
  useEffect(() => {
    if (!has) return;
    let dead = false;
    getFlag('hint.swipe').then(v => {
      if (dead || v === '1') return;
      setPeek(true);
      setFlag('hint.swipe', '1').catch(() => {});
    }).catch(() => {});
    return () => { dead = true; };
  }, [has]);
  return peek;
}
