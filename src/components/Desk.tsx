import type React from 'react';
import { useEffect } from 'react';
import { View, Text, Pressable, Image, Platform, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { usePathname } from 'expo-router';
import { useStore, useTheme } from '../store';
import { type as T } from '../theme';
import { Mica } from '../ui';
import { MicaHosted, READ_MAX, SIDEBAR, ScreenWidth, useDesk } from '../screen';
import { LivePill } from './LivePill';
import { Avatar } from './Avatar';
import { TABS, goToTab } from './TabBar';

const CORAL = '#FF6B35';
const wordmark = require('../../assets/brand/wordmark-tight.webp');

/**
 * THE DESKTOP LAYOUT (src/screen.ts). On a wide web window the tab bar is a
 * sidebar on the left and each room uses the width; a pushed screen reads in
 * a centred column. Phones and the iOS app never get here: every part of
 * this file is the phone's own layout below the DESK width.
 */

// The web only: a readable column's screen draws its own ground, which would
// stop at the column's edge; the page around it draws the ground and the glow
// instead, across the window. (The keyboard's focus ring is app/_layout.tsx's.)
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = [
    '[data-desk-column] > div { background-color: transparent !important; }',
  ].join('\n');
  document.head.appendChild(style);
}

/** A row in the sidebar: the room's icon and name; where you are is ink, with the tab bar's coral dot. */
function NavRow({ label, on, onPress, icon }: { label: string; on: boolean; onPress: () => void; icon: React.ReactNode }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" aria-selected={on} accessibilityLabel={label}
      {...({ dataSet: { deskNav: '' } } as object)}
      style={(s) => {
        const { pressed, hovered } = s as { pressed: boolean; hovered?: boolean };
        return {
          height: 46, borderRadius: 23, flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 18, paddingRight: 14,
          // where you are is a soft fill; under the pointer, only a hairline
          backgroundColor: on ? t.subtle : 'transparent',
          borderWidth: 1, borderColor: !on && (pressed || hovered) ? t.strokeStrong : 'transparent',
        };
      }}>
      {on && <View style={{ position: 'absolute', left: 7, width: 4, height: 4, borderRadius: 2, backgroundColor: CORAL }} />}
      {icon}
      <Text style={{ color: on ? t.ink : t.ink2, fontSize: 15, fontFamily: on ? T.display : T.brand, letterSpacing: -0.2 }}>{label}</Text>
    </Pressable>
  );
}

/**
 * The tab bar, on a wide window: the wordmark, Tell Nu, the four rooms, and
 * a running session's pill at the foot.
 */
export function Sidebar() {
  const t = useTheme();
  const tab = useStore(s => s.tab);
  const path = usePathname();
  // N opens Tell Nu, except while typing somewhere or with a modifier held
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'n' && e.key !== 'N') return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (useStore.getState().telling) return;
      e.preventDefault();
      useStore.setState({ telling: true });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <View role="navigation" style={{
      width: SIDEBAR, paddingHorizontal: 16, paddingTop: 28, paddingBottom: 12,
      borderRightWidth: 1, borderRightColor: t.stroke, backgroundColor: t.base,
    }}>
      <Image source={wordmark} resizeMode="contain" accessibilityLabel="Nura"
        style={{ height: 22, width: 22 * 799 / 222, tintColor: t.ink, marginLeft: 12 }} />

      {/* Tell Nu: the tab bar's +, kept quiet here so the room's one coral
          thing (the front card, Begin) stays the only loud one. N opens it too. */}
      <Pressable onPress={() => useStore.setState({ telling: true })}
        accessibilityRole="button" accessibilityLabel="Tell Nu anything"
        {...({ dataSet: { deskNav: '' } } as object)}
        style={(s) => {
          const { pressed, hovered } = s as { pressed: boolean; hovered?: boolean };
          return {
            height: 46, borderRadius: 23, marginTop: 30, marginBottom: 22, flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingLeft: 16, paddingRight: 14, borderWidth: 1, borderColor: t.strokeStrong,
            backgroundColor: pressed || hovered ? t.subtle : 'transparent',
          };
        }}>
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={t.ink} strokeWidth={2.2} strokeLinecap="round">
          <Path d="M12 5v14M5 12h14" />
        </Svg>
        <Text style={{ flex: 1, color: t.ink, fontSize: 15, fontFamily: T.display, letterSpacing: -0.2 }}>Tell Nu</Text>
        <Text style={{ color: t.ink3, fontSize: 12, fontFamily: T.brand }}>N</Text>
      </Pressable>

      <View accessibilityRole="tablist" style={{ gap: 4 }}>
        {TABS.map(x => (
          <NavRow key={x.key} label={x.key === 'tasks' ? 'Tasks' : x.label} on={x.key === tab} onPress={() => goToTab(x.key, path)} icon={x.icon(x.key === tab ? t.ink : t.ink3)} />
        ))}
        <NavRow label="You" on={tab === 'you'} onPress={() => goToTab('you', path)} icon={<Avatar size={22} ring={tab === 'you'} />} />
      </View>

      <View style={{ flex: 1 }} />
      {/* a session left running with ⌄: tap to go back to it */}
      <LivePill />
    </View>
  );
}

/** A room beside the sidebar (app/index.tsx): the room gets the rest of the window. */
export function DeskRoom({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: t.base }}>
      <Sidebar />
      <ScreenWidth.Provider value={width - SIDEBAR}>
        <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
      </ScreenWidth.Provider>
    </View>
  );
}

/**
 * A screen in a centred column on a wide window, the ground and its glow
 * across the whole of it. Anything else: the screen as it is.
 */
export function DeskColumn({ max = READ_MAX, children }: { max?: number; children: React.ReactNode }) {
  const t = useTheme();
  const desk = useDesk();
  if (!desk) return <>{children}</>;
  return (
    <View style={{ flex: 1, backgroundColor: t.base }}>
      <Mica />
      <MicaHosted.Provider value>
        <ScreenWidth.Provider value={max}>
          <View {...({ dataSet: { deskColumn: '' } } as object)}
            style={{ flex: 1, width: '100%', maxWidth: max, alignSelf: 'center', paddingTop: 20 }}>
            {children}
          </View>
        </ScreenWidth.Provider>
      </MicaHosted.Provider>
    </View>
  );
}

/** A route that reads in a centred column on a wide window: `export default inWorld('utility', readable(Screen))`. */
export function readable<P extends object>(Screen: React.ComponentType<P>, max = READ_MAX) {
  return function Readable(props: P) {
    return <DeskColumn max={max}><Screen {...props} /></DeskColumn>;
  };
}

/** The sidebar and a centred column, where a phone has the tab bar under a pushed screen (WithTabs). */
export function DeskTabbed({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <Sidebar />
      <View style={{ flex: 1, minWidth: 0 }}>
        <DeskColumn>{children}</DeskColumn>
      </View>
    </View>
  );
}

