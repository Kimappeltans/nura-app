import * as Haptics from 'expo-haptics';
import { useStore } from './store';
import { complete, pickForToday, notNow, dropTask, updateTask, type Task } from './db';
import { animateNext } from './ui';

/**
 * What you can do to a task from a list — tick it off, put it on Today or
 * take it off, set its priority, move it out of the way, let it go. One
 * place, so every list that shows tasks behaves the same, and each action
 * refreshes the store and gives the same feedback wherever it's pressed.
 */
export function useTaskActions() {
  const refresh = useStore(s => s.refresh);

  return {
    /** Done: the reward shows, and the row leaves the list. */
    tick: async (id: string) => {
      const award = await complete(id);
      useStore.getState().celebrate(award);
      animateNext('remove');
      await refresh();
    },
    addToToday: async (task: Task) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      animateNext('move');
      await pickForToday(task.id, true);
      await refresh();
    },
    takeOffToday: async (task: Task) => {
      await pickForToday(task.id, false);
      await refresh();
    },
    setPriority: async (task: Task, n: number) => {
      Haptics.selectionAsync();
      await updateTask(task.id, { priority: n });
      await refresh();
    },
    /** Out of the way for `minutes` (three hours unless said otherwise). */
    later: async (task: Task, minutes?: number) => {
      await notNow(task.id, minutes);
      await refresh();
    },
    letGo: async (task: Task) => {
      await dropTask(task.id);
      await refresh();
    },
  };
}
