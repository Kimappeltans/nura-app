import type React from 'react';
import { View } from 'react-native';
import { TabBar } from './TabBar';
import { DeskTabbed } from './Desk';
import { useDesk } from '../screen';

/**
 * A screen you move through from the rooms, with the tab bar under it — so
 * profile, settings, wins and the rest are never a dead end. The screen's own
 * SafeAreaView leaves the bottom edge to the tab bar (edges={['top']}).
 * On a wide web window: the sidebar, and the screen in a centred column.
 */
export function withTabs<P extends object>(Screen: React.ComponentType<P>) {
  return function Tabbed(props: P) {
    const desk = useDesk();
    if (desk) return <DeskTabbed><Screen {...props} /></DeskTabbed>;
    return (
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}><Screen {...props} /></View>
        <TabBar />
      </View>
    );
  };
}
