/**
 * Habits in Your Tasks (src/habits.ts): the count that only rises, ticking
 * today on and off, and the order of the rows (paused ones last, a habit let
 * go not at all).
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
const {
  timesDone, isDoneToday, todayToggle, habitViews, habitValue, habitName, statsFor,
  HABIT_ON, HABIT_PAUSED, HABIT_LET_GO, LOG_TAKEN_BACK,
} = load('src/habits.ts');

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

// a fixed Sunday at 9:30 local time
const NOW = new Date(2026, 8, 27, 9, 30).getTime();
const DAY = 86_400_000;
const at = (daysAgo, h = 8) => { const d = new Date(NOW); d.setDate(d.getDate() - daysAgo); d.setHours(h, 0, 0, 0); return d.getTime(); };
let n = 0;
const log = (daysAgo, over) => ({ id: `l${n++}`, habit_id: 'h1', at: at(daysAgo), did_minimum: 0, updated_at: at(daysAgo), ...over });
const habit = over => ({ id: 'h1', cue: 'I make coffee', action: 'stretch for a minute', minimum: null, created_at: NOW - 30 * DAY, active: HABIT_ON, updated_at: NOW, ...over });

console.log('the count');
test('counts the days it happened', () => {
  assert.strictEqual(timesDone([log(0), log(3), log(10)]), 3);
});
test('twice in one day is one day', () => {
  assert.strictEqual(timesDone([log(1), log(1, { at: at(1, 20) })]), 1);
});
test('a tick taken back doesn\'t count', () => {
  assert.strictEqual(timesDone([log(2), log(0, { did_minimum: LOG_TAKEN_BACK })]), 1);
});
test('the bad-day version counts', () => {
  assert.strictEqual(timesDone([log(0, { did_minimum: 1 })]), 1);
});
test('a missed week takes nothing away', () => {
  const before = [log(20), log(19), log(18)];
  assert.strictEqual(timesDone(before), 3);
  // nothing logged for the last seventeen days: still 3
  assert.strictEqual(habitViews([habit()], before, NOW)[0].times, 3);
});

console.log('today');
test('done today, from today\'s log', () => {
  assert.strictEqual(isDoneToday([log(0)], NOW), true);
  assert.strictEqual(isDoneToday([log(1)], NOW), false);
  assert.strictEqual(isDoneToday([log(0, { did_minimum: LOG_TAKEN_BACK })], NOW), false);
});
test('ticking with nothing today adds a log', () => {
  assert.deepStrictEqual(todayToggle([], NOW), { kind: 'add', done: true });
  assert.deepStrictEqual(todayToggle([log(1)], NOW), { kind: 'add', done: true });
});
test('ticking again takes today back, and marks the row rather than deleting it', () => {
  const l = log(0);
  assert.deepStrictEqual(todayToggle([l], NOW), { kind: 'set', ids: [l.id], to: LOG_TAKEN_BACK, done: false });
});
test('ticking a third time counts today\'s row again, with no new row', () => {
  const l = log(0, { did_minimum: LOG_TAKEN_BACK });
  assert.deepStrictEqual(todayToggle([l], NOW), { kind: 'set', ids: [l.id], to: 0, done: true });
});
test('undo only reaches today: yesterday\'s log stays', () => {
  const y = log(1);
  const step = todayToggle([y], NOW);
  assert.strictEqual(step.kind, 'add');
});
test('the old rates ignore a tick taken back', () => {
  const s = statsFor([log(0, { did_minimum: LOG_TAKEN_BACK })], NOW - 30 * DAY, 14, NOW);
  assert.strictEqual(s.doneToday, false);
  assert.strictEqual(s.loggedDays, 0);
});

console.log('the rows');
test('on first, oldest first; paused at the bottom; let go not listed', () => {
  const hs = [
    habit({ id: 'paused', active: HABIT_PAUSED, created_at: NOW - 40 * DAY }),
    habit({ id: 'newer', created_at: NOW - 2 * DAY }),
    habit({ id: 'gone', active: HABIT_LET_GO }),
    habit({ id: 'older', created_at: NOW - 9 * DAY }),
  ];
  const views = habitViews(hs, [], NOW);
  assert.deepStrictEqual(views.map(v => v.habit.id), ['older', 'newer', 'paused']);
  assert.deepStrictEqual(views.map(v => v.paused), [false, false, true]);
});
test('each row gets its own logs', () => {
  const views = habitViews([habit({ id: 'a' }), habit({ id: 'b', created_at: NOW })],
    [log(0, { habit_id: 'a' }), log(1, { habit_id: 'a' }), log(1, { habit_id: 'b' })], NOW);
  assert.deepStrictEqual(views.map(v => [v.habit.id, v.times, v.doneToday]), [['a', 2, true], ['b', 1, false]]);
});

console.log('the value on the right');
test('a count that only rises, in plain words', () => {
  assert.deepStrictEqual(habitValue({ times: 12, paused: false }), { big: '12', small: 'times' });
  assert.deepStrictEqual(habitValue({ times: 1, paused: false }), { big: '1', small: 'time' });
});
test('never a zero: a new habit says New', () => {
  assert.deepStrictEqual(habitValue({ times: 0, paused: false }), { big: '', small: 'New' });
});
test('a paused habit says Paused, not its count', () => {
  assert.deepStrictEqual(habitValue({ times: 12, paused: true }), { big: '', small: 'Paused' });
});
test('the name is what you do, with a capital', () => {
  assert.strictEqual(habitName({ action: 'stretch for a minute' }), 'Stretch for a minute');
});
test('no dashes in anything it says', () => {
  const said = [habitValue({ times: 3, paused: false }), habitValue({ times: 0, paused: false }), habitValue({ times: 0, paused: true })]
    .map(v => `${v.big} ${v.small}`).join(' ');
  assert.ok(!/[—–]/.test(said));
});

console.log(`\n${passed} passed`);
