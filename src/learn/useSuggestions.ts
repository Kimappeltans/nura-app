import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { profileInUse } from '../patterns';
import { rank } from './suggest';
import { interventionsFrom } from '../interventions';
import { dayProposal, plannerState } from '../nextActions';
import { recordDecision, respondToDecision } from '../db';
import { hiddenKeys, keyOf, kindWeights, markShown, recordOutcome } from './feedback';
import type { Suggestion, SuggestionKind } from './types';

/**
 * The loop, for a screen: what to suggest now, and what you did about it.
 *
 * Reads the store (never writes it), builds the profile (cached for hours),
 * runs the local rules plus whatever `extra` brings (the model's suggestions,
 * once src/coach.ts is wired in), ranks them by what has helped before, and
 * logs each one as shown once a day. accept/dismiss log the answer and take
 * the suggestion away — they don't DO anything: the screen carries out the
 * action (focus, shrink, plan…), since that's where the navigation lives.
 */
export function useSuggestions(limit = 2, extra?: () => Promise<Suggestion[]>) {
  const inbox = useStore(s => s.inbox);
  const todayPicked = useStore(s => s.todayPicked);
  const now = useStore(s => s.now);
  const dayEndMin = useStore(s => s.dayEndMin);
  const wins = useStore(s => s.wins);
  const moveIds = useStore(s => s.moveIds);
  const decisions = useStore(s => s.decisions);
  const projects = useStore(s => s.projects);

  // held in a ref: an inline `extra` is a new function every render, and it
  // mustn't restart the whole computation each time
  const extraRef = useRef(extra);
  extraRef.current = extra;

  const [pool, setPool] = useState<Suggestion[]>([]);
  const [weights, setWeights] = useState<Partial<Record<SuggestionKind, number>>>({});
  // answered this session — gone at once, before the log write lands
  const [gone, setGone] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let alive = true;
    (async () => {
      const nowMs = Date.now();
      const [profile, w, hidden, day] = await Promise.all([
        // less what you said isn't you (app/learned.tsx)
        profileInUse().catch(() => null), kindWeights(nowMs), hiddenKeys(nowMs),
        plannerState({ projects }).then(dayProposal).catch(() => null),
      ]);
      const seen = new Set<string>();
      const tasks = [...todayPicked, ...inbox].filter(t => !seen.has(t.id) && (seen.add(t.id), true));
      const dayStart = new Date(nowMs); dayStart.setHours(0, 0, 0, 0);
      const doneToday = wins.filter(t => (t.completed_at ?? 0) >= dayStart.getTime()).length;

      // the planner's interventions: the same evidence and order as the next action
      let all = interventionsFrom({ profile, tasks, now, dayEndMin, doneToday, nowMs, moveIds, decisions, day });
      if (extraRef.current) {
        // the model is a bonus: slow or failing, the local ones still show
        try { all = all.concat(await extraRef.current()); } catch { /* keep the local ones */ }
      }
      if (!alive) return;
      setWeights(w);
      setPool(all.filter(s => !hidden.has(keyOf(s.id))));
    })().catch(() => { /* suggestions are optional — a failure shows none */ });
    return () => { alive = false; };
  }, [inbox, todayPicked, now?.id, dayEndMin, wins, moveIds, decisions]);

  const suggestions = useMemo(
    () => rank(pool.filter(s => !gone.has(keyOf(s.id))), weights, limit),
    [pool, gone, weights, limit]);

  const shownKey = suggestions.map(s => s.id).join('|');
  useEffect(() => {
    if (suggestions.length) markShown(suggestions).catch(() => {});
    // each one is a decision the planner put in front of you, like the next action
    for (const s of suggestions) {
      if (s.taskId) recordDecision({ taskId: s.taskId, type: 'intervention', reason: s.why ?? null, score: s.confidence }).catch(() => {});
    }
  }, [shownKey]);

  const answer = useCallback((s: Suggestion, outcome: 'accepted' | 'dismissed') => {
    setGone(g => new Set(g).add(keyOf(s.id)));
    recordOutcome(s, outcome).catch(() => {});
    if (s.taskId) respondToDecision(s.taskId, outcome === 'accepted' ? 'accepted' : 'not_now', Date.now(), 'intervention').catch(() => {});
    return s;
  }, []);

  /** logs a yes and returns the suggestion — carry out `s.action` yourself */
  const accept = useCallback((s: Suggestion) => answer(s, 'accepted'), [answer]);
  const dismiss = useCallback((s: Suggestion) => answer(s, 'dismissed'), [answer]);

  return { suggestions, accept, dismiss };
}
