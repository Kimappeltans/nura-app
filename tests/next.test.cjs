/**
 * The planner (src/next.ts): the reason on the card in front (what it fits
 * before, when it's due, a high priority: at most two, never "late"), how
 * tasks are ranked, and how what Nura learned changes the ranking.
 *
 *   npm test
 */
const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function load(rel) {
  const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', js)(() => ({}), mod, mod.exports);
  return mod.exports;
}
const { decide, rankActions, predictMinutes, byPlan } = load('src/next.ts');

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

// a fixed Thursday at 9:30 local time
const NOW = new Date(2026, 8, 24, 9, 30).getTime();
const DAY = 86_400_000;
const at = (h, m = 0) => { const d = new Date(NOW); d.setHours(h, m, 0, 0); return d.getTime(); };
const clock = ms => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
let n = 0;
const task = over => ({
  id: `t${n++}`, title: 'Draft the proposal outline', est_minutes: 25, priority: 0, due_at: null, has_time: 0,
  state: 'today', parent_id: null, created_at: NOW - DAY, snoozed_until: null, snooze_count: 0, label: null, ...over,
});
const ctx = over => ({ now: NOW, dayEndMin: 21 * 60, energy: 'steady', anchors: [], ...over });
const reason = (t, anchors = []) => decide(t, ctx({ anchors })).reason;

console.log('the reason on the card');
test('fits before the next thing with a time', () => {
  assert.strictEqual(reason(task(), [at(11), at(15)]), `Fits before ${clock(at(11))}`);
});
test('with nothing timed, fits before the end of the day', () => {
  assert.strictEqual(reason(task()), `Fits before ${clock(at(21))}`);
});
test('something tomorrow is not a limit for today', () => {
  assert.strictEqual(reason(task(), [at(18) + DAY]), `Fits before ${clock(at(21))}`);
});
test('says nothing about fitting when it doesn\'t', () => {
  assert.strictEqual(reason(task({ est_minutes: 90 }), [at(10)]), null);
});
test('a task\'s own time is not something it has to fit before', () => {
  const own = at(10);
  assert.strictEqual(reason(task({ due_at: own, has_time: 1 }), [own, at(12)]), `Fits before ${clock(at(12))} · Due at ${clock(own)}`);
});
test('due today, without a time', () => {
  assert.strictEqual(reason(task({ est_minutes: null, due_at: at(0) })), 'Due today');
});
test('never late: a time that has passed says nothing', () => {
  assert.strictEqual(reason(task({ est_minutes: null, due_at: at(8), has_time: 1 })), null);
});
test('high priority, and never more than two facts', () => {
  assert.strictEqual(reason(task({ priority: 3, due_at: at(0) }), [at(11)]), `Fits before ${clock(at(11))} · Due today`);
  assert.strictEqual(reason(task({ priority: 3 })), `Fits before ${clock(at(21))} · High priority`);
});
test('a project\'s move says whose move it is', () => {
  const t = task({ est_minutes: null });
  const d = decide(t, ctx({ moves: new Map([[t.id, { project: 'Finish my website', touchedAt: NOW, blocked: false }]]) }));
  assert.strictEqual(d.reason, 'Next move on Finish my website');
});

console.log('\nranking');
test('your pick outranks everything', () => {
  const urgent = task({ due_at: at(10), has_time: 1, priority: 3 });
  const mine = task();
  const [first] = rankActions([urgent, mine], ctx({ pinId: mine.id }));
  assert.strictEqual(first.taskId, mine.id);
});
test('due soon beats high priority beats neither', () => {
  const plain = task(), high = task({ priority: 3 }), soon = task({ due_at: at(11), has_time: 1 });
  assert.deepStrictEqual(rankActions([plain, high, soon], ctx()).map(d => d.taskId), [soon.id, high.id, plain.id]);
});
test('already started comes before starting something new', () => {
  const fresh = task({ priority: 2 }), started = task({ state: 'doing' });
  assert.strictEqual(rankActions([fresh, started], ctx())[0].taskId, started.id);
});
test('passed on, snoozed, done and sub-steps are left out', () => {
  const a = task(), b = task({ snoozed_until: NOW + 3600_000 }), c = task({ state: 'done' }), d = task({ parent_id: 'x' }), e = task();
  assert.deepStrictEqual(rankActions([a, b, c, d, e], ctx({ passedIds: [e.id] })).map(x => x.taskId), [a.id]);
});
test('put off again and again: lower, but never gone', () => {
  const avoided = task({ snooze_count: 4, created_at: NOW - 2 * DAY }), other = task({ created_at: NOW - DAY });
  const ranked = rankActions([avoided, other], ctx());
  assert.deepStrictEqual(ranked.map(d => d.taskId), [other.id, avoided.id]);
  assert.ok(ranked[1].factors.repeated_putoff < 0);
});
test('a low day: the small thing first', () => {
  const big = task({ est_minutes: 60 }), small = task({ est_minutes: 5 });
  assert.strictEqual(rankActions([big, small], ctx({ energy: 'low' }))[0].taskId, small.id);
});
test('ties go to the older task, so the order never flickers', () => {
  const older = task({ created_at: NOW - 2 * 3600_000 }), newer = task({ created_at: NOW - 3600_000 });
  assert.strictEqual(rankActions([newer, older], ctx())[0].taskId, older.id);
});

console.log('\nwhat Nura learned');
const pat = (kind, scope, value, confidence = 0.8) => ({ kind, scope, value, confidence, sample_count: 10 });
test('your pace: writing takes you 1.6×, so 25 min is 40', () => {
  const t = task({ label: 'writing' });
  assert.strictEqual(predictMinutes(t, ctx({ patterns: [pat('estimate_ratio', 'writing', 1.6)] })), 40);
});
test('the overall pace when the label has none', () => {
  assert.strictEqual(predictMinutes(task({ label: 'calls' }), ctx({ patterns: [pat('estimate_ratio', 'all', 1.4)] })), 35);
});
test('a pattern Nura isn\'t sure of changes nothing', () => {
  assert.strictEqual(predictMinutes(task(), ctx({ patterns: [pat('estimate_ratio', 'all', 2, 0.3)] })), 25);
});
test('your real pace decides what fits', () => {
  const t = task({ est_minutes: 60, label: 'writing' });
  assert.strictEqual(decide(t, ctx({ anchors: [at(11)] })).factors.available_time, 10);
  assert.strictEqual(decide(t, ctx({ anchors: [at(11)], patterns: [pat('estimate_ratio', 'writing', 1.6)] })).factors.available_time, -10);
});
test('your good hour lifts longer work', () => {
  const d = decide(task({ est_minutes: 45 }), ctx({ patterns: [pat('best_hour', '1', 9)] }));
  assert.ok(d.factors.energy_fit > 0);
});

console.log('\nlists in the planner\'s order');
test('ranked first, then the rest', () => {
  const a = task(), b = task(), c = task();
  const order = byPlan([{ taskId: b.id }, { taskId: a.id }], () => 0);
  assert.deepStrictEqual([a, b, c].sort(order).map(x => x.id), [b.id, a.id, c.id]);
});

console.log(`\n${passed} passed`);
