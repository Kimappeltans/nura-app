import type React from 'react';
import { useEffect } from 'react';
import { View, Text, Pressable, Image, Platform, useWindowDimensions } from 'react-native';
import { usePathname } from 'expo-router';
import { useStore, useTheme } from '../store';
import { type as T } from '../theme';
import { Mica } from '../ui';
import { MicaHosted, READ_MAX, SIDEBAR, ScreenWidth, useDesk } from '../screen';
import { LivePill } from './LivePill';
import { deskTokens, hasTellField } from '../desk/kit';
import { Avatar } from './Avatar';
import { TABS, goToTab } from './TabBar';

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

/** A row in the sidebar: the room's icon and name; where you are is a soft fill, under the pointer a wash. */
function NavRow({ label, on, onPress, icon }: { label: string; on: boolean; onPress: () => void; icon: React.ReactNode }) {
  const t = useTheme();
  const k = deskTokens(t);
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" aria-selected={on} accessibilityLabel={label}
      {...({ dataSet: { deskNav: '' } } as object)}
      style={(s) => {
        const { pressed, hovered } = s as { pressed: boolean; hovered?: boolean };
        return {
          minHeight: 48, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 12,
          backgroundColor: on ? t.subtle : pressed || hovered ? k.wash : 'transparent',
        };
      }}>
      {icon}
      <Text style={{ color: on ? t.ink : t.ink2, fontSize: 16.5, fontFamily: on ? T.display : T.brand, letterSpacing: -0.2 }}>{label}</Text>
    </Pressable>
  );
}

/**
 * The tab bar, on a wide window: the wordmark, the three rooms, and You at
 * the foot, with a running session's pill above it. Tell Nu is in each
 * room's header (src/desk/kit.tsx); N opens it from anywhere, and so does
 * ⌘K where there's no header to go to.
 */
export function Sidebar() {
  const t = useTheme();
  const k = deskTokens(t);
  const tab = useStore(s => s.tab);
  const path = usePathname();
  const inRoom = path === '/';
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || useStore.getState().telling) return;
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
      // ⌘K: a room's header takes it (TellNuField); elsewhere it opens Tell Nu
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (hasTellField()) return;
        e.preventDefault();
        useStore.setState({ telling: true });
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || typing) return;
      if (e.key === 'n' || e.key === 'N' || e.key === '/') {
        e.preventDefault();
        useStore.setState({ telling: true });
        return;
      }
      // 1 2 3: the rooms
      const room = ({ '1': 'home', '2': 'tasks', '3': 'day' } as const)[e.key as '1' | '2' | '3'];
      if (room && inRoom) { e.preventDefault(); goToTab(room, path); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inRoom, path]);
  return (
    <View role="navigation" style={{
      width: SIDEBAR, paddingHorizontal: 12, paddingTop: 26, paddingBottom: 18,
      borderRightWidth: 1, borderRightColor: t.stroke, backgroundColor: k.side,
    }}>
      <Image source={wordmark} resizeMode="contain" accessibilityLabel="Nura"
        style={{ height: 30, width: 30 * 799 / 222, tintColor: t.ink, marginLeft: 12, marginBottom: 34 }} />

      <View accessibilityRole="tablist" style={{ gap: 2 }}>
        {TABS.map(x => (
          <NavRow key={x.key} label={x.key === 'tasks' ? 'Tasks' : x.label} on={x.key === tab} onPress={() => goToTab(x.key, path)} icon={x.icon(x.key === tab ? t.ink : t.ink2)} />
        ))}
      </View>

      <View style={{ flex: 1 }} />
      {/* a session left running with ⌄: tap to go back to it */}
      <View style={{ marginBottom: 8 }}><LivePill /></View>
      <NavRow label="You" on={tab === 'you'} onPress={() => goToTab('you', path)} icon={<Avatar size={26} ring={tab === 'you'} />} />
    </View>
  );
}

/** A room beside the sidebar (app/index.tsx): the room gets the rest of the window, on one ground with the sidebar. */
export function DeskRoom({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: t.base }}>
      <Mica />
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
  const t = useTheme();
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: t.base }}>
      <Mica />
      <Sidebar />
      <View style={{ flex: 1, minWidth: 0 }}>
        <DeskColumn>{children}</DeskColumn>
      </View>
    </View>
  );
}

