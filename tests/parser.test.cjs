/**
 * How Nu reads one sentence (src/assistant.ts → parseTaskAt): dates that are
 * dates and not words that start like months, "in 2 hours" as a moment, a
 * repeat that starts at its next real occurrence, and titles that keep their
 * small words.
 *
 *   npm test
 *
 * Activities and labels are stubbed; the clock is pinned.
 */
const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function load(file, stubs) {
  const src = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', js)((name) => {
    if (!(name in stubs)) throw new Error(`unexpected import ${name} in ${file}`);
    return stubs[name];
  }, mod, mod.exports);
  return mod.exports;
}
const { parseTaskAt, parseTask } = load('assistant.ts', {
  './activities': { guessActivity: () => null, activityById: () => undefined },
  './labels': { guessLabel: () => null },
});

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

// a fixed Saturday, 26 September 2026, at 11:00 local time
const NOW = new Date(2026, 8, 26, 11, 0);
const read = s => parseTaskAt(s, NOW);
const on = (y, mo, d, h = 9, m = 0) => new Date(y, mo, d, h, m).getTime();
const is = (s, want) => {
  const d = read(s);
  for (const [k, v] of Object.entries(want)) assert.deepStrictEqual(d[k], v, `${s}: ${k}`);
};

console.log('words that start like months');
test('"Mark 3 essays" is a task, not the 3rd of March', () => is('Mark 3 essays', { title: 'Mark 3 essays', due_at: null }));
test('"email 2 mayors" is not the 2nd of May', () => is('email 2 mayors', { title: 'Email 2 mayors', due_at: null }));
test('"print 4 marketing flyers" keeps every word', () => is('print 4 marketing flyers', { title: 'Print 4 marketing flyers', due_at: null }));
test('"buy 10 decks of cards" is not the 10th of December', () => is('buy 10 decks of cards', { title: 'Buy 10 decks of cards', due_at: null }));
test('"Call Janet 5 times" is not the 5th of January', () => is('Call Janet 5 times', { title: 'Call Janet 5 times', due_at: null }));
test('"may" on its own stays a verb', () => is('may i borrow the car', { title: 'May i borrow the car', due_at: null }));

console.log('\nmonths that are months');
test('"3 march", "march 3", "mar 3rd", "3rd of march"', () => {
  for (const s of ['dentist 3 march', 'dentist march 3', 'dentist mar 3rd', 'dentist 3rd of march']) {
    is(s, { title: 'Dentist', due_at: on(2027, 2, 3), has_time: false });
  }
});
test('"sept 30" and "30 sep" are this year, still to come', () => {
  is('vote sept 30', { title: 'Vote', due_at: on(2026, 8, 30) });
  is('vote 30 sep', { title: 'Vote', due_at: on(2026, 8, 30) });
});
test('"may 3" next to a day number is May', () => is('may 3 dentist', { title: 'Dentist', due_at: on(2027, 4, 3) }));
test('today\'s date named with a time that has passed stays today, not next year', () => {
  is('dentist 26 sep at 8am', { due_at: on(2026, 8, 26, 8), has_time: true });
});
test('the 30th of February is its last day', () => is('taxes feb 30', { title: 'Taxes', due_at: on(2027, 1, 28) }));

console.log('\nin a while');
test('"in 2 hours" is two hours from now, with a time', () => is('call mom in 2 hours', { title: 'Call mom', due_at: on(2026, 8, 26, 13), has_time: true }));
test('"in 30 minutes" and "in 90 min"', () => {
  is('stretch in 30 minutes', { title: 'Stretch', due_at: on(2026, 8, 26, 11, 30), has_time: true, est_minutes: null });
  is('walk in 90 min', { title: 'Walk', due_at: on(2026, 8, 26, 12, 30), has_time: true, est_minutes: null });
});
test('"in 3 days" stays a day', () => is('renew passport in 3 days', { title: 'Renew passport', due_at: on(2026, 8, 29), has_time: false }));

console.log('\nrepeats start at the next real one');
test('every weekday at 9:30, typed on a Saturday, starts Monday', () => {
  is('every weekday standup at 9:30', { title: 'Standup', repeat_rule: 'weekdays', due_at: on(2026, 8, 28, 9, 30), has_time: true });
});
test('"every weekday" is weekdays, not every day', () => is('every weekday standup', { repeat_rule: 'weekdays', repeat_days: null }));
test('tuesday and thursday at 7 starts Tuesday', () => {
  is('gym tuesday and thursday at 7', { title: 'Gym', repeat_rule: 'weekly', repeat_days: '2,4', due_at: on(2026, 8, 29, 7), has_time: true });
});
test('every day at 7, already gone today, starts tomorrow', () => is('every day at 7 meds', { repeat_rule: 'daily', due_at: on(2026, 8, 27, 7) }));
test('every day at 5pm starts today', () => is('every day at 5pm walk', { repeat_rule: 'daily', due_at: on(2026, 8, 26, 17) }));
test('every monday at 8 starts Monday', () => is('gym every monday at 8', { repeat_rule: 'weekly', repeat_days: '1', due_at: on(2026, 8, 28, 8) }));

console.log('\ntimes');
test('"tomorrow at 12pm" is noon', () => is('lunch tomorrow at 12pm', { title: 'Lunch', due_at: on(2026, 8, 27, 12), has_time: true }));
test('"at 12am" is the coming midnight', () => is('take pills at 12am', { title: 'Take pills', due_at: on(2026, 8, 27, 0), has_time: true }));
test('"at 5pm" later today is today', () => is('write a note at 5pm', { title: 'Write a note', due_at: on(2026, 8, 26, 17) }));
test('"at 7" already gone today means tomorrow', () => is('call bank at 7', { title: 'Call bank', due_at: on(2026, 8, 27, 7) }));
test('"tonight" is this evening', () => is('call dad tonight', { title: 'Call dad', due_at: on(2026, 8, 26, 19), has_time: true }));
test('"tonight at 9" is 21:00', () => is('call dad tonight at 9', { due_at: on(2026, 8, 26, 21) }));
test('"today at 8am" stays today', () => is('dentist today at 8am', { due_at: on(2026, 8, 26, 8) }));

console.log('\ndays of the month');
test('"the 31st" in a 30-day month is its last day', () => is('pay rent on the 31st', { title: 'Pay rent', due_at: on(2026, 8, 30) }));
test('a day that has passed this month is next month', () => is('meet at the cafe on the 3rd', { title: 'Meet at the cafe', due_at: on(2026, 9, 3) }));
test('a bare weekday is the next one', () => is('book the dentist on friday', { title: 'Book the dentist', due_at: on(2026, 9, 2) }));

console.log('\neverything else, unchanged');
test('"urgent" is high priority, and its colon goes', () => is('urgent: fix the bug', { title: 'Fix the bug', priority: 3 }));
test('"45 min" is how long', () => is('read chapter 45 min', { title: 'Read chapter', est_minutes: 45, due_at: null }));
test('"the", "a", "on", "at" stay unless they led a date', () => {
  is('put the book on a shelf', { title: 'Put the book on a shelf', due_at: null });
  is('look at the stars at 10pm', { title: 'Look at the stars', due_at: on(2026, 8, 26, 22) });
});
test('parseTask with one argument reads against the real clock', () => {
  const d = parseTask('call mom in 2 hours');
  assert.ok(Math.abs(d.due_at - (Date.now() + 2 * 3600_000)) < 120_000);
  // a list mapped straight through parseTask gets an index, not a clock
  const [a] = ['call mom in 2 hours'].map(parseTask);
  assert.ok(a.due_at > Date.now());
});

console.log(`\n${passed} passed`);
