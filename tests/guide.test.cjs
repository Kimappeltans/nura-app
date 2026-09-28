/**
 * The guide on Home, phone and desktop (src/guide.ts): which step is at full
 * size, how each ticks itself off, when it leaves for good, that someone
 * who was here before (or put an old guide away) never sees it, that it
 * rests at night, and that `?guide=again` counts only from then on.
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
const { guide, GUIDE_KEYS, SAY, BIG } = load('src/guide.ts');

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

const NOW = new Date(2026, 8, 28, 10, 0).getTime();
const HOUR = 3_600_000;
const SINCE = NOW - 2 * HOUR;
const facts = over => ({
  now: NOW, since: SINCE, off: false, again: false, old: { off: false, since: null }, crossed: [], night: false,
  tasks: 0, lastTask: null, firstDone: null, firstSession: null, lastSession: null, lastProject: null, lastChange: null,
  ...over,
});
const session = at => ({ firstSession: at, lastSession: at });

console.log('someone new');
test('a brand new Home shows it, on step 1, 0 of 5', () => {
  const g = guide(facts({ since: null }));
  assert.strictEqual(g.show, true);
  assert.strictEqual(g.current, 1);
  assert.strictEqual(g.count, 0);
  assert.deepStrictEqual(g.done, [false, false, false, false, false]);
});
test('the first time it is offered, it says when (guide2.since)', () => {
  assert.strictEqual(guide(facts({ since: null })).begin, NOW);
  assert.strictEqual(guide(facts()).begin, null);
});
test('a task of their own ticks step 1, and step 2 is at full size', () => {
  const g = guide(facts({ tasks: 3, lastTask: NOW - HOUR }));
  assert.deepStrictEqual(g.done, [true, false, false, false, false]);
  assert.strictEqual(g.current, 2);
  assert.strictEqual(g.count, 1);
  assert.deepStrictEqual(g.newly, [1]);
});
test('tasks from onboarding count: step 1 is already done', () => {
  const g = guide(facts({ since: null, tasks: 2, lastTask: NOW - 60_000 }));
  assert.strictEqual(g.show, true);
  assert.strictEqual(g.current, 2);
});
test('a first session ticks step 2 (it no longer ends the guide)', () => {
  const g = guide(facts({ tasks: 1, ...session(NOW - 60_000) }));
  assert.strictEqual(g.show, true);
  assert.deepStrictEqual(g.done, [true, true, false, false, false]);
  assert.strictEqual(g.current, 3);
});
test('a project ticks step 3', () => {
  const g = guide(facts({ tasks: 2, ...session(NOW - HOUR), lastProject: NOW - 60_000 }));
  assert.strictEqual(g.current, 4);
  assert.strictEqual(g.count, 3);
});
test('Not now or Something changed ticks step 4', () => {
  const g = guide(facts({ tasks: 2, ...session(NOW - HOUR), lastProject: NOW - HOUR, lastChange: NOW - 60_000 }));
  assert.strictEqual(g.current, 5);
});
test('What Nura has learned, opened once, ticks step 5, and the guide leaves for good', () => {
  const g = guide(facts({ tasks: 2, ...session(NOW - HOUR), lastProject: NOW - HOUR, lastChange: NOW - HOUR, crossed: [5] }));
  assert.strictEqual(g.show, false);
  assert.strictEqual(g.retire, 'finished');
  assert.strictEqual(g.count, 5);
});
test('steps done out of order: the first one left is at full size', () => {
  const g = guide(facts({ tasks: 1, lastProject: NOW - HOUR, crossed: [5] }));
  assert.deepStrictEqual(g.done, [true, false, true, false, true]);
  assert.strictEqual(g.current, 2);
  assert.strictEqual(g.count, 3);
});
test('something finished after it was offered is progress, not a returning person', () => {
  const g = guide(facts({ tasks: 1, firstDone: NOW - HOUR }));
  assert.strictEqual(g.show, true);
  assert.strictEqual(g.done[0], true);
});
test('there is no step you mark done: nothing but crossed flags and real facts tick one', () => {
  const g = guide(facts());
  assert.deepStrictEqual(g.done, [false, false, false, false, false]);
});

console.log('no number goes down');
test('a ticked step stays ticked when the tasks are gone', () => {
  const g = guide(facts({ tasks: 0, crossed: [1] }));
  assert.strictEqual(g.done[0], true);
  assert.strictEqual(g.current, 2);
  assert.deepStrictEqual(g.newly, []);
});
test('a ticked project step stays when the project is gone', () => {
  const g = guide(facts({ crossed: [1, 2, 3] }));
  assert.strictEqual(g.current, 4);
  assert.strictEqual(g.count, 3);
});

console.log('not at night');
test('at night it rests, but keeps what was done', () => {
  const g = guide(facts({ night: true, tasks: 1 }));
  assert.strictEqual(g.show, false);
  assert.strictEqual(g.retire, null);
  assert.deepStrictEqual(g.newly, [1]);
});
test('offered first at night, it still starts counting then', () => {
  const g = guide(facts({ since: null, night: true }));
  assert.strictEqual(g.show, false);
  assert.strictEqual(g.begin, NOW);
});
test('a session at night after it was first offered is not a returning person', () => {
  const g = guide(facts({ tasks: 1, ...session(SINCE + HOUR) }));
  assert.strictEqual(g.show, true);
  assert.strictEqual(g.current, 3);
});

console.log('gone for good');
test('hidden, finished or retired: never again', () => {
  const g = guide(facts({ off: true }));
  assert.strictEqual(g.show, false);
  assert.strictEqual(g.retire, null);
});
test('someone with a done task from before never sees it', () => {
  const g = guide(facts({ since: null, tasks: 4, firstDone: NOW - 30 * 24 * HOUR }));
  assert.strictEqual(g.show, false);
  assert.strictEqual(g.retire, 'returning');
});
test('someone with a session from before never sees it', () => {
  const g = guide(facts({ since: null, tasks: 4, ...session(NOW - 24 * HOUR) }));
  assert.strictEqual(g.show, false);
  assert.strictEqual(g.retire, 'returning');
});
test('done tasks that arrive by sync after it was first offered retire it', () => {
  const g = guide(facts({ tasks: 9, firstDone: SINCE - 10 * 24 * HOUR }));
  assert.strictEqual(g.show, false);
  assert.strictEqual(g.retire, 'returning');
});

console.log('the old guides');
test('someone who put Start here or Getting started away never sees this one', () => {
  const g = guide(facts({ since: null, tasks: 2, old: { off: true, since: SINCE } }));
  assert.strictEqual(g.show, false);
  assert.strictEqual(g.retire, 'old');
});
test('someone halfway through Start here carries on here, from when it first showed', () => {
  const started = NOW - 5 * HOUR;
  const g = guide(facts({ since: null, tasks: 2, lastTask: started + HOUR, firstDone: started + 2 * HOUR, old: { off: false, since: started } }));
  assert.strictEqual(g.show, true);
  assert.strictEqual(g.begin, started);
  assert.strictEqual(g.current, 2);
});
test('once this guide has begun, the old flags no longer matter', () => {
  const g = guide(facts({ tasks: 1, old: { off: true, since: null } }));
  assert.strictEqual(g.show, true);
});

console.log('?guide=again');
test('started over: history from before does not retire it', () => {
  const g = guide(facts({ again: true, tasks: 20, lastTask: SINCE - HOUR, firstDone: SINCE - 40 * 24 * HOUR, ...session(SINCE - HOUR), lastProject: SINCE - HOUR, lastChange: SINCE - HOUR, old: { off: true, since: null } }));
  assert.strictEqual(g.show, true);
  assert.strictEqual(g.current, 1);
  assert.strictEqual(g.count, 0);
});
test('started over: only what happens from then on ticks a step', () => {
  const g = guide(facts({ again: true, tasks: 20, lastTask: SINCE + 60_000, firstSession: SINCE - 40 * HOUR, lastSession: SINCE + HOUR, lastProject: SINCE - HOUR }));
  assert.deepStrictEqual(g.done, [true, true, false, false, false]);
  assert.strictEqual(g.current, 3);
});

console.log('what it shows');
test('its flags live under guide2.*', () => {
  assert.strictEqual(GUIDE_KEYS.since, 'guide2.since');
  assert.strictEqual(GUIDE_KEYS.off, 'guide2.off');
  assert.strictEqual(GUIDE_KEYS.again, 'guide2.again');
  assert.strictEqual(GUIDE_KEYS.step(4), 'guide2.4');
});
test('the examples are the two Kim chose, and step 3 is an example path with three moves', () => {
  assert.deepStrictEqual(SAY.map(x => x.words), ['pay rent friday 10 min', 'finish the deck, call the dentist tue 3pm, text Sarah back']);
  assert.strictEqual(BIG.words, 'launch my website');
  assert.strictEqual(BIG.path.length, 3);
});
test('no dashes in anything it says', () => {
  const words = [...SAY.flatMap(x => [x.what, x.words]), BIG.words, ...BIG.path].join(' ');
  assert.ok(!/[–—]/.test(words));
});

console.log(`\n${passed} passed`);
