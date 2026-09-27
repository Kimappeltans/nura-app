/**
 * The planner's rules, checked without the app: how a replan is merged into
 * the path you have (your edits and done steps are never changed), and how
 * the server's answers are read (a bad shape is an error, not half a plan).
 *
 *   npm test
 *
 * src/planner.ts and src/ai.ts are compiled on the fly with the project's
 * own TypeScript; their other imports (Supabase, the database, projects) are
 * stubbed, and the network is a function the tests set.
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

global.__DEV__ = false;
const flags = new Map([['ai.ok', '1'], ['lang', 'en']]);   // English whatever this machine's locale
let session = { access_token: 'x' };
let invoke = async () => { throw new Error('no network in tests'); };
const supabase = {
  functions: { invoke: (...a) => invoke(...a) },
  auth: { getSession: async () => ({ data: { session } }) },
};
const db = { getFlag: async (k) => (flags.has(k) ? flags.get(k) : null), setFlag: async (k, v) => { flags.set(k, v); } };
const ai = load('ai.ts', { './supabase': { supabase }, './db': db });
const { mergePath, readReplan, readStart, readPlan, start, plannerError, SIGN_IN_AGAIN, NEEDS_OK, NOT_OPEN } = load('planner.ts', {
  './supabase': { supabase }, './db': db, './ai': ai, './projects': {},
});

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const section = (name) => tests.push([name, null]);

const step = (id, title, state, edited = 0) => ({
  id, project_id: 'p', position: 0, title, first_action: null, why: null, est_minutes: 5,
  state, edited, task_id: null, created_at: 0, updated_at: 0, completed_at: null,
});
const local = [step('a', 'Done thing', 'done'), step('b', 'Current move', 'current'), step('c', 'My own step', 'todo', 1), step('d', 'Nu later step', 'todo')];
const move = (ref, title) => ({ ref, title, first_action: null, why: null, est_minutes: 5 });

section('mergePath');
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

section('reading answers');
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
test('no dashes reach the screen: steps, whys, questions, options, reply', () => {
  const s = readStart({ kind: 'project', title: 'Site — v2', reply: 'Let’s start small — one piece.', question: '', options: [], done_means: 'Live – and shared', assumptions: ['You have 2–3 hours'],
    steps: [{ ref: '', title: 'Open the draft—then skim it', first_action: 'Open it — now.', why: 'It takes 5–10 minutes', est_minutes: 5 }], current: 0 }, 'g');
  assert.strictEqual(s.title, 'Site, v2');
  assert.strictEqual(s.reply, 'Let’s start small, one piece.');
  assert.strictEqual(s.plan.done_means, 'Live, and shared');
  assert.deepStrictEqual(s.plan.assumptions, ['You have 2 to 3 hours']);
  assert.strictEqual(s.plan.steps[0].title, 'Open the draft, then skim it');
  assert.strictEqual(s.plan.steps[0].first_action, 'Open it, now.');
  assert.strictEqual(s.plan.steps[0].why, 'It takes 5 to 10 minutes');
  const q = readReplan({ reply: 'r', steps: [], current: -1, question: 'What’s missing — a file?', options: ['A file — or two', 'Time'], maybe_done: false });
  assert.strictEqual(q.question.text, 'What’s missing, a file?');
  assert.deepStrictEqual(q.question.options, ['A file, or two', 'Time']);
});

section('calling the planner');
test('each status says something different, in plain words', () => {
  assert.strictEqual(plannerError(401).message, SIGN_IN_AGAIN);
  assert.strictEqual(plannerError(401).kind, 'auth');
  assert.strictEqual(plannerError(429).message, 'That’s all the planning for today. Try again tomorrow.');
  assert.strictEqual(plannerError(400).message, 'Nu couldn’t use that. Try it in fewer words.');
  assert.strictEqual(plannerError(422).kind, 'bad');
  assert.strictEqual(plannerError(503).kind, 'busy');
  assert.strictEqual(plannerError(undefined).kind, 'offline');
  // a 400 is not "check your connection"
  assert.notStrictEqual(plannerError(400).message, plannerError(undefined).message);
  for (const s of [400, 401, 403, 413, 422, 429, 500, 503, 504, undefined]) assert.ok(!/[\u2013\u2014]/.test(plannerError(s).message));
});
test('without a yes to AI help, nothing is sent', async () => {
  let calls = 0;
  invoke = async () => { calls++; return { data: null, error: null }; };
  flags.set('ai.ok', '0');
  await assert.rejects(start('Finish my website'), e => e.kind === 'consent' && e.message === NEEDS_OK);
  flags.delete('ai.ok');
  await assert.rejects(start('Finish my website'), e => e.kind === 'consent');
  assert.strictEqual(calls, 0);
  flags.set('ai.ok', '1');
});
test('signed out, nothing is sent and it says to sign in again', async () => {
  let calls = 0;
  invoke = async () => { calls++; return { data: null, error: null }; };
  session = null;
  await assert.rejects(start('Finish my website'), e => e.kind === 'auth' && e.message === SIGN_IN_AGAIN);
  assert.strictEqual(calls, 0);
  session = { access_token: 'x' };
});
test('a 403 (ai_access) says AI help isn’t open yet, and to write the first move', async () => {
  assert.strictEqual(plannerError(403).kind, 'access');
  assert.strictEqual(plannerError(403).message, 'AI help isn’t open yet. You can write the first move yourself.');
  invoke = async () => ({ data: null, error: { context: { status: 403 } } });
  await assert.rejects(start('Finish my website'), e => e.kind === 'access' && e.message === NOT_OPEN);
});
test('a 401 from the function is "sign in again"; a 400 is not the connection', async () => {
  invoke = async () => ({ data: null, error: { context: { status: 401 } } });
  await assert.rejects(start('Finish my website'), e => e.kind === 'auth');
  invoke = async () => ({ data: null, error: { context: { status: 400 } } });
  await assert.rejects(start('Finish my website'), e => e.kind === 'bad' && /fewer words/.test(e.message));
  invoke = async () => ({ data: null, error: { context: {} } });
  await assert.rejects(start('Finish my website'), e => e.kind === 'offline');
});
test('signed in with a yes, the goal and language go to nura-plan', async () => {
  let sent;
  invoke = async (name, opts) => { sent = { name, ...opts }; return { data: { kind: 'task', title: 'Call Sam', reply: '' }, error: null }; };
  const r = await start('call Sam');
  assert.strictEqual(r.kind, 'task');
  assert.strictEqual(sent.name, 'nura-plan');
  assert.deepStrictEqual(sent.body, { action: 'start', goal: 'call Sam', language: 'English' });
});

(async () => {
  for (const [name, fn] of tests) {
    if (!fn) { console.log(name); continue; }
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  }
  console.log(`\n${passed} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
