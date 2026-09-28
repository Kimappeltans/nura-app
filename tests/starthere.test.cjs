/**
 * Start here on Home (src/startHere.ts): which step is current, when the
 * block shows, when it leaves for good, and that someone who was here before
 * never sees it.
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
const { startHere, START_KEYS } = load('src/startHere.ts');

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

const NOW = new Date(2026, 8, 28, 10, 0).getTime();
const HOUR = 3_600_000;
const SINCE = NOW - 2 * HOUR;
const facts = over => ({
  now: NOW, since: SINCE, off: false, crossed: [], tasks: 0, firstDone: null, firstSession: null, lastShown: null, ...over,
});

console.log('someone new');
test('a brand new Home shows it, on step 1', () => {
  const s = startHere(facts({ since: null }));
  assert.strictEqual(s.show, true);
  assert.strictEqual(s.current, 1);
  assert.deepStrictEqual(s.done, [false, false, false]);
});
test('the first time it shows, it says when (start.since)', () => {
  assert.strictEqual(startHere(facts({ since: null })).begin, NOW);
  assert.strictEqual(startHere(facts()).begin, null);
});
test('a task down crosses off step 1, and step 2 is next', () => {
  const s = startHere(facts({ tasks: 3 }));
  assert.deepStrictEqual(s.done, [true, false, false]);
  assert.strictEqual(s.current, 2);
  assert.deepStrictEqual(s.newly, [1]);
});
test('tasks from onboarding count: step 1 is already done', () => {
  const s = startHere(facts({ since: null, tasks: 2 }));
  assert.strictEqual(s.show, true);
  assert.strictEqual(s.current, 2);
});
test('Ra showing a task crosses off step 2, and Begin is next', () => {
  const s = startHere(facts({ tasks: 1, lastShown: NOW - HOUR }));
  assert.deepStrictEqual(s.done, [true, true, false]);
  assert.strictEqual(s.current, 3);
  assert.deepStrictEqual(s.newly, [1, 2]);
});
test('Ra showing something before Start here was offered doesn\'t count', () => {
  const s = startHere(facts({ tasks: 1, lastShown: SINCE - HOUR }));
  assert.strictEqual(s.current, 2);
});
test('a first session finishes it, for good', () => {
  const s = startHere(facts({ tasks: 1, lastShown: NOW - HOUR, firstSession: NOW - 60_000 }));
  assert.strictEqual(s.show, false);
  assert.strictEqual(s.retire, 'finished');
});
test('beginning straight away, without step 2, finishes it too', () => {
  const s = startHere(facts({ tasks: 1, firstSession: NOW - 60_000 }));
  assert.strictEqual(s.show, false);
  assert.strictEqual(s.retire, 'finished');
});
test('something finished after it showed is progress, not a returning person', () => {
  const s = startHere(facts({ tasks: 0, firstDone: NOW - HOUR }));
  assert.strictEqual(s.show, true);
  assert.strictEqual(s.done[0], true);
});

console.log('no step comes back');
test('a crossed step stays crossed when the tasks are gone', () => {
  const s = startHere(facts({ tasks: 0, crossed: [1] }));
  assert.strictEqual(s.done[0], true);
  assert.strictEqual(s.current, 2);
  assert.deepStrictEqual(s.newly, []);
});
test('step 2 crossed off before stays crossed', () => {
  const s = startHere(facts({ tasks: 1, crossed: [1, 2] }));
  assert.strictEqual(s.current, 3);
});
test('a crossed step 3 means it is gone', () => {
  assert.strictEqual(startHere(facts({ crossed: [3] })).show, false);
});

console.log('gone for good');
test('skipped, finished or retired: never again', () => {
  const s = startHere(facts({ off: true, tasks: 0 }));
  assert.strictEqual(s.show, false);
  assert.strictEqual(s.retire, null);
});
test('someone with a done task from before never sees it', () => {
  const s = startHere(facts({ since: null, tasks: 4, firstDone: NOW - 30 * 24 * HOUR }));
  assert.strictEqual(s.show, false);
  assert.strictEqual(s.retire, 'returning');
});
test('someone with a session from before never sees it', () => {
  const s = startHere(facts({ since: null, tasks: 4, firstSession: NOW - 24 * HOUR }));
  assert.strictEqual(s.show, false);
  assert.strictEqual(s.retire, 'returning');
});
test('done tasks that arrive by sync after it first showed retire it', () => {
  const s = startHere(facts({ tasks: 9, firstDone: SINCE - 10 * 24 * HOUR }));
  assert.strictEqual(s.show, false);
  assert.strictEqual(s.retire, 'returning');
});
test('its flags live under start.*', () => {
  assert.strictEqual(START_KEYS.since, 'start.since');
  assert.strictEqual(START_KEYS.off, 'start.off');
  assert.strictEqual(START_KEYS.step(2), 'start.2');
});

console.log(`\n${passed} passed`);
