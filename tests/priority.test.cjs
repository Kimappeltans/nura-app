/**
 * The fact line on the card in front (src/priority.ts → factLine): what it
 * fits before, when it's due, a high priority — at most two, never "late".
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
const { factLine } = load('src/priority.ts');

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

// a fixed Thursday at 9:30 local time
const NOW = new Date(2026, 8, 24, 9, 30).getTime();
const at = (h, m = 0) => { const d = new Date(NOW); d.setHours(h, m, 0, 0); return d.getTime(); };
const clock = ms => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const task = over => ({ id: 't', title: 'Draft the proposal outline', est_minutes: 25, priority: 0, due_at: null, has_time: 0, ...over });
const DAY_END = 21 * 60;

console.log('factLine');
test('fits before the next thing with a time', () => {
  assert.strictEqual(factLine(task(), [at(11), at(15)], DAY_END, NOW), `Fits before ${clock(at(11))}`);
});
test('with nothing timed, fits before the end of the day', () => {
  assert.strictEqual(factLine(task(), [], DAY_END, NOW), `Fits before ${clock(at(21))}`);
});
test('something tomorrow is not a limit for today', () => {
  const tomorrow6 = at(18) + 86_400_000;
  assert.strictEqual(factLine(task(), [tomorrow6], DAY_END, NOW), `Fits before ${clock(at(21))}`);
});
test('says nothing about fitting when it doesn\'t', () => {
  assert.strictEqual(factLine(task({ est_minutes: 90 }), [at(10)], DAY_END, NOW), null);
});
test('a task\'s own time is not something it has to fit before', () => {
  const own = at(10);
  assert.strictEqual(factLine(task({ due_at: own, has_time: 1 }), [own, at(12)], DAY_END, NOW),
    `Fits before ${clock(at(12))} · Due at ${clock(own)}`);
});
test('due today, without a time', () => {
  assert.strictEqual(factLine(task({ est_minutes: null, due_at: at(0) }), [], DAY_END, NOW), 'Due today');
});
test('never late: a time that has passed says nothing', () => {
  assert.strictEqual(factLine(task({ est_minutes: null, due_at: at(8), has_time: 1 }), [], DAY_END, NOW), null);
});
test('high priority, and never more than two facts', () => {
  const line = factLine(task({ priority: 3, due_at: at(0) }), [at(11)], DAY_END, NOW);
  assert.strictEqual(line, `Fits before ${clock(at(11))} · Due today`);
  assert.strictEqual(factLine(task({ priority: 3 }), [], DAY_END, NOW), `Fits before ${clock(at(21))} · High priority`);
});

console.log(`\n${passed} passed`);
