/**
 * The coach's rules, checked without the app: the phone's own read (what a
 * sentence is when there's no model), how the server's answers are read (a
 * bad shape is an error, never half an answer), when the phone's read is
 * sure enough that the model isn't asked, how the weekly reflection is
 * queued and collected, and that a failed call falls back instead of failing.
 *
 *   npm test
 *
 * src/coach.ts and src/assistant.ts are compiled on the fly with the
 * project's own TypeScript; their other imports (Supabase, the database,
 * the planner's language helpers, activities, labels) are stubbed.
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

const flags = new Map();
let invoke = async () => { throw new Error('no network in tests'); };
const coach = load('coach.ts', {
  './supabase': { supabase: { functions: { invoke: (...a) => invoke(...a) } } },
  './db': { getFlag: async (k) => (flags.has(k) ? flags.get(k) : null), setFlag: async (k, v) => { flags.set(k, v); } },
  './assistant': assistant,
  './planner': { getLanguage: async () => 'en', languageName: () => 'English' },
});
const { localRead, localIsSure, splitItems, readState, readSuggestions, readNotes, reflectDue, readInput, modelSuggestions, maybeReflect, getNotes } = coach;

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const section = (name) => tests.push([name, null]);

section('the phone’s own read');
test('one task is a task, from the phone', () => {
  const r = localRead('call the dentist tomorrow at 9');
  assert.strictEqual(r.kind, 'task');
  assert.strictEqual(r.load, 'unknown');
  assert.strictEqual(r.source, 'local');
  assert.strictEqual(r.items, undefined);
});
test('several things are split, in your words', () => {
  const r = localRead('Buy milk, call mom and email Sam about Friday');
  assert.strictEqual(r.kind, 'tasks');
  assert.deepStrictEqual(r.items, ['Buy milk', 'call mom', 'email Sam about Friday']);
});
test('one task on several days stays one task', () => {
  assert.deepStrictEqual(splitItems('gym tuesday and thursday at 7'), []);
  assert.strictEqual(localRead('gym tuesday and thursday at 7').kind, 'task');
});
test('a shopping list is one task, and so is "mom and dad"', () => {
  assert.deepStrictEqual(splitItems('buy milk, eggs, bread'), []);
  assert.deepStrictEqual(splitItems('call mom and dad'), []);
});
test('"I need to" and "then" are dropped from the items', () => {
  assert.deepStrictEqual(splitItems('I need to pay rent then book the vet'), ['pay rent', 'book the vet']);
});
test('a vague verb is a project', () => {
  const r = localRead('work on the presentation');
  assert.strictEqual(r.kind, 'project');
  assert.ok(r.reply);
});
test('a feeling is a feeling, with a kind reply', () => {
  const r = localRead('I’m so overwhelmed today');
  assert.strictEqual(r.kind, 'feeling');
  assert.strictEqual(r.load, 'overwhelmed');
  assert.ok(r.reply && !/overdue|should/i.test(r.reply));
});
test('a feeling with something to do in it is the task, and the load comes through', () => {
  const r = localRead('I’m tired but I need to call the bank');
  assert.strictEqual(r.kind, 'task');
  assert.strictEqual(r.load, 'low');
});
test('"write it down" is not a low mood', () => assert.strictEqual(localRead('write down the plan').load, 'unknown'));
test('a question is a question', () => {
  assert.strictEqual(localRead('what should I do now?').kind, 'question');
  assert.strictEqual(localRead('is the shop open on sunday?').kind, 'question');
});
test('no replies in other languages', () => assert.strictEqual(localRead('I’m so overwhelmed', 'nl').reply, undefined));
test('a list typed one per line is a list, however short the lines', () => {
  const r = localRead('milk\neggs\nbread');
  assert.strictEqual(r.kind, 'tasks');
  assert.deepStrictEqual(r.items, ['milk', 'eggs', 'bread']);
});

section('when the phone’s read is enough');
const sure = (t, lang = 'en') => localIsSure(t, localRead(t, lang), lang);
test('one short clear task, a list by lines, a question, a short feeling: sure', () => {
  assert.strictEqual(sure('call the dentist tomorrow at 9'), true);
  assert.strictEqual(sure('buy milk\ncall mom\nemail Sam'), true);
  assert.strictEqual(sure('what should I do now?'), true);
  assert.strictEqual(sure('I’m so overwhelmed'), true);
  assert.strictEqual(sure('buy milk, call mom and email Sam'), true);
  assert.strictEqual(sure(''), true);
});
test('a feeling mixed with things to do: not sure', () =>
  assert.strictEqual(sure('I’m exhausted and I still have to finish the report and call the bank'), false));
test('a long run-on sentence: not sure', () =>
  assert.strictEqual(sure('so tomorrow there is the thing with the landlord about the boiler which I keep meaning to sort before the weekend really'), false));
test('more than one sentence: not sure', () =>
  assert.strictEqual(sure('Finish the slides. Then call Sam about the budget'), false));
test('a list whose lines are sentences, or carry a feeling: not sure', () => {
  assert.strictEqual(sure('pay rent\nI’m so tired of the flat. Maybe move?'), false);
  assert.strictEqual(sure('pay rent\nfeeling overwhelmed'), false);
});
test('in other languages only a few words are sure', () => {
  assert.strictEqual(sure('bel de tandarts', 'nl'), true);
  assert.strictEqual(sure('ik moet morgen de tandarts bellen en ook nog boodschappen doen', 'nl'), false);
});

section('reading the model’s read');
const read = (o) => ({ kind: 'task', items: [], load: 'unknown', reply: '', ...o });
test('a good read comes through as the model’s', () => {
  const r = readState(read({ kind: 'tasks', items: [' buy milk ', 'call mom'], load: 'busy', reply: 'Two things. Want them both on today?' }));
  assert.deepStrictEqual(r, { kind: 'tasks', items: ['buy milk', 'call mom'], load: 'busy', reply: 'Two things. Want them both on today?', source: 'model' });
});
test('an empty reply is no reply, and items only belong to "tasks"', () => {
  const r = readState(read({ items: ['x', 'y'] }));
  assert.strictEqual(r.reply, undefined);
  assert.strictEqual(r.items, undefined);
});
test('"tasks" with one item is an error', () => assert.throws(() => readState(read({ kind: 'tasks', items: ['one'] }))));
test('an unknown kind or load is an error', () => {
  assert.throws(() => readState(read({ kind: 'chore' })));
  assert.throws(() => readState(read({ load: 'stressed' })));
  assert.throws(() => readState(null));
});
test('words Nura never says are an error', () => assert.throws(() => readState(read({ reply: 'Three things are overdue.' }))));

section('reading suggestions');
const NOW = new Date(2026, 8, 25, 9, 30).getTime();
const sug = (o = {}) => ({
  kind: 'best_time', text: 'Do the invoice at 10?', why: 'You finished 5 of your last 6 admin tasks before noon.',
  task_id: 't1', action: { type: 'schedule', minutes: 0, at_hour: 10 }, confidence: 0.7, who: 'ra', ...o,
});
test('a good suggestion comes through, with a stable id and today’s hour', () => {
  const [s] = readSuggestions({ suggestions: [sug()] }, ['t1'], NOW);
  assert.strictEqual(s.id, 'model:best_time:t1');
  assert.strictEqual(s.taskId, 't1');
  assert.strictEqual(s.source, 'model');
  assert.strictEqual(s.action.type, 'schedule');
  assert.strictEqual(new Date(s.action.at).getHours(), 10);
  assert.strictEqual(new Date(s.action.at).getDate(), 25);
});
test('"none" means no action, and advice about no task gets an id from its words', () => {
  const a = readSuggestions({ suggestions: [sug({ kind: 'rest', task_id: '', action: { type: 'none', minutes: 0, at_hour: -1 }, who: 'nu' })] }, ['t1'], NOW)[0];
  const b = readSuggestions({ suggestions: [sug({ kind: 'rest', task_id: '', action: { type: 'none', minutes: 0, at_hour: -1 }, who: 'nu' })] }, ['t1'], NOW)[0];
  assert.strictEqual(a.action, undefined);
  assert.strictEqual(a.taskId, undefined);
  assert.strictEqual(a.id, b.id);
  assert.ok(a.id.startsWith('model:rest:'));
});
test('set_minutes carries the minutes', () => {
  const [s] = readSuggestions({ suggestions: [sug({ kind: 'estimate', action: { type: 'set_minutes', minutes: 25, at_hour: -1 } })] }, ['t1'], NOW);
  assert.deepStrictEqual(s.action, { type: 'set_minutes', minutes: 25 });
});
test('no suggestions is a fine answer', () => assert.deepStrictEqual(readSuggestions({ suggestions: [] }, [], NOW), []));
test('more than three is an error', () => assert.throws(() => readSuggestions({ suggestions: [sug(), sug(), sug(), sug()] }, ['t1'], NOW)));
test('a task id that wasn’t sent is an error', () => assert.throws(() => readSuggestions({ suggestions: [sug({ task_id: 't9' })] }, ['t1'], NOW)));
test('an action that needs a task, without one, is an error', () =>
  assert.throws(() => readSuggestions({ suggestions: [sug({ task_id: '', action: { type: 'focus', minutes: 0, at_hour: -1 } })] }, ['t1'], NOW)));
test('set_minutes without minutes, or a bad hour, is an error', () => {
  assert.throws(() => readSuggestions({ suggestions: [sug({ action: { type: 'set_minutes', minutes: 0, at_hour: -1 } })] }, ['t1'], NOW));
  assert.throws(() => readSuggestions({ suggestions: [sug({ action: { type: 'schedule', minutes: 0, at_hour: 24 } })] }, ['t1'], NOW));
});
test('one bad suggestion fails the whole answer — never half of it', () =>
  assert.throws(() => readSuggestions({ suggestions: [sug(), sug({ confidence: 2 })] }, ['t1'], NOW)));
test('an empty "why" or a streak is an error', () => {
  assert.throws(() => readSuggestions({ suggestions: [sug({ why: ' ' })] }, ['t1'], NOW));
  assert.throws(() => readSuggestions({ suggestions: [sug({ text: 'Keep your streak going?' })] }, ['t1'], NOW));
});
test('an unknown kind or speaker is an error', () => {
  assert.throws(() => readSuggestions({ suggestions: [sug({ kind: 'nag' })] }, ['t1'], NOW));
  assert.throws(() => readSuggestions({ suggestions: [sug({ who: 'coach' })] }, ['t1'], NOW));
});

section('working notes');
test('notes are joined, one per line, and the version goes up', () => {
  const n = readNotes({ notes: ['Mornings tend to go well for writing.', 'Tasks you size at 15 minutes take about 25.'] }, { text: 'old', at: 0, version: 3 }, NOW);
  assert.deepStrictEqual(n, { text: 'Mornings tend to go well for writing.\nTasks you size at 15 minutes take about 25.', at: NOW, version: 4 });
});
test('an empty list is "nothing new", not empty notes', () => assert.strictEqual(readNotes({ notes: [] }, null, NOW), null));
test('more than eight, or a diagnosis, is an error', () => {
  assert.throws(() => readNotes({ notes: Array(9).fill('A note.') }, null, NOW));
  assert.throws(() => readNotes({ notes: ['You may have ADHD.'] }, null, NOW));
});
const DAY = 86_400_000;
test('reflection needs five active days and a week since the last notes', () => {
  assert.strictEqual(reflectDue({ notesAt: null, triedAt: null, activeDays: 4, now: NOW }), false);
  assert.strictEqual(reflectDue({ notesAt: null, triedAt: null, activeDays: 5, now: NOW }), true);
  assert.strictEqual(reflectDue({ notesAt: NOW - 6 * DAY, triedAt: null, activeDays: 9, now: NOW }), false);
  assert.strictEqual(reflectDue({ notesAt: NOW - 7 * DAY, triedAt: null, activeDays: 9, now: NOW }), true);
});
test('a failed try waits a day', () => {
  assert.strictEqual(reflectDue({ notesAt: null, triedAt: NOW - 3_600_000, activeDays: 9, now: NOW }), false);
  assert.strictEqual(reflectDue({ notesAt: null, triedAt: NOW - DAY, activeDays: 9, now: NOW }), true);
});

section('when the server can’t help');
const UNSURE = 'I’m exhausted and I still have to finish the report and call the bank';
test('a read the phone is sure of never leaves the phone', async () => {
  let calls = 0;
  invoke = async () => { calls++; return { data: null, error: null }; };
  const r = await readInput('buy milk, call mom');
  assert.strictEqual(r.source, 'local');
  assert.strictEqual(r.kind, 'tasks');
  assert.strictEqual(calls, 0);
});
test('offline, an unsure read falls back to the phone', async () => {
  invoke = async () => { throw new Error('offline'); };
  const r = await readInput(UNSURE);
  assert.strictEqual(r.source, 'local');
  assert.strictEqual(r.load, 'low');
});
test('over the limit, it falls back to the phone', async () => {
  invoke = async () => ({ data: null, error: { context: { status: 429 } } });
  assert.strictEqual((await readInput(UNSURE)).source, 'local');
});
test('a bad answer falls back to the phone too', async () => {
  invoke = async () => ({ data: { kind: 'tasks', items: ['one'], load: 'unknown', reply: '' }, error: null });
  assert.strictEqual((await readInput(UNSURE)).source, 'local');
});
test('a good answer is the model’s, and only the text and language are sent', async () => {
  let sent;
  invoke = async (name, opts) => { sent = { name, ...opts }; return { data: { kind: 'tasks', items: ['finish the report', 'call the bank'], load: 'low', reply: 'Go gently today.' }, error: null }; };
  const r = await readInput(`  ${UNSURE}  `);
  assert.strictEqual(r.source, 'model');
  assert.strictEqual(sent.name, 'nura-coach');
  assert.deepStrictEqual(sent.body, { op: 'read', text: UNSURE, language: 'English' });
  assert.ok(sent.headers['x-nura-device']);
});
test('suggestions are [] on any failure', async () => {
  invoke = async () => ({ data: null, error: { context: { status: 502 } } });
  assert.deepStrictEqual(await modelSuggestions('7 days; best hours 9, 10', { tasks: [{ id: 't1', title: 'Invoice', minutes: null, priority: 2 }], notes: null }), []);
  invoke = async () => ({ data: { suggestions: [sug({ task_id: 'made-up' })] }, error: null });
  assert.deepStrictEqual(await modelSuggestions('7 days', { tasks: [{ id: 't1', title: 'Invoice', minutes: null, priority: 2 }], notes: null }), []);
});
test('suggest sends the summary, today’s titles and the notes — nothing else', async () => {
  let body;
  invoke = async (_n, opts) => { body = opts.body; return { data: { suggestions: [sug()] }, error: null }; };
  const out = await modelSuggestions('7 days; best hours 9, 10', {
    tasks: [{ id: 't1', title: ' Invoice ', minutes: 12.4, priority: 7, secret: 'x' }], notes: { text: 'Mornings go well.', at: 0, version: 1 }, hour: 9,
  });
  assert.strictEqual(out.length, 1);
  assert.deepStrictEqual(body, {
    op: 'suggest', summary: '7 days; best hours 9, 10', notes: 'Mornings go well.', hour: 9,
    tasks: [{ id: 't1', title: 'Invoice', minutes: 12, priority: 3 }], language: 'English',
  });
});
const byOp = (handlers) => async (_n, opts) => {
  const h = handlers[opts.body.op];
  if (!h) throw new Error(`unexpected ${opts.body.op}`);
  return h(opts.body);
};
const week = { summary: '7 days: 12 done', outcomes: [{ kind: 'shrink', accepted: 3, dismissed: 1, ignored: 0 }], activeDays: 6 };
test('the weekly reflection is queued as a batch, then collected on a later open', async () => {
  flags.clear();
  const ops = [];
  let ready = false;
  invoke = byOp({
    reflect_submit: (b) => { ops.push(b.op); assert.deepStrictEqual(Object.keys(b).sort(), ['language', 'op', 'outcomes', 'previous', 'summary']); return { data: { batch: 'msgbatch_abc123' }, error: null }; },
    reflect_collect: (b) => { ops.push(b.op); assert.strictEqual(b.batch, 'msgbatch_abc123'); return { data: ready ? { notes: ['Mornings tend to go well.'] } : { pending: true }, error: null }; },
  });
  assert.strictEqual(await maybeReflect(week, NOW), null);                 // queued
  assert.strictEqual(await maybeReflect(week, NOW + 3_600_000), null);     // still running
  ready = true;
  const notes = await maybeReflect(week, NOW + 7_200_000);                 // collected
  assert.strictEqual(notes.version, 1);
  assert.deepStrictEqual(await getNotes(), notes);
  assert.strictEqual(await maybeReflect(week, NOW + 3 * DAY), null);       // not again this week
  assert.deepStrictEqual(ops, ['reflect_submit', 'reflect_collect', 'reflect_collect']);
});
test('an accepted batch counts as the week’s, even if it ends badly', async () => {
  flags.clear();
  const ops = [];
  invoke = byOp({
    reflect_submit: () => { ops.push('submit'); return { data: { batch: 'msgbatch_abc123' }, error: null }; },
    reflect_collect: () => { ops.push('collect'); return { data: null, error: { context: { status: 410 } } }; },
  });
  await maybeReflect(week, NOW);
  await maybeReflect(week, NOW + 3_600_000);                                // gone: dropped
  await maybeReflect(week, NOW + 2 * DAY);                                  // no new batch within the week
  assert.deepStrictEqual(ops, ['submit', 'collect']);
  await maybeReflect(week, NOW + 8 * DAY);
  assert.deepStrictEqual(ops, ['submit', 'collect', 'submit']);
});
test('offline, a submit is tried again after a day, not before', async () => {
  flags.clear();
  let calls = 0;
  invoke = async () => { calls++; throw new Error('offline'); };
  await maybeReflect(week, NOW);
  await maybeReflect(week, NOW + 3_600_000);
  assert.strictEqual(calls, 1);
  await maybeReflect(week, NOW + DAY);
  assert.strictEqual(calls, 2);
});
test('when the server answers straight away, the notes are saved at once', async () => {
  flags.clear();
  invoke = byOp({ reflect_submit: () => ({ data: { notes: ['Short tasks tend to get done first.'] }, error: null }) });
  const n = await maybeReflect(week, NOW);
  assert.strictEqual(n.text, 'Short tasks tend to get done first.');
});
test('too few active days: nothing is sent', async () => {
  flags.clear();
  let calls = 0;
  invoke = async () => { calls++; return { data: null, error: null }; };
  assert.strictEqual(await maybeReflect({ ...week, activeDays: 4 }, NOW), null);
  assert.strictEqual(calls, 0);
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
