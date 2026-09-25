import { Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import { resetOnboarding } from './db';
import { useStore } from './store';

/**
 * Back to the very beginning: the story, then the onboarding questions.
 * Nothing you've written down is touched. Asked first, because it takes you
 * out of wherever you are. Used by the menu on Nu and by Settings.
 */
export function askToReplayIntro() {
  const go = async () => {
    await resetOnboarding();
    await useStore.getState().refresh();
    // Settings is a sheet, often over Profile, also a sheet. replace('/')
    // only swapped the top sheet for a second home screen, so on the phone
    // the intro could land under the Profile sheet. Closing every sheet
    // shows the home screen underneath, which now renders the intro.
    if (router.canDismiss()) router.dismissAll();
    else router.replace('/');
  };
  const title = 'Start from the beginning?';
  const body = 'You’ll see the story and the first questions again. Nothing you’ve written down is touched.';
  // react-native-web's Alert.alert does nothing, so the browser's own
  // confirm stands in for it there.
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${body}`)) go();
    return;
  }
  Alert.alert(title, body, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Start again', onPress: go },
  ]);
}
