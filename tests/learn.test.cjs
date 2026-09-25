/**
 * The learning loop's arithmetic, checked without the app: the behaviour
 * profile from raw rows, each suggestion rule firing (and staying quiet), the
 * ranking, and how feedback weights decay.
 *
 *   npm test
 *
 * The modules are compiled on the fly with the project's own TypeScript; the
 * database is stubbed — these tests only call the pure functions.
 */
const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function load(rel) {
  const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  const stubDb = { getDb: async () => { throw new Error('no db in tests'); }, getFlag: async () => null, setFlag: async () => {} };
  new Function('require', 'module', 'exports', js)(() => stubDb, mod, mod.exports);
  return mod.exports;
}
global.__DEV__ = false;
const signals = load('src/learn/signals.ts');
const suggest = load('src/learn/suggest.ts');
const feedback = load('src/learn/feedback.ts');

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

const DAY = 86_400_000;
// a fixed Thursday at 9:30 local time, so hours and weekdays are predictable
const NOW = new Date(2026, 8, 24, 9, 30).getTime();
const at = (daysAgo, h, m = 0) => { const d = new Date(NOW - daysAgo * DAY); d.setHours(h, m, 0, 0); return d.getTime(); };
const ev = (kind, task_id, t, meta) => ({ task_id, kind, at: t, meta: meta ? JSON.stringify(meta) : null });

/** a timed session on `id`, `daysAgo` days back at hour `h` */
function session(id, daysAgo, h, { minutes = 20, planned = 25, est = null, done = true } = {}) {
  const s = at(daysAgo, h);
  const out = [ev('session_start', id, s, { planned, est }), ev('session_end', id, s + minutes * 60000, { minutes, planned, est, done })];
  if (done) out.push(ev('completed', id, s + minutes * 60000 + 1000, { partial: false }));
  return out;
}

const task = (id, over = {}) => ({
  id, title: 'A task', first_action: null, est_minutes: null, due_at: null, state: 'today', parent_id: null,
  created_at: NOW - 2 * DAY, completed_at: null, energy: null, freq_target: null, freq_period: null,
  snoozed_until: null, repeat_rule: null, label: null, has_time: 0, priority: 0, activity: null,
  repeat_days: null, snooze_count: 0, updated_at: null, ...over,
});

/* A few weeks of a morning person: sessions at 10 get done, the evening ones don't. */
function morningHistory() {
  const events = [];
  for (let d = 1; d <= 8; d++) {
    events.push(...session(`m${d}`, d, 10, { minutes: 30, est: 20, done: true }));
    if (d % 2 === 0) events.push(...session(`e${d}`, d, 19, { minutes: 5, planned: 25, done: false }));
  }
  events.push(ev('skipped', 'b1', at(3, 12), { minutes: 180 }), ev('skipped', 'b1', at(2, 12), { minutes: 180 }),
    ev('skipped', 'b2', at(2, 13), { minutes: 180 }), ev('swapped', 'b3', at(1, 13)),
    ev('skipped', 'b3', at(1, 14), { dropped: true }));   // dropping isn't putting off
  const tasks = [
    ...Array.from({ length: 8 }, (_, i) => ({ id: `m${i + 1}`, label: 'work', created_at: at(i + 2, 8), completed_at: at(i + 1, 10, 30), parent_id: null })),
    { id: 'b1', label: 'money', created_at: at(10, 8), completed_at: null, parent_id: null },
    { id: 'b2', label: 'money', created_at: at(10, 8), completed_at: null, parent_id: null },
    { id: 'b3', label: 'money', created_at: at(10, 8), completed_at: null, parent_id: null },
  ];
  const projectEvents = [{ kind: 'done', at: at(3, 10) }, { kind: 'done', at: at(2, 10) }, { kind: 'too_big', at: at(1, 10) }, { kind: 'blocked', at: at(1, 11) }];
  return { events, tasks, projectEvents, lastBeforeToday: at(1, 19, 5) };
}

console.log('profileFrom');
test('no data at all: nothing divides by zero, patterns are empty', () => {
  const p = signals.profileFrom({ events: [], tasks: [], projectEvents: [], lastBeforeToday: null }, NOW);
  assert.strictEqual(p.days, 0);
  assert.deepStrictEqual(p.bestHours, []);
  assert.strictEqual(p.estimateRatio, null);
  assert.strictEqual(p.typicalSessionMin, null);
  assert.strictEqual(p.earlyStopRate, null);
  assert.strictEqual(p.tooBigRate, null);
  assert.deepStrictEqual(p.putOffByLabel, []);
  assert.strictEqual(p.gapDays, 0);
  assert.strictEqual(p.byHour.length, 24);
  assert.strictEqual(p.byWeekday.length, 7);
  assert.ok(signals.profileSummary(p).includes('Too little history'));
});
test('under five days: counts are kept, patterns are not guessed', () => {
  const events = [...session('a', 1, 10, { est: 10 }), ...session('b', 2, 10, { est: 10 })];
  const p = signals.profileFrom({ events, tasks: [], projectEvents: [], lastBeforeToday: at(1, 11) }, NOW);
  assert.strictEqual(p.days, 2);
  assert.strictEqual(p.byHour[10].completed, 2);
  assert.deepStrictEqual(p.bestHours, []);
  assert.strictEqual(p.estimateRatio, null);
  assert.strictEqual(p.estimateN, 2);
});
test('a morning person: best hour, estimates, sessions, put-offs, projects', () => {
  const p = signals.profileFrom(morningHistory(), NOW);
  assert.strictEqual(p.days, 8);
  assert.deepStrictEqual(p.byHour[10], { key: 10, started: 8, completed: 8 });
  assert.deepStrictEqual(p.byHour[19], { key: 19, started: 4, completed: 0 });
  assert.deepStrictEqual(p.bestHours, [10]);          // 19:00 never finishes, so it's not "best"
  assert.strictEqual(p.estimateRatio, 1.5);            // 30 min spent on 20 min guesses
  assert.strictEqual(p.estimateN, 8);
  assert.strictEqual(p.typicalSessionMin, 30);         // median of eight 30s and four 5s
  assert.strictEqual(p.earlyStopRate, 0.33);           // 4 of 12 stopped before the clock
  assert.deepStrictEqual(p.putOffByLabel.find(l => l.label === 'money'), { label: 'money', rate: 1.33, n: 3 });   // 2 + 1 + 1 swap, over 3
  assert.strictEqual(p.tooBigRate, 0.25);
  assert.strictEqual(p.blockedRate, 0.25);
  assert.strictEqual(p.completed7, 7);                 // completed_at within the last 7 days
  assert.strictEqual(p.activeDays14, 8);
  assert.strictEqual(p.gapDays, 1);
});
test('a tick-off with no session counts as a started-and-finished attempt; a session\'s own completion is not counted twice', () => {
  const events = [ev('completed', 'x', at(1, 15)), ...session('y', 1, 16, { done: true })];
  const p = signals.profileFrom({ events, tasks: [], projectEvents: [], lastBeforeToday: null }, NOW);
  assert.deepStrictEqual(p.byHour[15], { key: 15, started: 1, completed: 1 });
  assert.deepStrictEqual(p.byHour[16], { key: 16, started: 1, completed: 1 });
});
test('a task done over two sittings is one estimate, both sittings added up', () => {
  const events = [];
  for (let d = 1; d <= 5; d++) events.push(ev('acted', null, at(d, 8)));
  events.push(...session('t', 2, 10, { minutes: 10, est: 10, done: false }), ...session('t', 1, 10, { minutes: 10, est: 10, done: true }));
  const p = signals.profileFrom({ events, tasks: [], projectEvents: [], lastBeforeToday: null }, NOW);
  assert.strictEqual(p.estimateN, 1);
  assert.strictEqual(p.estimateRatio, 2);
});
test('the gap is whole days since the last day with anything in it', () => {
  const p = signals.profileFrom({ events: [], tasks: [], projectEvents: [], lastBeforeToday: at(4, 22) }, NOW);
  assert.strictEqual(p.gapDays, 4);
});
test('the summary is short, numeric, and carries no titles', () => {
  const p = signals.profileFrom(morningHistory(), NOW);
  const s = signals.profileSummary(p);
  assert.ok(s.length <= 600, `summary is ${s.length} chars`);
  assert.ok(s.includes('10:00'));
  assert.ok(s.includes('1.5x'));
  assert.ok(!s.includes('A task'));
});
test('median of an even list is the middle two averaged', () => {
  assert.strictEqual(signals.median([1, 3, 2, 10]), 2.5);
  assert.strictEqual(signals.median([]), null);
});

console.log('suggestions');
const profile = signals.profileFrom(morningHistory(), NOW);
const ctx = (over = {}) => ({ profile, tasks: [], now: null, dayEndMin: 21 * 60, doneToday: 0, nowMs: NOW, ...over });
const kinds = list => list.map(s => s.kind).sort();
const one = (list, kind) => list.find(s => s.kind === kind);

test('best_time: offers the good hour later today, with the real numbers', () => {
  const s = one(suggest.localSuggestions(ctx({ tasks: [task('t1')] })), 'best_time');
  assert.ok(s);
  assert.strictEqual(s.action.type, 'schedule');
  assert.strictEqual(new Date(s.action.at).getHours(), 10);
  assert.strictEqual(s.why, 'All 8 things you finished lately were in the morning');
  assert.strictEqual(s.who, 'ra');
});
test('best_time: in the good hour, it offers to start now', () => {
  const s = one(suggest.localSuggestions(ctx({ tasks: [task('t1')], nowMs: at(0, 10, 15) })), 'best_time');
  assert.strictEqual(s.action.type, 'focus');
});
test('best_time: quiet after the good hour, with little data, or for a task with a set time', () => {
  assert.ok(!one(suggest.localSuggestions(ctx({ tasks: [task('t1')], nowMs: at(0, 14) })), 'best_time'));
  const thin = signals.profileFrom({ events: [], tasks: [], projectEvents: [], lastBeforeToday: null }, NOW);
  assert.ok(!one(suggest.localSuggestions(ctx({ profile: thin, tasks: [task('t1')] })), 'best_time'));
  assert.ok(!one(suggest.localSuggestions(ctx({ tasks: [task('t1', { has_time: 1 })] })), 'best_time'));
});
test('shrink: a task moved three times, not one moved twice', () => {
  const list = suggest.localSuggestions(ctx({ tasks: [task('a', { snooze_count: 3, state: 'inbox' }), task('b', { snooze_count: 2, state: 'inbox' })] }));
  const s = list.filter(x => x.kind === 'shrink');
  assert.strictEqual(s.length, 1);
  assert.strictEqual(s[0].taskId, 'a');
  assert.ok(s[0].why.includes('3 times'));
  assert.strictEqual(s[0].who, 'nu');
  assert.ok(!/overdue|streak/i.test(s[0].text + s[0].why));
});
test('estimate: 1.5× over eight tasks turns a 20-minute guess into 30', () => {
  const s = one(suggest.localSuggestions(ctx({ now: task('n', { est_minutes: 20 }) })), 'estimate');
  assert.ok(s);
  assert.deepStrictEqual(s.action, { type: 'set_minutes', minutes: 30 });
  assert.ok(s.why.includes('8'));
});
test('estimate: quiet with too few samples or a small ratio', () => {
  const few = { ...profile, estimateN: 4 };
  assert.ok(!one(suggest.localSuggestions(ctx({ profile: few, now: task('n', { est_minutes: 20 }) })), 'estimate'));
  const close = { ...profile, estimateRatio: 1.2 };
  assert.ok(!one(suggest.localSuggestions(ctx({ profile: close, now: task('n', { est_minutes: 20 }) })), 'estimate'));
});
test('comeback: after three days away, one small thing and nothing else', () => {
  const away = { ...profile, gapDays: 4 };
  const list = suggest.localSuggestions(ctx({ profile: away,
    tasks: [task('big', { est_minutes: 60 }), task('small', { est_minutes: 5 }), task('slipping', { snooze_count: 5 })] }));
  assert.deepStrictEqual(kinds(list), ['comeback']);
  assert.strictEqual(list[0].taskId, 'small');
  assert.strictEqual(list[0].why, 'Last here 4 days ago');
});
test('comeback: not after two days, and not once something is done today', () => {
  assert.ok(!one(suggest.localSuggestions(ctx({ profile: { ...profile, gapDays: 2 }, tasks: [task('a')] })), 'comeback'));
  assert.ok(!one(suggest.localSuggestions(ctx({ profile: { ...profile, gapDays: 5 }, tasks: [task('a')], doneToday: 1 })), 'comeback'));
});
test('plan_it: a vague verb or a very long estimate, but not a project move', () => {
  const s = one(suggest.localSuggestions(ctx({ tasks: [task('v', { title: 'Work on the thesis' })] })), 'plan_it');
  assert.ok(s);
  assert.strictEqual(s.action.type, 'plan');
  assert.ok(one(suggest.localSuggestions(ctx({ tasks: [task('l', { title: 'Tax return', est_minutes: 180 })] })), 'plan_it'));
  assert.ok(!one(suggest.localSuggestions(ctx({ tasks: [task('c', { title: 'Call the dentist' })] })), 'plan_it'));
  assert.ok(!one(suggest.localSuggestions(ctx({ tasks: [task('v', { title: 'Work on the thesis' })], moveIds: ['v'] })), 'plan_it'));
});
test('rest: past the end of the day it is the only suggestion', () => {
  const list = suggest.localSuggestions(ctx({ tasks: [task('a', { snooze_count: 4 })], nowMs: at(0, 21, 30) }));
  assert.deepStrictEqual(kinds(list), ['rest']);
  assert.ok(list[0].why.includes('9pm'));
});
test('rest: a day that ends after midnight is still going at 00:30; five done is enough', () => {
  assert.ok(!one(suggest.localSuggestions(ctx({ dayEndMin: 25 * 60, nowMs: at(0, 0, 30) })), 'rest'));
  assert.ok(one(suggest.localSuggestions(ctx({ dayEndMin: 21 * 60, nowMs: at(0, 0, 30) })), 'rest'));
  assert.ok(one(suggest.localSuggestions(ctx({ doneToday: 5, nowMs: at(0, 14) })), 'rest'));
  assert.ok(!one(suggest.localSuggestions(ctx({ doneToday: 4, nowMs: at(0, 14) })), 'rest'));
});
test('batch: three small money things together, not two, not big ones', () => {
  const small = n => Array.from({ length: n }, (_, i) => task(`s${i}`, { label: 'money', est_minutes: 5 + i }));
  const s = one(suggest.localSuggestions(ctx({ tasks: small(3) })), 'batch');
  assert.ok(s);
  assert.deepStrictEqual(s.taskIds, ['s0', 's1', 's2']);
  assert.strictEqual(s.action.minutes, 20);          // 5 + 6 + 7 = 18, to the nearest 5
  assert.ok(!one(suggest.localSuggestions(ctx({ tasks: small(2) })), 'batch'));
  assert.ok(!one(suggest.localSuggestions(ctx({ tasks: small(3).map(t => ({ ...t, est_minutes: 30 })) })), 'batch'));
});
test('ids are stable for the day and change with it', () => {
  const a = suggest.localSuggestions(ctx({ tasks: [task('a', { snooze_count: 3 })] }))[0].id;
  const b = suggest.localSuggestions(ctx({ tasks: [task('a', { snooze_count: 3 })], nowMs: NOW + 60_000 }))[0].id;
  const c = suggest.localSuggestions(ctx({ tasks: [task('a', { snooze_count: 3 })], nowMs: NOW + DAY }))[0].id;
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, c);
  assert.strictEqual(feedback.keyOf(a), feedback.keyOf(c));
});
test('snoozed and finished tasks are left alone', () => {
  const list = suggest.localSuggestions(ctx({ tasks: [
    task('z', { snooze_count: 5, snoozed_until: NOW + 3600_000 }), task('d', { snooze_count: 5, state: 'done' })] }));
  assert.strictEqual(list.length, 0);
});

console.log('rank');
const S = (id, kind, confidence, taskId, taskIds) => ({ id, kind, confidence, taskId, taskIds, text: '', who: 'nu', source: 'local' });
test('confidence × weight decides the order', () => {
  const list = [S('a', 'shrink', 0.9, 't1'), S('b', 'best_time', 0.6, 't2')];
  assert.deepStrictEqual(suggest.rank(list, {}, 2).map(s => s.id), ['a', 'b']);
  assert.deepStrictEqual(suggest.rank(list, { shrink: 0.2, best_time: 0.8 }, 2).map(s => s.id), ['b', 'a']);
});
test('never two about the same task (batches included), never two of a kind', () => {
  const list = [S('a', 'shrink', 0.9, 't1'), S('b', 'estimate', 0.8, 't1'), S('c', 'shrink', 0.7, 't2'),
    S('d', 'batch', 0.6, undefined, ['t1', 't3']), S('e', 'rest', 0.5)];
  assert.deepStrictEqual(suggest.rank(list, {}, 5).map(s => s.id), ['a', 'e']);
});
test('the limit holds', () => {
  const list = [S('a', 'shrink', 0.9, 't1'), S('b', 'rest', 0.8), S('c', 'plan_it', 0.7, 't2')];
  assert.strictEqual(suggest.rank(list, {}, 2).length, 2);
  assert.strictEqual(suggest.rank([], {}, 2).length, 0);
});

console.log('feedback');
const row = (sid, kind, outcome, ageDays) => ({ sid, kind, outcome, at: NOW - ageDays * DAY });
test('no history: every kind starts at an even 0.5', () => {
  const w = feedback.weightsFrom([], NOW);
  for (const k of feedback.KINDS) assert.strictEqual(w[k], 0.5);
});
test('accepted rises, dismissed fades, and each suggestion counts once', () => {
  const w = feedback.weightsFrom([
    row('s1', 'shrink', 'shown', 0), row('s1', 'shrink', 'accepted', 0),
    row('r1', 'rest', 'shown', 0), row('r1', 'rest', 'dismissed', 0),
  ], NOW);
  assert.strictEqual(w.shrink, 2 / 3);     // Beta(2,1)
  assert.strictEqual(w.rest, 1 / 3);       // Beta(1,2)
});
test('a half-life ago counts half', () => {
  assert.strictEqual(feedback.decay(21 * DAY), 0.5);
  assert.strictEqual(feedback.decay(0), 1);
  const w = feedback.weightsFrom([row('s1', 'shrink', 'dismissed', 21)], NOW);
  assert.strictEqual(w.shrink, 1 / 2.5);   // Beta(1, 1.5)
  const old = feedback.weightsFrom([row('s1', 'shrink', 'dismissed', 180)], NOW);
  assert.ok(Math.abs(old.shrink - 0.5) < 0.01, 'half a year on, a no has nearly worn off');
});
test('shown and never answered is a quiet, small no — but not straight away', () => {
  const later = feedback.weightsFrom([row('s1', 'batch', 'shown', 1)], NOW);
  assert.ok(later.batch < 0.5 && later.batch > 1 / 3);
  const fresh = feedback.weightsFrom([row('s1', 'batch', 'shown', 0)], NOW);
  assert.strictEqual(fresh.batch, 0.5);
});
test('cooldowns: a no rests a week, a yes a day, a no to rest only tonight', () => {
  const hidden = feedback.hiddenFrom([
    row('shrink:a:2026-09-20', 'shrink', 'dismissed', 4),
    row('shrink:b:2026-09-10', 'shrink', 'dismissed', 8),
    row('estimate:c:2026-09-24', 'estimate', 'accepted', 0.5),
    row('estimate:d:2026-09-22', 'estimate', 'accepted', 2),
    row('rest:-:2026-09-23', 'rest', 'dismissed', 1),
  ], NOW);
  assert.deepStrictEqual([...hidden].sort(), ['estimate:c', 'shrink:a']);
});

console.log(`\n${passed} passed`);
