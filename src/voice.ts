import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { getFlag, setFlag } from './db';
import { getLanguage, languageTag } from './planner';

/**
 * Voice — optional, on top of text, never instead of it.
 *
 * Speaking to Nu: the phone's own speech recognition (Apple's on iPhone, the
 * browser's on the web) turns what you say into text in the same field you
 * could have typed in, and nothing happens with it until you've read it and
 * pressed the button. Permission is asked the first time you tap the mic,
 * not before.
 *
 * Nu and Ra speaking: the phone's own voices, in the language you chose, the
 * voice you chose if there is one. Only when you ask ("Hear it"), unless you
 * turned on reading aloud in Settings.
 *
 * Both native modules are loaded defensively: on a build made before they
 * were added (or Expo Go), requiring them throws, and the app must carry on
 * with text only rather than fail to start.
 */

type SR = typeof import('expo-speech-recognition');
type Speech = typeof import('expo-speech');

let sr: SR | null = null;
let speech: Speech | null = null;
try { sr = require('expo-speech-recognition'); } catch { sr = null; }
try { speech = require('expo-speech'); } catch { speech = null; }

/* ------------------------------------------------------------------ *
 *  Listening
 * ------------------------------------------------------------------ */

export type ListenState = 'idle' | 'listening' | 'unavailable';

/**
 * Dictation into a text field. `onText(heard)` gets what's been heard so
 * far (it updates while you speak); the caller puts it after whatever was
 * already in the field. `note` is a line to show under the field: what's
 * happening, or what went wrong and that typing still works.
 */
export function useDictation(onText: (heard: string) => void) {
  const [state, setState] = useState<ListenState>(() => (available() ? 'idle' : 'unavailable'));
  const [note, setNote] = useState('');
  const cb = useRef(onText);
  cb.current = onText;

  useEffect(() => {
    if (!sr) return;
    const m = sr.ExpoSpeechRecognitionModule;
    const subs = [
      m.addListener('result', e => {
        const heard = e.results[0]?.transcript ?? '';
        if (heard) cb.current(heard);
        setNote(e.isFinal ? 'Heard it. Check the words, change anything, then carry on.' : 'Listening…');
      }),
      m.addListener('end', () => setState(s => (s === 'listening' ? 'idle' : s))),
      m.addListener('error', e => {
        setState('idle');
        setNote(({
          'not-allowed': 'Microphone or speech permission is off. You can type instead, or turn it on in Settings.',
          'no-speech': 'I didn’t hear anything. Try again, or type.',
          'network': 'Speech recognition couldn’t connect. You can type instead.',
          'language-not-supported': 'This phone can’t listen in that language. You can type instead.',
          'aborted': '',
        } as Record<string, string>)[e.error] ?? 'Listening stopped. You can type instead.');
      }),
    ];
    return () => { subs.forEach(s => s.remove()); m.abort(); };
  }, []);

  const start = async () => {
    if (!sr) { setNote('Voice isn’t available here. You can type.'); return; }
    const m = sr.ExpoSpeechRecognitionModule;
    try {
      const perm = await m.requestPermissionsAsync();
      if (!perm.granted) { setNote('Microphone or speech permission is off. You can type instead.'); return; }
      const lang = languageTag(await getLanguage());
      m.start({ lang, interimResults: true, continuous: false, addsPunctuation: true });
      setState('listening');
      setNote('Listening… speak naturally.');
    } catch {
      setState('idle');
      setNote('Voice input couldn’t start. You can type instead.');
    }
  };
  const stop = () => {
    if (!sr) return;
    sr.ExpoSpeechRecognitionModule.stop();
    setState('idle');
  };

  return { state, note, start, stop, toggle: () => (state === 'listening' ? stop() : start()) };
}

/**
 * Say a word to press a button — "begin" on Focus, "done" or "stop" on the
 * timer — for when your hands are on the keyboard or the phone is across the
 * desk. Listens only after the mic is tapped, keeps listening (restarting when
 * the phone's recogniser times out) until one of the words is heard, then
 * stops and runs that command once. Other words are ignored.
 */
export function useVoiceCommands(commands: { words: string[]; run: () => void }[]) {
  const [state, setState] = useState<ListenState>(() => (available() ? 'idle' : 'unavailable'));
  const [note, setNote] = useState('');
  const listening = useRef(false);
  const cmds = useRef(commands);
  cmds.current = commands;

  const begin = async () => {
    if (!sr) return;
    const m = sr.ExpoSpeechRecognitionModule;
    const lang = languageTag(await getLanguage());
    m.start({ lang, interimResults: true, continuous: true });
  };

  useEffect(() => {
    if (!sr) return;
    const m = sr.ExpoSpeechRecognitionModule;
    const subs = [
      m.addListener('result', e => {
        if (!listening.current) return;
        const heard = (e.results[0]?.transcript ?? '').toLowerCase();
        const hit = cmds.current.find(c => c.words.some(w => new RegExp(`\\b${w}\\b`).test(heard)));
        if (!hit) return;
        listening.current = false;
        m.stop();
        setState('idle'); setNote('');
        hit.run();
      }),
      // the recogniser gives up after a silence; while we're meant to be
      // listening, start it again
      m.addListener('end', () => { if (listening.current) begin().catch(() => { listening.current = false; setState('idle'); }); }),
      m.addListener('error', e => {
        if (!listening.current || e.error === 'no-speech' || e.error === 'aborted') return;
        listening.current = false;
        setState('idle');
        setNote(e.error === 'not-allowed' ? 'The microphone is off for Nura. Tap instead, or turn it on in Settings.' : 'Listening stopped. Tap instead.');
      }),
    ];
    return () => { subs.forEach(s => s.remove()); if (listening.current) { listening.current = false; m.abort(); } };
  }, []);

  const start = async () => {
    if (!sr) return;
    try {
      const perm = await sr.ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) { setNote('The microphone is off for Nura. Tap instead, or turn it on in Settings.'); return; }
      listening.current = true;
      setState('listening'); setNote('');
      await begin();
    } catch {
      listening.current = false;
      setState('idle'); setNote('Listening couldn’t start. Tap instead.');
    }
  };
  const stop = () => {
    if (!sr || !listening.current) return;
    listening.current = false;
    sr.ExpoSpeechRecognitionModule.stop();
    setState('idle');
  };

  return { state, note, start, stop, toggle: () => (listening.current ? stop() : start()) };
}

function available() {
  if (!sr) return false;
  try { return sr.ExpoSpeechRecognitionModule.isRecognitionAvailable(); } catch { return false; }
}

/* ------------------------------------------------------------------ *
 *  Speaking
 * ------------------------------------------------------------------ */

export const canSpeak = () => !!speech;

/** Read aloud when a new reply arrives, not only on "Hear it". Off unless
 *  you turn it on. */
export async function readsAloud() { return (await getFlag('voice.auto')) === '1'; }
export async function setReadsAloud(on: boolean) { await setFlag('voice.auto', on ? '1' : '0'); }

export async function chosenVoice() { return (await getFlag('voice.id')) || null; }
export async function setChosenVoice(id: string | null) { await setFlag('voice.id', id ?? ''); }

export interface VoiceOption { id: string; name: string; enhanced: boolean }

/** Apple's joke and old robot voices (Bubbles, Zarvox, Grandpa...): they
 *  come with every phone and Mac, and none of them should read your day. */
const NOVELTY = new Set([
  'albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'deranged', 'good news',
  'hysterical', 'jester', 'organ', 'pipe organ', 'superstar', 'trinoids', 'whisper', 'wobble', 'zarvox',
  'princess', 'ralph', 'fred', 'junior', 'kathy', 'agnes', 'bruce', 'vicki', 'victoria',
  'eddy', 'flo', 'grandma', 'grandpa', 'reed', 'rocko', 'sandy', 'shelley',
]);
const isNovelty = (v: { identifier: string; name: string }) =>
  /\.eloquence\./.test(v.identifier)
  || NOVELTY.has(v.name.replace(/\s*\(.*\)$/, '').trim().toLowerCase());

/** The phone's voices for the chosen language — what Settings offers. */
export async function voicesForLanguage(): Promise<VoiceOption[]> {
  if (!speech) return [];
  const tag = languageTag(await getLanguage());
  const all = await speech.getAvailableVoicesAsync().catch(() => []);
  return all
    .filter(v => v.language?.toLowerCase().startsWith(tag.slice(0, 2).toLowerCase()) && !isNovelty(v))
    .map(v => ({ id: v.identifier, name: v.name, enhanced: v.quality === 'Enhanced' }))
    .sort((a, b) => Number(b.enhanced) - Number(a.enhanced) || a.name.localeCompare(b.name));
}

const speakingListeners = new Set<(on: boolean) => void>();
const setSpeaking = (on: boolean) => speakingListeners.forEach(fn => fn(on));

/** Say it in the chosen language and voice. Returns false when the phone
 *  can't, so the screen can say why instead of doing nothing. */
export async function say(text: string): Promise<boolean> {
  if (!speech || !text.trim()) return false;
  const lang = languageTag(await getLanguage());
  const voice = await chosenVoice();
  const voices = await speech.getAvailableVoicesAsync().catch(() => []);
  const match = voices.find(v => v.identifier === voice && v.language?.slice(0, 2) === lang.slice(0, 2));
  // no voice at all for this language: the text is still on screen, and
  // reading it in the wrong accent helps no one
  if (Platform.OS !== 'web' && voices.length && !voices.some(v => v.language?.slice(0, 2) === lang.slice(0, 2))) return false;
  await speech.stop();
  setSpeaking(true);
  speech.speak(text, {
    language: lang, voice: match?.identifier, rate: 0.96,
    onDone: () => setSpeaking(false), onStopped: () => setSpeaking(false), onError: () => setSpeaking(false),
  });
  return true;
}

export async function hush() {
  if (!speech) return;
  await speech.stop();
  setSpeaking(false);
}

export function useSpeaking() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    speakingListeners.add(setOn);
    return () => { speakingListeners.delete(setOn); hush(); };
  }, []);
  return on;
}
