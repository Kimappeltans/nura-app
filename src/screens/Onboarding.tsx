import { useState } from 'react';
import { useStore } from '../store';
import Welcome from './Welcome';
import Connect from './Connect';
import Auth from './Auth';

/**
 * Three steps, in the order they earn:
 *
 *   1. WELCOME  — what this is.
 *   2. CONNECT  — what it plugs into.
 *   3. SIGN IN  — who you are, LAST.
 *
 * Sign-in used to be a side road hanging off a link on the welcome screen,
 * which meant almost nobody would ever reach it — you'd tap the big button and
 * be past it. It's a real step now.
 *
 * It is still not a gate. Every screen here can be skipped, and the app is
 * fully usable with no account at all: everything lives on the device already,
 * and an account only buys sync and the server-side integrations. Demanding
 * registration before first use is the single biggest drop-off point in any
 * onboarding, and requiring it for features that work offline runs into App
 * Store guideline 5.1.1(v).
 */
export default function Onboarding() {
  const finishOnboarding = useStore(s => s.finishOnboarding);
  const [step, setStep] = useState<'welcome' | 'connect' | 'auth'>('welcome');

  if (step === 'connect') {
    return (
      <Connect
        onDone={() => setStep('auth')}
        onBack={() => setStep('welcome')}
      />
    );
  }

  if (step === 'auth') {
    return (
      <Auth
        onClose={finishOnboarding}
        onBack={() => setStep('connect')}
      />
    );
  }

  return (
    <Welcome
      onNext={() => setStep('connect')}
      onSignIn={() => setStep('auth')}
    />
  );
}
