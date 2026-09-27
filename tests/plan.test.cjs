/**
 * The day plan (src/dayPlan.ts), interventions (src/interventions.ts) and
 * living project plans (what a step waits on: src/projects.ts nextReady,
 * src/planner.ts mergePath), checked without the app.
 *
 *   npm test
 */
const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const cache = {};
/** Compile a src file; relative imports load the same way, anything in `stubs` is used instead. */
function load(rel, stubs = {}) {
  const file = path.join(__dirname, '..', rel);
  if (cache[file]) return cache[file];
  const src = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  cache[file] = mod.exports;
  new Function('require', 'module', 'exports', js)((name) => {
    if (name in stubs) return stubs[name];
    if (name.startsWith('.')) {
      const base = path.join(path.dirname(file), name);
      const found = ['.ts', '.tsx', '/index.ts'].map(x => base + x).find(f => fs.existsSync(f));
      if (found) return load(path.relative(path.join(__dirname, '..'), found), stubs);
    }
    return {};
  }, mod, mod.exports);
  Object.assign(cache[file], mod.exports);
  return cache[file];
}

global.__DEV__ = false;
const stubs = { './db': {}, '../db': {}, './supabase': {}, './ai': { noDashes: s => s }, './activities': {}, './labels': {} };
const { proposeDay, hm } = load('src/dayPlan.ts', stubs);
const { interventionsFrom, typeOf, names } = load('src/interventions.ts', stubs);
const { nextReady } = load('src/projects.ts', stubs);
const { mergePath, readPlan } = load('src/planner.ts', stubs);

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

const NOW = new Date(2026, 8, 24, 13, 0).getTime();
let n = 0;
const task = over => ({ id: `t${n++}`, title: `Task ${n}`, est_minutes: 30, priority: 0, due_at: null, has_time: 0, state: 'today',
  parent_id: null, created_at: NOW - 86_400_000, snoozed_until: null, snooze_count: 0, label: null, activity: null, ...over });
const dec = (t, factors = {}, suggestedMinutes = null) => ({ taskId: t.id, task: t, score: 0, factors, reason: null, suggestedMinutes });

console.log('the day plan');
test('a day that fits says nothing', () => {
  const today = [dec(task()), dec(task()), dec(task())];
  assert.strictEqual(proposeDay(today, { learned: null, timeLeft: 120, doneToday: 0 }), null);
});
test('too full: keep what fits, in the planner\'s order, leave the rest', () => {
  const a = task(), b = task(), c = task(), d = task();
  const p = proposeDay([dec(a), dec(b), dec(c), dec(d)], { learned: 60, timeLeft: 400, doneToday: 0 });
  assert.deepStrictEqual(p.keep.map(x => x.taskId), [a.id, b.id]);
  assert.deepStrictEqual(p.defer.map(x => x.taskId), [c.id, d.id]);
  assert.ok(p.learned);
  assert.strictEqual(p.reason, 'About 2 h planned · you usually finish 1 h');
});
test('what\'s due today, started or chosen always stays', () => {
  const a = task(), due = task(), started = task({ state: 'doing' }), mine = task(), extra = task();
  const p = proposeDay([dec(a), dec(due, { deadline: 30 }), dec(started), dec(mine, { user_pin: 100 }), dec(extra)],
    { learned: 30, timeLeft: 400, doneToday: 0 });
  assert.deepStrictEqual(p.keep.map(x => x.taskId), [a.id, due.id, started.id, mine.id]);
  assert.deepStrictEqual(p.defer.map(x => x.taskId), [extra.id]);
});
test('your real pace counts: three 30 min guesses that take you 60 each', () => {
  const p = proposeDay([dec(task(), {}, 60), dec(task(), {}, 60), dec(task(), {}, 60)], { learned: null, timeLeft: 120, doneToday: 0 });
  assert.strictEqual(p.defer.length, 1);
  assert.ok(!p.learned);
  assert.strictEqual(p.reason, 'About 3 h planned · 2 h left today');
});
test('what you already did today comes off what the day holds', () => {
  const p = proposeDay([dec(task()), dec(task()), dec(task())], { learned: 90, timeLeft: 400, doneToday: 60 });
  assert.strictEqual(p.keep.length, 1);
});
test('fewer than three things, or the day is over: nothing to make smaller', () => {
  assert.strictEqual(proposeDay([dec(task({ est_minutes: 500 })), dec(task())], { learned: 10, timeLeft: 100, doneToday: 0 }), null);
  assert.strictEqual(proposeDay([dec(task()), dec(task()), dec(task())], { learned: 10, timeLeft: 0, doneToday: 0 }), null);
});
test('hours and minutes, in plain words', () => {
  assert.strictEqual(hm(45), '45 min');
  assert.strictEqual(hm(90), '1 h 30');
  assert.strictEqual(hm(120), '2 h');
});

console.log('\ninterventions');
const ctx = over => ({ profile: null, tasks: [], now: null, dayEndMin: 21 * 60, doneToday: 0, nowMs: NOW, moveIds: [], decisions: [], day: null, ...over });
test('a smaller day is offered as reduce_day, with what stays and what goes', () => {
  const a = task(), b = task(), c = task();
  const day = { keep: [dec(a)], defer: [dec(b), dec(c)], planned: 90, capacity: 30, learned: true, reason: 'About 1 h 30 planned · you usually finish 30 min' };
  const s = interventionsFrom(ctx({ tasks: [a, b, c], day })).find(x => x.kind === 'reduce_day');
  assert.ok(s);
  assert.strictEqual(s.type, 'reduce_day');
  assert.deepStrictEqual(s.action.keep, [a.id]);
  assert.deepStrictEqual(s.action.defer, [b.id, c.id]);
  assert.ok(!/[–—]/.test(s.text));
});
test('every intervention has a type', () => {
  const tasks = [task({ title: 'work on the thesis', state: 'inbox' }), task({ snooze_count: 4, state: 'inbox' })];
  const all = interventionsFrom(ctx({ tasks }));
  assert.ok(all.length > 0);
  for (const s of all) assert.ok(s.type, s.kind);
});
test('a batch\'s Yes starts on its first task', () => {
  const small = [1, 2, 3].map(() => task({ est_minutes: 5, label: 'money', state: 'inbox' }));
  const b = interventionsFrom(ctx({ tasks: small })).find(x => x.kind === 'batch');
  assert.ok(b, 'batch offered');
  assert.strictEqual(b.taskId, b.taskIds[0]);
  assert.strictEqual(b.action.type, 'focus');
});
test('types by what Yes changes', () => {
  assert.strictEqual(typeOf({ kind: 'best_time', action: { type: 'schedule' } }), 'reschedule');
  assert.strictEqual(typeOf({ kind: 'best_time', action: { type: 'focus' } }), 'next_action');
  assert.strictEqual(typeOf({ kind: 'shrink' }), 'resize_task');
  assert.strictEqual(typeOf({ kind: 'model', action: { type: 'plan' } }), 'replan_project');
});
test('names, short', () => {
  assert.strictEqual(names(['A', 'B']), '“A” and “B”');
  assert.strictEqual(names(['A', 'B', 'C', 'D', 'E']), '“A”, “B” and 3 more');
});

console.log('\nliving plans');
const step = over => ({ id: `s${n++}`, project_id: 'p', position: 0, title: 'x', first_action: null, why: null, est_minutes: 10,
  state: 'todo', edited: 0, task_id: null, created_at: 0, updated_at: 0, completed_at: null, depends_on: null, optional: 0, ...over });
test('the next move is one whose steps before it are done', () => {
  const a = step(), b = step({ depends_on: null }), c = step();
  c.depends_on = JSON.stringify([a.id]);
  const done = { ...a, state: 'done' };
  // waiting on a step that's gone (let go) doesn't hold it up
  const orphan = step({ depends_on: JSON.stringify(['gone']) });
  assert.strictEqual(nextReady([orphan, b]).id, orphan.id);
  assert.strictEqual(nextReady([done, c]).id, c.id);
});
test('a step waiting on one that isn\'t done waits', () => {
  const a = step(), c = step();
  c.depends_on = JSON.stringify([a.id]);
  const d = step();
  assert.strictEqual(nextReady([{ ...a, state: 'current' }, c, d]).id, d.id);
});
test('optional steps come last', () => {
  const opt = step({ optional: 1 }), real = step();
  assert.strictEqual(nextReady([opt, real]).id, real.id);
});
test('the planner\'s "after" only points back, never forward or at itself', () => {
  const p = readPlan({ title: 'T', steps: [
    { title: 'One', after: [0, 1] }, { title: 'Two', after: [0, 2] }, { title: 'Three', after: [1, 0, 1], optional: true },
  ], current: 0 }, 'goal');
  assert.deepStrictEqual(p.steps.map(s => s.after), [[], [0], [1, 0]]);
  assert.strictEqual(p.steps[2].optional, true);
});
test('a replan keeps what waits on what, by position in the new path', () => {
  const res = { steps: [{ ref: null, title: 'A', after: [], optional: false }, { ref: null, title: 'B', after: [0], optional: false }], current: 0 };
  const { drafts } = mergePath([], res);
  assert.deepStrictEqual(drafts.map(d => d.after), [[], [0]]);
});

console.log(`\n${passed} passed`);
