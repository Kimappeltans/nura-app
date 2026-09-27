import { Alert, Platform } from 'react-native';

/**
 * A message, and a yes-or-no question, that show on every platform.
 * react-native-web's Alert does nothing at all, so on the web the browser's
 * own alert and confirm stand in; on the phone it's the native alert.
 */
export function notify(title: string, message?: string, onOk?: () => void) {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    onOk?.();
    return;
  }
  Alert.alert(title, message, [{ text: 'OK', onPress: onOk }]);
}

/** Resolves true when the person chose `yes`. `destructive` colours it red on iOS. */
export function ask(title: string, message: string, yes: string, destructive = false): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise(resolve => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: yes, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}
