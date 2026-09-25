import { Benben } from '../components/Benben';

/**
 * The opening, as one Welcome: the story of Nu, the Benben and Ra, ending
 * with Nu and Ra saying who they are, Get started and Sign in (see
 * components/Benben.tsx). It does the Welcome's job, so it replaces it.
 *
 * Welcome.tsx itself is untouched: to go back to it, Onboarding imports
 * './Welcome' instead of this. The props are the same.
 */
export default function WelcomeBenben({ onNext, onSignIn }: { onNext: () => void; onSignIn: () => void }) {
  return <Benben onDone={onNext} onSignIn={onSignIn} />;
}
