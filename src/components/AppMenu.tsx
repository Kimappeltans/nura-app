import { router } from 'expo-router';
import { askToReplayIntro } from '../intro';
import { ActionSheet, type SheetAction } from './ActionSheet';

/**
 * MORE — behind your avatar, everything that isn't one of the three rooms.
 * Calendar and Wins live in Your day, the backlog pass and habits in My
 * tasks, connected apps and your account in Settings; so this stays short.
 * (The earlier every-place menu is in src/legacy/AppMenu.tsx.)
 */
const MORE: SheetAction[] = [
  { key: 'you', glyph: '☺', label: 'Profile', sub: 'your name, and what gets in the way', onPress: () => router.push('/profile') },
  { key: 'companions', glyph: '◇', label: 'Companions', sub: 'Nu and Ra', onPress: () => router.push('/companions') },
  { key: 'settings', glyph: '⚙', label: 'Settings', sub: 'appearance, reminders, voice, connected apps, account', onPress: () => router.push('/settings') },
  { key: 'plan', glyph: '✦', label: 'Plan something bigger', sub: 'Nu helps find the first move', onPress: () => router.push('/project/new') },
  { key: 'story', glyph: '↺', label: 'Watch the opening again', sub: 'the story of Nu and Ra', onPress: () => router.push('/opening') },
  { key: 'restart', glyph: '⤺', label: 'Start from the beginning', sub: 'the story and the first questions', tone: 'quiet', onPress: askToReplayIntro },
];

export function AppMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <ActionSheet visible={visible} title="More" subtitle="Everything secondary lives here."
      actions={MORE} dismissLabel="Close" onDismiss={onClose} />
  );
}
