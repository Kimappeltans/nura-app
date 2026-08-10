import { useState } from 'react';
import { useStore } from '../store';
import Welcome from './Welcome';
import Auth from './Auth';

/**
 * Two steps, in the order they earn:
 *
 *   1. WELCOME  — what this is.
 *   2. SIGN IN  — who you are, LAST.
 *
 * Sign-in used to be a side road hanging off a link on the welcome screen,
 * which meant almost nobody would ever reach it — you'd tap the big button and
 * be past it. It's a real step now.
 *
 * CONNECT used to sit between these two — but it mostly advertised the work-app
 * integrations that aren't built yet ("soon" everywhere), and asked for
 * calendar/notification permissions before you'd written down a single task,
 * i.e. before granting them changed anything you could see. Both permissions
 * are still asked for, just in context: Nu asks for notifications after the
 * first capture, and Ra asks for the calendar the first time knowing what's
 * next would actually change the screen. Connect itself didn't disappear —
 * it's reachable any time from Settings → Connected apps, as `/integrations`.
 *
 * This is still not a gate. Every screen here can be skipped, and the app is
 * fully usable with no account at all: everything lives on the device already,
 * and an account only buys sync and the server-side integrations. Demanding
 * registration before first use is the single biggest drop-off point in any
 * onboarding, and requiring it for features that work offline runs into App
 * Store guideline 5.1.1(v).
 */
export default function Onboarding() {
  const finishOnboarding = useStore(s => s.finishOnboarding);
  const [step, setStep] = useState<'welcome' | 'auth'>('welcome');

  if (step === 'auth') {
    return (
      <Auth
        onClose={finishOnboarding}
        onBack={() => setStep('welcome')}
      />
    );
  }

  return (
    <Welcome
      onNext={() => setStep('auth')}
      onSignIn={() => setStep('auth')}
    />
  );
}
