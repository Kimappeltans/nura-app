/**
 * The marks on the day's arc (src/arcMarks.ts): where each thing sits, the
 * next move pinned at now, and marks that would overlap merged into one
 * with a count.
 *
 *   npm test
 */
const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '../src/arcMarks.ts'), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', js)(() => ({}), mod, mod.exports);
const { arcMarks, along, markSaid, MERGE_PX } = mod.exports;

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

// a day from 7:00 to 21:00, and it is 14:00
const at = (h, m = 0) => new Date(2026, 8, 28, h, m).getTime();
const day = over => ({ now: at(14), dayStartMin: 7 * 60, dayEndMin: 21 * 60, done: [], ahead: [], events: [], next: null, ...over });
const W = 1000;   // a thousand px across, so 1 hour is about 71 px
const kinds = ms => ms.map(m => m.kind);

console.log('where things sit');
test('the day runs from 0 at its start to 1 at its end', () => {
  assert.strictEqual(along(at(7), 420, 1260), 0);
  assert.strictEqual(along(at(14), 420, 1260), 0.5);
  assert.strictEqual(along(at(21), 420, 1260), 1);
});
test('a day that ends after midnight keeps 1 AM in it', () => {
  const p = along(new Date(2026, 8, 29, 1, 0).getTime(), 9 * 60, 26 * 60);
  assert.ok(p > 0.9 && p < 1);
});
test('an empty day has no marks', () => assert.deepStrictEqual(arcMarks(day(), W), []));
test('done, to come and the calendar, left to right', () => {
  const ms = arcMarks(day({
    done: [{ id: 'a', title: 'Pay rent', at: at(9) }],
    ahead: [{ id: 'b', title: 'Dentist', at: at(16) }],
    events: [{ title: 'Team call', at: at(11) }],
  }), W);
  assert.deepStrictEqual(kinds(ms), ['done', 'event', 'ahead']);
  assert.deepStrictEqual(ms.map(m => m.title), ['Pay rent', 'Team call', 'Dentist']);
});
test('outside the day, or a set time that has gone by, is left out', () => {
  const ms = arcMarks(day({
    done: [{ title: 'Early', at: at(5) }],
    ahead: [{ id: 'x', title: 'Gone by', at: at(10) }, { id: 'y', title: 'Late', at: at(22) }],
  }), W);
  assert.deepStrictEqual(ms, []);
});

console.log('\nthe next move');
test('with no time, it is pinned at now', () => {
  const [m] = arcMarks(day({ next: { id: 'n', title: 'Send the proposal', at: null } }), W);
  assert.strictEqual(m.kind, 'next');
  assert.strictEqual(m.p, 0.5);
});
test('with a time, it is still at now, and not also at its time', () => {
  const ms = arcMarks(day({
    ahead: [{ id: 'n', title: 'Send the proposal', at: at(17) }],
    next: { id: 'n', title: 'Send the proposal', at: at(17) },
  }), W);
  assert.deepStrictEqual(kinds(ms), ['next']);
  assert.strictEqual(ms[0].p, 0.5);
  assert.strictEqual(ms[0].at, at(17));
});
test('it comes last, so it is drawn on top', () => {
  const ms = arcMarks(day({ ahead: [{ id: 'b', title: 'Dentist', at: at(16) }], next: { id: 'n', title: 'Now', at: null } }), W);
  assert.deepStrictEqual(kinds(ms), ['ahead', 'next']);
});
test('before the day starts it waits at the start; after it ends there is none', () => {
  assert.strictEqual(arcMarks(day({ now: at(6), next: { id: 'n', title: 'x', at: null } }), W)[0].p, 0);
  assert.deepStrictEqual(arcMarks(day({ now: at(22), next: { id: 'n', title: 'x', at: null } }), W), []);
});

console.log('\nmarks that would overlap');
test('three finished within the hour become one, with a count', () => {
  const ms = arcMarks(day({ done: [{ title: 'a', at: at(12, 0) }, { title: 'b', at: at(12, 10) }, { title: 'c', at: at(12, 20) }] }), W);
  assert.strictEqual(ms.length, 1);
  assert.strictEqual(ms[0].kind, 'many');
  assert.strictEqual(ms[0].count, 3);
  assert.deepStrictEqual(ms[0].of, { done: 3, ahead: 0, event: 0 });
  assert.strictEqual(ms[0].from, at(12, 0));
  assert.strictEqual(ms[0].to, at(12, 20));
});
test('further apart than the gap, they stay apart', () => {
  const ms = arcMarks(day({ done: [{ title: 'a', at: at(9) }, { title: 'b', at: at(10) }] }), W);
  assert.deepStrictEqual(kinds(ms), ['done', 'done']);
});
test('it goes by the arc’s width: what is apart on a desktop merges on a phone', () => {
  const things = { done: [{ title: 'a', at: at(9) }, { title: 'b', at: at(10) }] };
  assert.strictEqual(arcMarks(day(things), 1000).length, 2);
  assert.strictEqual(arcMarks(day(things), 270).length, 1);
});
test('a chain merges as one: each within the gap of the one before', () => {
  const ms = arcMarks(day({ done: [0, 15, 30, 45].map(m => ({ title: 't', at: at(12, m) })) }), W);
  assert.strictEqual(ms.length, 1);
  assert.strictEqual(ms[0].count, 4);
});
test('kinds merge together, and say what they were', () => {
  const [m] = arcMarks(day({ done: [{ title: 'a', at: at(15) }], ahead: [{ id: 'b', title: 'b', at: at(15, 10) }], events: [{ title: 'c', at: at(15, 5) }] }), W);
  assert.deepStrictEqual(m.of, { done: 1, ahead: 1, event: 1 });
});
test('the next move is never merged away', () => {
  const ms = arcMarks(day({ done: [{ title: 'a', at: at(13, 55) }, { title: 'b', at: at(14) }], next: { id: 'n', title: 'Now', at: null } }), W);
  assert.deepStrictEqual(kinds(ms), ['many', 'next']);
});
test('the gap is 20 px', () => assert.strictEqual(MERGE_PX, 20));

console.log('\nin words');
test('each kind says what it is, and nothing says late', () => {
  const said = arcMarks(day({
    done: [{ title: 'Pay rent', at: at(9) }], ahead: [{ id: 'b', title: 'Dentist', at: at(16) }],
    events: [{ title: 'Team call', at: at(11) }], next: { id: 'n', title: 'Send the proposal', at: at(17) },
  }), W).map(markSaid);
  assert.ok(said[0].startsWith('Pay rent, done '));
  assert.ok(said[1].startsWith('Team call, ') && said[1].endsWith('on your calendar'));
  assert.ok(said[2].startsWith('Dentist, '));
  assert.ok(said[3].startsWith('Next move: Send the proposal, '));
  for (const s of said) assert.ok(!/late|overdue|—|–/i.test(s), s);
});
test('a merged mark says how many, of what, and when', () => {
  const [m] = arcMarks(day({ done: [{ title: 'a', at: at(12) }, { title: 'b', at: at(12, 10) }] }), W);
  assert.ok(/^2 done, .+ to .+$/.test(markSaid(m)), markSaid(m));
});

console.log(`\n${passed} passed`);
