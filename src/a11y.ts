/**
 * Accessibility, in one place: Reduce Motion, spoken announcements, and the
 * props that take decorative art out of a screen reader's way.
 *
 * States (selected, checked, disabled, expanded) are passed as `aria-*`
 * props, not `accessibilityState`: react-native-web drops accessibilityState,
 * and React Native reads aria-* on iOS and Android too.
 */
import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

// ── Reduce Motion ──────────────────────────────────────────────────────────

const web = Platform.OS === 'web' && typeof window !== 'undefined' && !!window.matchMedia;
const query = web ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

// on the web the answer is known before the first frame; on a phone it
// arrives a moment after launch, long before anything has had time to move
let reduce = query ? query.matches : false;
const listeners = new Set<() => void>();
const set = (v: boolean) => { if (v !== reduce) { reduce = v; listeners.forEach(l => l()); } };

if (!query) {
  AccessibilityInfo.isReduceMotionEnabled().then(set, () => {});
  AccessibilityInfo.addEventListener('reduceMotionChanged', set);
} else {
  const on = (e: MediaQueryListEvent) => set(e.matches);
  if (query.addEventListener) query.addEventListener('change', on); else query.addListener(on);
}

/** Is Reduce Motion on right now? For code outside React. */
export const reduceMotion = () => reduce;

/** Is Reduce Motion on? Re-renders when the setting changes. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => reduce,
    () => reduce,
  );
}

// ── Announcements ──────────────────────────────────────────────────────────

let region: HTMLElement | null = null;
function webRegion(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  if (region && document.body.contains(region)) return region;
  region = document.createElement('div');
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('aria-atomic', 'true');
  region.setAttribute('role', 'status');
  Object.assign(region.style, {
    position: 'absolute', width: '1px', height: '1px', margin: '-1px', padding: '0',
    overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: '0',
  });
  document.body.appendChild(region);
  return region;
}

/**
 * Say something to a screen reader without moving focus: a toast, a timer
 * ending, a reply arriving, a form error. Silent for everyone else.
 */
export function announce(message: string | null | undefined) {
  if (!message) return;
  if (Platform.OS === 'web') {
    const el = webRegion();
    if (!el) return;
    // clear first, so the same words twice are still read twice
    el.textContent = '';
    setTimeout(() => { el.textContent = message; }, 60);
    return;
  }
  AccessibilityInfo.announceForAccessibility(message);
}

// ── Decorative art ─────────────────────────────────────────────────────────

/**
 * Spread on a View that is only picture (a glow, a character, the sun) so a
 * screen reader skips it and everything inside it. Never on anything that
 * holds a control.
 */
export const decorative = {
  accessible: false,
  importantForAccessibility: 'no-hide-descendants',
  accessibilityElementsHidden: true,
  'aria-hidden': true,
} as const;

/** "12 minutes 30 seconds", "1 hour 5 minutes": a time left, the way it's said. */
export function spokenDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const part = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
  const out: string[] = [];
  if (h) out.push(part(h, 'hour'));
  if (m) out.push(part(m, 'minute'));
  if (sec && !h) out.push(part(sec, 'second'));
  return out.length ? out.join(' ') : '0 seconds';
}
