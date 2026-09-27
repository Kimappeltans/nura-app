import { router } from 'expo-router';
import { askToReplayIntro } from '../intro';
import { ActionSheet, type SheetAction } from '../components/ActionSheet';

/** LEGACY — the menu the list-first homes used, before the three-tab app. Kept to restore.
 *
 * Every place in the app, in one list — the only menu there is. It opens
 * from Nu, which is home; everywhere else is one sheet away and closes back
 * to it.
 */
const PLACES: SheetAction[] = [
  { key: 'plan', glyph: '✦', label: 'Plan something bigger', sub: 'Nu helps find the first move', onPress: () => router.push('/project/new') },
  { key: 'say', glyph: '☀', label: 'Say it to Ra', sub: 'a sentence becomes a task, dates and all', onPress: () => router.push('/chat') },
  { key: 'day', glyph: '◐', label: 'Your day', sub: 'what you did, and the shape of today', onPress: () => router.push('/tide') },
  { key: 'cal', glyph: '▦', label: 'Calendar', onPress: () => router.push('/calendar') },
  { key: 'wins', glyph: '★', label: 'Wins', sub: 'everything you’ve finished', onPress: () => router.push('/wins') },
  { key: 'you', glyph: '☺', label: 'Profile', sub: 'your name, and Nu and Ra', onPress: () => router.push('/profile') },
  { key: 'settings', glyph: '⚙', label: 'Settings', sub: 'appearance, reminders, language and voice', onPress: () => router.push('/settings') },
  { key: 'story', glyph: '↺', label: 'Watch the opening again', sub: 'the story of Nu and Ra', onPress: () => router.push('/opening') },
  { key: 'restart', glyph: '⤺', label: 'Start from the beginning', sub: 'the story and the first questions', tone: 'quiet', onPress: askToReplayIntro },
];

export function AppMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return <ActionSheet visible={visible} title="Menu" actions={PLACES} dismissLabel="Close" onDismiss={onClose} />;
}
