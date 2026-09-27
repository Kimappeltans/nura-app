/**
 * Understand (src/understand.ts), checked without the app: the filler comes
 * off, goals read as projects, small things as tasks, a hedge with no verb
 * as unclear, and confidence decides when the model is asked.
 *
 *   npm test
 *
 * understand.ts, coach.ts and assistant.ts are compiled on the fly with the
 * project's own TypeScript; their other imports are stubbed.
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
const assistant = load('assistant.ts', {
  './activities': { guessActivity: () => null, activityById: () => undefined },
  './labels': { guessLabel: () => null },
});
const flags = new Map([['ai.ok', '1']]);
let invoke = async () => { throw new Error('no network in tests'); };
let calls = 0;
const supabase = {
  functions: { invoke: (...a) => { calls++; return invoke(...a); } },
  auth: { getSession: async () => ({ data: { session: { access_token: 'x' } } }) },
};
const db = { getFlag: async (k) => (flags.has(k) ? flags.get(k) : null), setFlag: async (k, v) => { flags.set(k, v); } };
const ai = load('ai.ts', { './supabase': { supabase }, './db': db });
const coach = load('coach.ts', {
  './supabase': { supabase }, './db': db, './ai': ai, './assistant': assistant,
  './planner': { getLanguage: async () => 'en', languageName: () => 'English' },
});
const { understandLocal, understand, stripFiller, SURE, UNSURE } = load('understand.ts', { './coach': coach });

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const section = (name) => tests.push([name, null]);

section('the filler comes off');
test('"hello I want to finish my website"', () => assert.strictEqual(stripFiller('hello I want to finish my website'), 'finish my website'));
test('"Hey Nu, can you help me plan my wedding?"', () => assert.strictEqual(stripFiller('Hey Nu, can you help me plan my wedding'), 'plan my wedding'));
test('"ok so I need to call mum"', () => assert.strictEqual(stripFiller('ok so I need to call mum'), 'call mum'));
test('"I’d like to" with a phone apostrophe', () => assert.strictEqual(stripFiller('I’d like to learn Spanish'), 'learn Spanish'));
test('a plain task is left alone', () => assert.strictEqual(stripFiller('Buy toothpaste tomorrow'), 'Buy toothpaste tomorrow'));

section('what it is');
test('the voice test: a project, titled without the filler', () => {
  const u = understandLocal('hello I want to finish my website');
  assert.strictEqual(u.type, 'project');
  assert.ok(u.needsPlanning);
  assert.strictEqual(u.title, 'Finish my website');
  assert.strictEqual(u.text, 'finish my website');
});
test('"finish my website before I start applying": a project with its purpose', () => {
  const u = understandLocal('Finish my website before I start applying.');
  assert.strictEqual(u.type, 'project');
  assert.strictEqual(u.title, 'Finish my website');
  assert.strictEqual(u.purpose, 'before I start applying');
});
test('"work on the thesis" is still a project', () => assert.strictEqual(understandLocal('work on the thesis').type, 'project'));
test('"buy toothpaste tomorrow": a quick task, sure', () => {
  const u = understandLocal('Buy toothpaste tomorrow');
  assert.strictEqual(u.type, 'quick_task');
  assert.ok(u.confidence >= SURE);
});
test('"call mum" with filler: a sure quick task', () => {
  const u = understandLocal('I need to call mum');
  assert.strictEqual(u.type, 'quick_task');
  assert.ok(u.confidence >= SURE);
});
test('"Sarah about the dentist maybe Thursday": unclear, with one question', () => {
  const u = understandLocal('Sarah about the dentist maybe Thursday');
  assert.strictEqual(u.type, 'unclear');
  assert.ok(u.confidence < UNSURE);
  assert.ok(u.question);
});
test('"tax return due friday": a deadline', () => assert.strictEqual(understandLocal('tax return due friday').type, 'deadline'));
test('"finish the slides": a task, but not sure enough to stand alone', () => {
  const u = understandLocal('finish the slides');
  assert.strictEqual(u.type, 'quick_task');
  assert.ok(u.confidence >= UNSURE && u.confidence < SURE);
});
test('several things in one sentence stay several', () => {
  const u = understandLocal('call the bank, email Sam about Friday');
  assert.ok(u.items && u.items.length === 2);
});

section('who reads it');
test('a sure read never reaches the model', async () => {
  calls = 0;
  const u = await understand('Buy toothpaste tomorrow');
  assert.strictEqual(u.type, 'quick_task');
  assert.strictEqual(calls, 0);
});
test('an unclear read asks you, not the model', async () => {
  calls = 0;
  const u = await understand('Sarah about the dentist maybe Thursday');
  assert.strictEqual(u.type, 'unclear');
  assert.strictEqual(calls, 0);
});
test('an unsure read goes to the model, and its answer decides', async () => {
  calls = 0;
  invoke = async () => ({ data: { kind: 'project', load: 'unknown', items: [], reply: '' }, error: null });
  const u = await understand('finish the slides for the investor pitch next month');
  assert.strictEqual(calls, 1);
  assert.strictEqual(u.type, 'project');
  assert.strictEqual(u.read.source, 'model');
});
test('the model unreachable: the phone’s read stands', async () => {
  invoke = async () => { throw new Error('offline'); };
  const u = await understand('finish my portfolio');
  assert.strictEqual(u.type, 'project');
  assert.strictEqual(u.read.source, 'local');
});
test('AI help off: nothing is sent, the phone’s read stands', async () => {
  flags.set('ai.ok', '0');
  calls = 0;
  const u = await understand('finish the slides');
  assert.strictEqual(calls, 0);
  assert.strictEqual(u.type, 'quick_task');
  flags.set('ai.ok', '1');
});

(async () => {
  for (const [name, fn] of tests) {
    if (!fn) { console.log(`\n${name}`); continue; }
    try { await fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (e) { console.log(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
  }
  console.log(`\n${passed} passed`);
})();
