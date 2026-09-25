/**
 * The planner's rules, checked without the app: how a replan is merged into
 * the path you have (your edits and done steps are never changed), and how
 * the server's answers are read (a bad shape is an error, not half a plan).
 *
 *   npm test
 *
 * src/planner.ts is compiled on the fly with the project's own TypeScript;
 * its imports (Supabase, the database) are stubbed — these tests never call
 * them.
 */
const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '../src/planner.ts'), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
global.__DEV__ = false;
new Function('require', 'module', 'exports', js)(() => ({ supabase: {}, getFlag: async () => null, setFlag: async () => {} }), mod, mod.exports);
const { mergePath, readReplan, readStart, readPlan } = mod.exports;

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

const step = (id, title, state, edited = 0) => ({
  id, project_id: 'p', position: 0, title, first_action: null, why: null, est_minutes: 5,
  state, edited, task_id: null, created_at: 0, updated_at: 0, completed_at: null,
});
const local = [step('a', 'Done thing', 'done'), step('b', 'Current move', 'current'), step('c', 'My own step', 'todo', 1), step('d', 'Nu later step', 'todo')];
const move = (ref, title) => ({ ref, title, first_action: null, why: null, est_minutes: 5 });

console.log('mergePath');
test('a smaller step goes first; your own step comes back even if left out', () => {
  const r = mergePath(local, { steps: [move(null, 'Smaller piece'), move('b', 'Current move reworded')], current: 0 });
  assert.deepStrictEqual(r.drafts.map(d => d.id ?? d.title), ['Smaller piece', 'b', 'c']);
  assert.strictEqual(r.current, 0);
  assert.strictEqual(r.drafts[1].title, 'Current move reworded');   // Nu's own step can be reworded
  assert.strictEqual(r.drafts[2].title, 'My own step');
});
test('your wording is kept, and done steps are never sent back', () => {
  const r = mergePath(local, { steps: [move('a', 'Done again'), move('c', 'REWRITTEN'), move('d', 'Nu later step')], current: 1 });
  assert.deepStrictEqual(r.drafts.map(d => d.id), ['c', 'd']);
  assert.strictEqual(r.drafts[0].title, 'My own step');
  assert.strictEqual(r.current, 0);
});
test('the same step twice keeps the first', () => {
  const r = mergePath(local, { steps: [move('d', 'one'), move('d', 'two')], current: 1 });
  assert.deepStrictEqual(r.drafts.map(d => d.id), ['d', 'c']);
  assert.strictEqual(r.current, null);
});

console.log('reading answers');
test('an unknown shape is an error', () => assert.throws(() => readStart({ kind: 'weird' }, 'g')));
test('a question comes through, with the goal as the title when none is given', () => {
  const s = readStart({ kind: 'project', title: '', reply: 'hi', question: 'What is done?', options: ['a', 'b'], steps: [], current: 0 }, 'Finish my website');
  assert.strictEqual(s.question.text, 'What is done?');
  assert.strictEqual(s.title, 'Finish my website');
});
test('empty fields become null and a bad index becomes the first step', () => {
  const s = readStart({ kind: 'project', title: 'Site', reply: '', question: '', options: [], done_means: 'Live', assumptions: ['x'],
    steps: [{ ref: '', title: 'Open it', first_action: '', why: '', est_minutes: 0 }], current: 7 }, 'g');
  assert.strictEqual(s.plan.current, 0);
  assert.strictEqual(s.plan.steps[0].est_minutes, null);
  assert.strictEqual(s.plan.steps[0].first_action, null);
});
test('a plan with no steps is an error', () => assert.throws(() => readPlan({ steps: [] }, 'g')));
test('a replan can be only a question', () => {
  const q = readReplan({ reply: 'r', steps: [], current: -1, question: 'What is missing?', options: ['a'], maybe_done: false });
  assert.strictEqual(q.current, -1);
  assert.ok(q.question);
});
test('"maybe done" comes through, and a bad index falls back to the first step', () => {
  const q = readReplan({ reply: 'r', steps: [{ ref: 'd', title: 'x', first_action: '', why: '', est_minutes: 5 }], current: 9, question: '', options: [], maybe_done: true });
  assert.strictEqual(q.current, 0);
  assert.strictEqual(q.maybe_done, true);
});
test('a replan with nothing in it is an error', () => assert.throws(() => readReplan({ reply: '', steps: [], current: -1, question: '', options: [] })));

console.log(`\n${passed} passed`);
