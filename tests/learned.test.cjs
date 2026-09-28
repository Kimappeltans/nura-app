/**
 * What Nura has learned (src/learned.ts, src/patterns.ts): how far along a
 * pattern is, the words on its row, counts that never go down, and "That's
 * not me": a pattern turned off comes back at confidence 0, for the planner
 * and for the profile the suggestions read.
 *
 *   npm test
 *
 * The modules are compiled on the fly with the project's own TypeScript; the
 * database is a small stand-in (flags and pattern rows in memory).
 */
const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

/* ---- the stand-in database ---- */
const flags = new Map();
let stored = [];
let profile = null;
const db = {
  getFlag: async k => (flags.has(k) ? flags.get(k) : null),
  setFlag: async (k, v) => { flags.set(k, v); },
  getPatterns: async () => stored.map(r => ({ ...r })),
  savePatterns: async (rows, now) => {
    for (const r of rows) {
      const id = `${r.kind}:${r.scope}`;
      stored = [...stored.filter(x => x.id !== id), { id, ...r, updated_at: now }];
    }
  },
  // the one query patterns.ts makes itself: the flags under a prefix that are '1'
  getDb: async () => ({
    getAllAsync: async (_sql, like) => {
      const prefix = String(like).replace(/%$/, '');
      return [...flags].filter(([k, v]) => k.startsWith(prefix) && v === '1').map(([k]) => ({ k }));
    },
  }),
};

function load(rel, deps) {
  const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  // with no `deps` anything it asks for is empty, as in the other tests; with them, only those
  const need = name => { if (!deps) return {}; if (!(name in deps)) throw new Error(`${rel} asks for ${name}`); return deps[name]; };
  new Function('require', 'module', 'exports', js)(need, mod, mod.exports);
  return mod.exports;
}
const signals = { ...load('src/learn/signals.ts', { '../db': db }), getProfile: async () => profile };
const next = load('src/next.ts');
const labels = load('src/labels.ts');
const patterns = load('src/patterns.ts', { './db': db, './learn/signals': signals });
const learned = load('src/learned.ts', { './db': db, './learn/signals': signals, './labels': labels, './patterns': patterns });

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const section = name => tests.push([name, null]);

const NOW = new Date(2026, 8, 24, 9, 30).getTime();
const pat = (kind, scope, value, n) => ({ kind, scope, value, confidence: patterns.trust(n), sample_count: n });
const row = (view, key) => view.groups.flatMap(g => g.rows).find(r => r.key === key);
const hour = h => new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' });
const emptyProfile = over => ({
  at: NOW, days: 0, byHour: Array.from({ length: 24 }, (_, key) => ({ key, started: 0, completed: 0 })), byWeekday: [],
  bestHours: [], estimateRatio: null, estimateN: 0, typicalSessionMin: null, earlyStopRate: null, putOffByLabel: [],
  tooBigRate: null, blockedRate: null, captured7: 0, completed7: 0, activeDays14: 0, gapDays: 0,
  estimateByLabel: [], capacityMin: null, capacityDays: 0, ...over,
});

section('how far along');
test('nothing yet is still learning', () => {
  assert.strictEqual(learned.stageOf(0), 'learning');
  assert.strictEqual(learned.stageOf(null), 'learning');
  assert.strictEqual(learned.stageOf(undefined), 'learning');
});
test('some evidence, under the planner\'s bar: starting to notice', () => {
  assert.strictEqual(learned.stageOf(patterns.trust(1)), 'noticing');
  assert.strictEqual(learned.stageOf(patterns.trust(4)), 'noticing');
  assert.strictEqual(learned.stageOf(0.49), 'noticing');
});
test('at the planner\'s bar: learned', () => {
  assert.strictEqual(learned.stageOf(0.5), 'learned');
  assert.strictEqual(learned.stageOf(patterns.trust(5)), 'learned');
  assert.strictEqual(learned.stageOf(patterns.trust(40)), 'learned');
});
test('five samples is where trust reaches the bar', () => {
  assert.ok(patterns.trust(patterns.ENOUGH) >= patterns.TRUSTED);
  assert.ok(patterns.trust(patterns.ENOUGH - 1) < patterns.TRUSTED);
});
test('the names', () => {
  assert.deepStrictEqual(learned.STAGE_NAME, { learning: 'Still learning', noticing: 'Starting to notice', learned: 'Learned' });
});

section('a new account');
test('every group is there, every row still learning', () => {
  const v = learned.learnedFrom({ rows: [] });
  assert.deepStrictEqual(v.groups.map(g => g.title), ['Planning', 'Focus', 'Starting', 'Projects', 'Your day']);
  const rows = v.groups.flatMap(g => g.rows);
  assert.strictEqual(rows.length, 8);
  assert.ok(v.groups.every(g => g.rows.length > 0));
  assert.ok(rows.every(r => r.stage === 'learning' && !r.off && r.pattern === null));
  assert.strictEqual(v.basis, '0 of 5 days so far');
  assert.strictEqual(row(v, 'estimate_ratio').evidence, '0 of 5 timed tasks so far');
});
test('what it has so far, of what it needs', () => {
  const v = learned.learnedFrom({ rows: [], profile: { days: 3, estimateN: 2 } });
  assert.strictEqual(v.basis, '3 of 5 days so far');
  assert.strictEqual(row(v, 'estimate_ratio').title, 'How long things take you');
  assert.strictEqual(row(v, 'estimate_ratio').evidence, '2 of 5 timed tasks so far');
  assert.strictEqual(row(v, 'session_length').evidence, null);
});
test('a row the profile no longer supports (confidence 0) is still learning', () => {
  const v = learned.learnedFrom({ rows: [{ kind: 'session_length', scope: 'all', value: 25, confidence: 0, sample_count: 9 }] });
  assert.strictEqual(row(v, 'session_length.all'), undefined);
  assert.strictEqual(row(v, 'session_length').stage, 'learning');
});

section('the rows');
const full = [
  pat('estimate_ratio', 'all', 1.32, 8), pat('estimate_ratio', 'work', 1.5, 3),
  pat('best_hour', '1', 10, 6), pat('best_hour', '2', 14, 2),
  pat('putoff_rate', 'money', 2.2, 4), pat('putoff_rate', 'work', 0.1, 8),
  pat('session_length', 'all', 25, 12), pat('early_stop', 'all', 0.41, 12),
  pat('too_big', 'all', 0.25, 12), pat('blocked', 'all', 0.02, 12),
  pat('capacity', 'all', 90, 9),
];
const view = learned.learnedFrom({ rows: full, profile: { days: 12, estimateN: 8 } });
test('a fact and what it rests on', () => {
  const r = row(view, 'estimate_ratio.all');
  assert.strictEqual(r.title, 'Things take you 1.3× your guess');
  assert.strictEqual(r.evidence, 'From 8 timed tasks');
  assert.strictEqual(r.stage, 'learned');
  assert.deepStrictEqual(r.pattern, { kind: 'estimate_ratio', scope: 'all', value: 1.32 });
  assert.strictEqual(view.basis, 'From 12 days');
});
test('per label, by the label\'s name; under five it says how far along', () => {
  const r = row(view, 'estimate_ratio.work');
  assert.strictEqual(r.title, 'Work takes you 1.5× your guess');
  assert.strictEqual(r.stage, 'noticing');
  assert.strictEqual(r.evidence, '3 of 5 timed tasks so far');
});
test('a guess that is about right says so', () => {
  const v = learned.learnedFrom({ rows: [pat('estimate_ratio', 'all', 1.04, 6)] });
  assert.strictEqual(row(v, 'estimate_ratio.all').title, 'Things take about as long as you guess');
});
test('the hours, best first, each known by its hour', () => {
  const day = view.groups.find(g => g.key === 'day').rows;
  assert.deepStrictEqual(day.map(r => r.key), ['best_hour.10', 'best_hour.14', 'capacity.all']);
  assert.strictEqual(day[0].title, `You get things done around ${hour(10)}`);
  assert.strictEqual(day[0].evidence, 'From 6 things done');
  assert.strictEqual(day[1].stage, 'noticing');
  assert.strictEqual(day[1].evidence, '2 of 5 things done so far');
});
test('sessions, projects and the day', () => {
  assert.strictEqual(row(view, 'session_length.all').title, 'A usual session is 25 minutes');
  assert.strictEqual(row(view, 'early_stop.all').title, '2 in 5 sessions end before the timer');
  assert.strictEqual(row(view, 'too_big.all').title, '1 in 4 project steps turns out too big');
  assert.strictEqual(row(view, 'blocked.all').title, 'Project steps rarely get stuck');
  assert.strictEqual(row(view, 'capacity.all').title, 'A usual day holds 1 hour 30 minutes');
  assert.strictEqual(row(view, 'capacity.all').evidence, 'From 9 days');
});
test('a share is the nearest plain one, with the ends in words', () => {
  const said = rate => row(learned.learnedFrom({ rows: [pat('early_stop', 'all', rate, 6)] }), 'early_stop.all').title;
  assert.strictEqual(said(0.1), '1 in 10 sessions ends before the timer');
  assert.strictEqual(said(0.21), '1 in 5 sessions ends before the timer');
  assert.strictEqual(said(0.5), '1 in 2 sessions ends before the timer');
  assert.strictEqual(said(0.7), '2 in 3 sessions end before the timer');
  assert.strictEqual(said(0), 'Sessions rarely end before the timer');
  assert.strictEqual(said(0.98), 'Sessions nearly always end before the timer');
});
test('only the labels that get moved are named', () => {
  const starting = view.groups.find(g => g.key === 'starting').rows;
  assert.deepStrictEqual(starting.map(r => r.title), ['Money tasks tend to get moved to later']);
  // which ones, never how often: a put-off is not shown as a number
  assert.ok(starting.every(r => !/\d|once|twice|times/.test(r.title)));
  assert.strictEqual(starting[0].evidence, '4 of 5 tasks so far');
});
test('no dashes, and none of the words Nura never says', () => {
  const all = [view, learned.learnedFrom({ rows: [] })].flatMap(v => [v.basis, ...v.groups.flatMap(g => [g.title, ...g.rows.flatMap(r => [r.title, r.evidence ?? '', learned.rowSaid(r)])])]);
  for (const s of all) {
    assert.ok(!/[—–]/.test(s), s);
    assert.ok(!/overdue|late\b|streak|fail|missed/i.test(s), s);
  }
});
test('read out: the fact, how far along, what it rests on', () => {
  assert.strictEqual(learned.rowSaid(row(view, 'estimate_ratio.all')), 'Things take you 1.3× your guess, Learned, shapes your plan, From 8 timed tasks');
  assert.strictEqual(learned.rowSaid(row(learned.learnedFrom({ rows: [] }), 'capacity')), 'What a day holds, Still learning');
});

section('no count goes down');
test('the most a count has been is what is kept', () => {
  assert.deepStrictEqual(learned.highWater({ days: 4, timed: 2 }, { days: 3, timed: 5, other: 1 }), { days: 4, timed: 5, other: 1 });
});
test('days that left the window are still counted', () => {
  const before = learned.learnedFrom({ rows: [], profile: { days: 4, estimateN: 3 } });
  const after = learned.learnedFrom({ rows: [], profile: { days: 1, estimateN: 0 }, seen: before.seen });
  assert.strictEqual(after.basis, '4 of 5 days so far');
  assert.strictEqual(row(after, 'estimate_ratio').evidence, '3 of 5 timed tasks so far');
});
test('a pattern resting on fewer than before shows what it has rested on', () => {
  const before = learned.learnedFrom({ rows: [pat('estimate_ratio', 'all', 1.3, 8)] });
  const after = learned.learnedFrom({ rows: [pat('estimate_ratio', 'all', 1.3, 4)], seen: before.seen });
  const r = row(after, 'estimate_ratio.all');
  assert.strictEqual(r.evidence, 'From 8 timed tasks');
  assert.strictEqual(r.stage, 'noticing');   // how far along follows what the planner does now
});

section('that\'s not me');
test('a pattern turned off comes back at confidence 0, the rest untouched', () => {
  const out = patterns.withoutOff(full, new Set(['estimate_ratio.all']));
  const off = out.find(r => r.kind === 'estimate_ratio' && r.scope === 'all');
  assert.strictEqual(off.confidence, 0);
  assert.strictEqual(off.value, 1.32);
  assert.strictEqual(off.sample_count, 8);
  assert.deepStrictEqual(out.filter(r => r !== off), full.filter(r => !(r.kind === 'estimate_ratio' && r.scope === 'all')));
  assert.strictEqual(full[0].confidence, patterns.trust(8));   // the rows handed in are left alone
});
test('nothing reads it as trusted', () => {
  const out = patterns.withoutOff(full, new Set(['capacity.all']));
  assert.strictEqual(patterns.patternValue(full, 'capacity'), 90);
  assert.strictEqual(patterns.patternValue(out, 'capacity'), null);
});
test('the planner goes back to your own guess', () => {
  const task = {
    id: 't', title: 'Draft the outline', est_minutes: 25, priority: 0, due_at: null, has_time: 0, state: 'today',
    parent_id: null, created_at: NOW - 86_400_000, snoozed_until: null, snooze_count: 0, label: null,
  };
  const ctx = rows => ({ now: NOW, dayEndMin: 21 * 60, energy: 'steady', anchors: [], patterns: rows });
  assert.strictEqual(next.predictMinutes(task, ctx(full)), 35);
  assert.strictEqual(next.predictMinutes(task, ctx(patterns.withoutOff(full, new Set(['estimate_ratio.all'])))), 25);
});
test('an hour is off by the hour, wherever it ranks', () => {
  const moved = [pat('best_hour', '1', 9, 7), pat('best_hour', '2', 10, 6)];
  const out = patterns.withoutOff(moved, new Set(['best_hour.10']));
  assert.deepStrictEqual(out.map(r => r.confidence), [patterns.trust(7), 0]);
});
test('on the screen it shows as off, with its numbers', () => {
  const v = learned.learnedFrom({ rows: full, off: new Set(['estimate_ratio.all']) });
  const r = row(v, 'estimate_ratio.all');
  assert.strictEqual(r.off, true);
  assert.strictEqual(r.stage, 'learned');
  assert.strictEqual(r.evidence, 'From 8 timed tasks');
  assert.strictEqual(learned.rowSaid(r), 'Things take you 1.3× your guess, Off, From 8 timed tasks');
  assert.strictEqual(row(v, 'capacity.all').off, false);
});
test('the profile the suggestions read leaves it out too', () => {
  const p = emptyProfile({
    days: 12, estimateRatio: 1.4, estimateN: 8, bestHours: [10, 14], typicalSessionMin: 25, earlyStopRate: 0.3,
    tooBigRate: 0.25, blockedRate: 0.1, capacityMin: 90, capacityDays: 9,
    putOffByLabel: [{ label: 'money', rate: 2, n: 4 }], estimateByLabel: [{ label: 'work', ratio: 1.5, n: 3 }],
  });
  assert.strictEqual(patterns.profileWithout(p, new Set()), p);
  const q = patterns.profileWithout(p, new Set(['estimate_ratio.all', 'best_hour.10', 'putoff_rate.money', 'capacity.all']));
  assert.strictEqual(q.estimateRatio, null);
  assert.deepStrictEqual(q.bestHours, [14]);
  assert.deepStrictEqual(q.putOffByLabel, []);
  assert.strictEqual(q.capacityMin, null);
  assert.deepStrictEqual(q.estimateByLabel, p.estimateByLabel);
  assert.strictEqual(q.typicalSessionMin, 25);
  assert.strictEqual(q.days, 12);
  assert.strictEqual(p.estimateRatio, 1.4);
});

section('through the database');
test('currentPatterns hands back what is off at confidence 0; the stored row keeps its numbers', async () => {
  flags.clear(); stored = [];
  profile = emptyProfile({
    days: 12, estimateRatio: 1.4, estimateN: 8, typicalSessionMin: 25,
    bestHours: [10], byHour: emptyProfile().byHour.map(b => (b.key === 10 ? { ...b, started: 7, completed: 6 } : b)),
  });
  const before = await patterns.currentPatterns(NOW);
  assert.strictEqual(before.find(r => r.id === 'estimate_ratio:all').confidence, patterns.trust(8));

  await patterns.setOff({ kind: 'estimate_ratio', scope: 'all', value: 1.4 }, true);
  assert.strictEqual(flags.get('learned.off.estimate_ratio.all'), '1');
  const after = await patterns.currentPatterns(NOW + 1000);
  const off = after.find(r => r.id === 'estimate_ratio:all');
  assert.strictEqual(off.confidence, 0);
  assert.strictEqual(off.sample_count, 8);
  assert.strictEqual(after.find(r => r.id === 'session_length:all').confidence, patterns.trust(12));
  assert.strictEqual(stored.find(r => r.id === 'estimate_ratio:all').confidence, patterns.trust(8));
  assert.strictEqual((await patterns.profileInUse()).estimateRatio, null);
});
test('the numbers keep adding up underneath', async () => {
  profile = { ...profile, estimateN: 11, estimateRatio: 1.5 };
  const rows = await patterns.currentPatterns(NOW + 10 * 60_000);   // past the few minutes between looks
  assert.strictEqual(rows.find(r => r.id === 'estimate_ratio:all').confidence, 0);
  const kept = stored.find(r => r.id === 'estimate_ratio:all');
  assert.strictEqual(kept.sample_count, 11);
  assert.strictEqual(kept.value, 1.5);
  assert.strictEqual(kept.confidence, patterns.trust(11));
});
test('the screen shows it off, and keeps the counts it showed', async () => {
  const v = await learned.loadLearned(NOW + 11 * 60_000);
  const r = row(v, 'estimate_ratio.all');
  assert.strictEqual(r.off, true);
  assert.strictEqual(r.title, 'Things take you 1.5× your guess');
  assert.strictEqual(r.evidence, 'From 11 timed tasks');
  assert.strictEqual(row(v, 'best_hour.10').off, false);
  assert.deepStrictEqual(JSON.parse(flags.get('learned.seen')), v.seen);
  assert.strictEqual(v.seen.days, 12);
});
test('turned back on, it is trusted again', async () => {
  await patterns.setOff({ kind: 'estimate_ratio', scope: 'all', value: 1.5 }, false);
  const rows = await patterns.currentPatterns(NOW + 12 * 60_000);
  assert.strictEqual(rows.find(r => r.id === 'estimate_ratio:all').confidence, patterns.trust(11));
  assert.strictEqual(patterns.patternValue(rows, 'estimate_ratio'), 1.5);
  assert.strictEqual((await patterns.profileInUse()).estimateRatio, 1.5);
  assert.strictEqual(row(await learned.loadLearned(NOW + 12 * 60_000), 'estimate_ratio.all').off, false);
});
test('without the flags, the patterns still come back', async () => {
  const broken = load('src/patterns.ts', {
    './db': { ...db, getDb: async () => { throw new Error('no db'); } }, './learn/signals': signals,
  });
  const rows = await broken.currentPatterns(NOW + 13 * 60_000);
  assert.strictEqual(rows.find(r => r.id === 'estimate_ratio:all').confidence, patterns.trust(11));
});

section('what a learned pattern shapes');
test('your pace, your good hours and what a day holds shape the plan; the rest, what Nura suggests', () => {
  for (const k of ['estimate_ratio', 'best_hour', 'capacity']) assert.strictEqual(learned.useOf(k), 'plan');
  for (const k of ['putoff_rate', 'too_big', 'blocked', 'session_length', 'early_stop']) assert.strictEqual(learned.useOf(k), 'suggest');
});
test('a learned row says which, a row still being noticed says only that', () => {
  const v = learned.learnedFrom({
    rows: [pat('estimate_ratio', 'all', 1.3, 8), pat('session_length', 'all', 25, 12), pat('capacity', 'all', 90, 2)],
    profile: { days: 12, estimateN: 8 },
  });
  assert.strictEqual(learned.stageSaid(row(v, 'estimate_ratio.all')), 'Learned, shapes your plan');
  assert.strictEqual(learned.stageSaid(row(v, 'session_length.all')), 'Learned, shapes suggestions');
  assert.strictEqual(learned.stageSaid(row(v, 'capacity.all')), 'Starting to notice');
  assert.strictEqual(learned.stageSaid({ ...row(v, 'estimate_ratio.all'), off: true }), 'Off');
});

section('the switches sync');
const freshPatterns = () => load('src/patterns.ts', { './db': db, './learn/signals': signals });
test('turning one off writes a row, which is what syncs', async () => {
  flags.clear(); stored = [];
  profile = emptyProfile({ days: 12, estimateRatio: 1.4, estimateN: 8 });
  const p = freshPatterns();
  await p.currentPatterns(NOW);
  await p.setOff({ kind: 'estimate_ratio', scope: 'all', value: 1.4 }, true);
  const sw = stored.find(r => r.id === 'off:estimate_ratio.all');
  assert.ok(sw, 'the switch is a stored row');
  assert.strictEqual(sw.value, 1);
});
test('on another device the row is enough: no flag there, and it is still off', async () => {
  flags.clear();                                   // the other device never had the flag
  const p = freshPatterns();
  assert.deepStrictEqual([...await p.turnedOff()], ['estimate_ratio.all']);
  const rows = await p.currentPatterns(NOW + 1000);
  assert.strictEqual(rows.find(r => r.id === 'estimate_ratio:all').confidence, 0);
});
test('a switch is never handed back as a pattern, and looking again leaves it as it is', async () => {
  const p = freshPatterns();
  const rows = await p.currentPatterns(NOW + 10 * 60_000);
  assert.ok(!rows.some(r => r.kind === 'off'));
  assert.ok(!(await p.storedPatterns(NOW + 20 * 60_000)).rows.some(r => r.kind === 'off'));
  assert.strictEqual(stored.find(r => r.id === 'off:estimate_ratio.all').value, 1);
});
test('back on somewhere else wins over an old flag here', async () => {
  flags.set('learned.off.estimate_ratio.all', '1');                      // this device's old flag
  stored = stored.map(r => (r.id === 'off:estimate_ratio.all' ? { ...r, value: 0 } : r));   // the row that arrived
  const p = freshPatterns();
  assert.strictEqual((await p.turnedOff()).size, 0);
  assert.strictEqual((await p.currentPatterns(NOW + 30 * 60_000)).find(r => r.id === 'estimate_ratio:all').confidence, patterns.trust(8));
});
test('a flag from before the switches synced still holds', async () => {
  flags.clear(); flags.set('learned.off.capacity.all', '1');
  stored = stored.filter(r => r.kind !== 'off');
  assert.deepStrictEqual([...await freshPatterns().turnedOff()], ['capacity.all']);
});

section('a device with no history of its own');
test('leaves what came with the account as it is', async () => {
  flags.clear();
  stored = [{ id: 'estimate_ratio:all', ...pat('estimate_ratio', 'all', 1.4, 8), updated_at: NOW }];
  profile = emptyProfile();                         // a new phone: no days, no log
  const rows = await freshPatterns().currentPatterns(NOW + 60 * 60_000);
  assert.strictEqual(rows.find(r => r.id === 'estimate_ratio:all').confidence, patterns.trust(8));
  assert.strictEqual(stored.find(r => r.id === 'estimate_ratio:all').confidence, patterns.trust(8));
});
test('with history of its own, what it no longer sees is kept at 0, as before', async () => {
  profile = emptyProfile({ days: 6, typicalSessionMin: 25 });
  await freshPatterns().currentPatterns(NOW + 2 * 60 * 60_000);
  assert.strictEqual(stored.find(r => r.id === 'estimate_ratio:all').confidence, 0);
  assert.strictEqual(stored.find(r => r.id === 'session_length:all').confidence, patterns.trust(6));
});

section('the summary the coach gets');
test('a rate that is off is left out, never said as 0%', () => {
  const p = emptyProfile({ days: 12, tooBigRate: 0.25, blockedRate: 0.1 });
  assert.ok(signals.profileSummary(p).includes('25% replanned as too big, 10% blocked'));
  const q = patterns.profileWithout(p, new Set(['blocked.all']));
  const said = signals.profileSummary(q);
  assert.ok(said.includes('Project steps: 25% replanned as too big.'), said);
  assert.ok(!/blocked/.test(said), said);
  const only = signals.profileSummary(patterns.profileWithout(p, new Set(['too_big.all'])));
  assert.ok(only.includes('Project steps: 10% blocked.'), only);
});
test('an hour that is off is not counted in the parts of the day', () => {
  const byHour = emptyProfile().byHour.map(b => (b.key === 10 ? { ...b, started: 9, completed: 8 } : b.key === 15 ? { ...b, started: 3, completed: 3 } : b));
  const p = emptyProfile({ days: 12, bestHours: [10, 15], byHour });
  assert.ok(signals.profileSummary(p).includes('8 of 11 completions in the morning'));
  const q = patterns.profileWithout(p, new Set(['best_hour.10']));
  assert.strictEqual(q.byHour[10].completed, 0);
  assert.strictEqual(p.byHour[10].completed, 8);           // the profile itself is left alone
  const said = signals.profileSummary(q);
  assert.ok(!said.includes('10:00'), said);
  assert.ok(!said.includes('morning'), said);
});

(async () => {
  for (const [name, fn] of tests) {
    if (!fn) { console.log(`${passed ? '\n' : ''}${name}`); continue; }
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  }
  console.log(`\n${passed} passed`);
})().catch(e => { console.error(e); process.exit(1); });
