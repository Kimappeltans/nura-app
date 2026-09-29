// Nura — the site: the header hairline, sections easing in, the moving characters, the demos.

// the header gets its hairline once the page moves
const header = document.querySelector('header');
const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
onScroll(); addEventListener('scroll', onScroll, { passive: true });

// small screens: the pages are behind a menu button, and open as a panel under the bar
const bar = header.querySelector('.bar'), pages = bar && bar.querySelector('nav');
if (pages) {
  pages.id = 'pages';
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'menu-btn';
  b.setAttribute('aria-controls', 'pages');
  b.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path class="a" d="M5 8h14"/><path class="b" d="M5 16h14"/></svg>';
  bar.append(b);
  const set = open => {
    header.classList.toggle('open', open);
    b.setAttribute('aria-expanded', String(open));
    b.setAttribute('aria-label', open ? 'Close menu' : 'Menu');
  };
  set(false);
  b.addEventListener('click', () => set(!header.classList.contains('open')));
  pages.addEventListener('click', e => { if (e.target.closest('a')) set(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && header.classList.contains('open')) { set(false); b.focus(); } });
  document.addEventListener('click', e => { if (header.classList.contains('open') && !header.contains(e.target)) set(false); });
  matchMedia('(min-width: 801px)').addEventListener('change', e => { if (e.matches) set(false); });
}

const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

// sections ease in once, as they arrive
const seen = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); seen.unobserve(e.target); }
}), { rootMargin: '0px 0px -40px 0px' });
document.querySelectorAll('.rv').forEach(el => still ? el.classList.add('in') : seen.observe(el));

// The moving characters: real clips, cut out. Each <img data-clip> shows its
// still until it's on screen. A loop (data-loop) starts once and keeps going;
// any other clip plays each time it comes into view, then rests on its last
// pose. A clip is downloaded once; a replay decodes it afresh from memory.
// Nothing moves for people who asked for less motion.
if (!still) {
  const blobs = {};
  const fresh = src => (blobs[src] ??= fetch(src).then(r => r.ok ? r.blob() : Promise.reject()))
    .then(b => URL.createObjectURL(b));
  const play = img => fresh(img.dataset.clip).then(u => {
    if (img._url) URL.revokeObjectURL(img._url);
    img._url = u; img.src = u;
  }, () => { img.src = img.dataset.clip; });   // no fetch (a file opened from disk): just show it
  const movers = new IntersectionObserver(es => es.forEach(e => {
    const img = e.target, loop = img.hasAttribute('data-loop');
    if (e.isIntersecting && !img._on) { img._on = true; play(img); if (loop) movers.unobserve(img); }
    else if (!e.isIntersecting && !loop) img._on = false;
  }), { threshold: 0.5 });
  // the hero's own mover waits until the page has loaded, so it's never in the first download
  const watch = img => movers.observe(img);
  document.querySelectorAll('img[data-clip]:not([data-after-load])').forEach(watch);
  const later = () => setTimeout(() => document.querySelectorAll('img[data-clip][data-after-load]').forEach(watch), 600);
  if (document.readyState === 'complete') later(); else addEventListener('load', later, { once: true });
}


// The hero: one line across the page and through the phone, where it is the
// day's path. The sun rides it as you scroll, and as it passes, each of the
// day's things comes up just above the line beside it, then lands in the
// phone's stack. One at a time, however fast the scroll. Landed things stay
// (no number goes down): scrolling back only moves the sun. Where there's no
// room beside the phone they land straight in it. Reduce Motion: the sun sits
// at noon and the day is already there.
const stage = document.querySelector('.hx-stage');
const live = stage && stage.querySelector('.phone.live');
const line = stage && stage.querySelector('.hx-line');
if (live && line) {
  line.innerHTML = `<defs>
      <linearGradient id="hxlit" gradientUnits="userSpaceOnUse" x1="0" x2="1"><stop offset="0" stop-color="#FF6B35" stop-opacity="0"/><stop offset=".12" stop-color="#FF6B35"/><stop offset="1" stop-color="#FF8A5C"/></linearGradient>
      <radialGradient id="hxhalo"><stop offset="0" stop-color="#FFE2B8" stop-opacity=".9"/><stop offset=".3" stop-color="#FFB067" stop-opacity=".45"/><stop offset=".65" stop-color="#FF8A5C" stop-opacity=".14"/><stop offset="1" stop-color="#FF6B35" stop-opacity="0"/></radialGradient>
      <linearGradient id="hxdisc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF0D6"/><stop offset=".45" stop-color="#FFB067"/><stop offset="1" stop-color="#FF7A3D"/></linearGradient>
    </defs>
    <path class="ahead" fill="none" stroke="#171313" stroke-opacity=".3" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="2 7"/>
    <path class="lit" fill="none" stroke="url(#hxlit)" stroke-width="2.5" stroke-linecap="round"/>
    <g class="sun"><circle class="halo" fill="url(#hxhalo)"/><circle class="disc" fill="url(#hxdisc)"/></g>`;
  const [ahead, lit] = line.querySelectorAll('path');
  const sun = line.querySelector('.sun');
  const chips = [...stage.querySelectorAll('.hx-chip')];
  const slots = [...live.querySelectorAll('[data-slot]')];
  const today = live.querySelector('[data-today]'), held = live.querySelector('[data-held]');
  const SAY = ['Nothing on yet.', '1 thing today.', '2 things today.', '3 things today.'];
  // where on the line each thing comes up: two on the way in, the one Nu found once the sun is past noon
  const AT = [0.2, 0.34, 0.66];

  // The line, in the stage's own pixels: one smooth arch, low over the day
  // (it crosses the horizon at Start and at Day ends and peaks under the
  // greeting) and easing out to gentle, nearly straight sides that reach
  // down toward the page's bottom corners. A hyperbola, y = k * (sqrt(1 + d²/a²) - 1)
  // from the top: round at the peak with no corner anywhere.
  const arch = (a, d) => Math.sqrt(1 + (d / a) ** 2) - 1;
  // On a desktop tall enough to hold the whole stage, the stage stays put
  // while the sun crosses it (the run is that much taller than the stage).
  const run = stage.parentElement && stage.parentElement.classList.contains('hx-run') ? stage.parentElement : null;
  const PIN_TOP = 84;
  const pinIt = () => {
    if (!run) return;
    const pin = !still && innerWidth >= 900 && innerHeight >= stage.offsetHeight + PIN_TOP + 16;
    run.classList.toggle('pin', pin);
    run.style.height = pin ? `${stage.offsetHeight + Math.round(innerHeight * 0.8)}px` : '';
  };
  let pts = [], total = 0, from = 0, to = 0, yAt = () => 0;
  const lay = () => {
    const s = stage.getBoundingClientRect();
    const mid = el => { const b = live.querySelector(el).getBoundingClientRect(); return [b.left + b.width / 2 - s.left, b.top + b.height / 2 - s.top]; };
    const [x0, hz] = mid('.day .s'), [x1] = mid('.day .e');
    const W = s.width, H = s.height, C = (x0 + x1) / 2;
    const h = (x1 - x0) / 2, D = Math.max(C, W - C) + 30, a = h * 1.8;
    const top = hz - (live.querySelector('.day').getBoundingClientRect().top - s.top);
    const drop = Math.min(H - 28 - hz, Math.max(90, H * 0.28));   // how far below the horizon it ends
    // as steep as reaching that drop needs, but never peaking more than a third of the way to the greeting
    const lift = Math.min(drop / (arch(a, D) - arch(a, h)), top * 0.34 / arch(a, h));
    const peak = hz - lift * arch(a, h);
    yAt = x => peak + lift * arch(a, x - C);
    pts = []; total = 0;
    for (let x = -30, px, py; x <= W + 30; x += 4) {
      const y = yAt(x);
      if (px != null) total += Math.hypot(x - px, y - py);
      pts.push([x, y, total]); px = x; py = y;
    }
    const d = 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L');
    line.setAttribute('viewBox', `0 0 ${W} ${H}`);
    ahead.setAttribute('d', d); lit.setAttribute('d', d);
    lit.style.strokeDasharray = `${total} ${total}`;
    line.querySelector('#hxlit').setAttribute('x2', W);
    // the sun rides only the stretch that's on screen
    const lenAt = x => pts[Math.max(0, Math.min(pts.length - 1, Math.round((x + 30) / 4)))][2];
    const edge = Math.max(24, W * 0.03);
    from = lenAt(edge); to = lenAt(W - edge);
    const k = Math.max(0.85, Math.min(1.3, live.offsetWidth / 340));
    sun.querySelector('.halo').setAttribute('r', (74 * k).toFixed(1));
    sun.querySelector('.disc').setAttribute('r', (17 * k).toFixed(1));
  };
  // the point on the line at p (0 to 1 of the stretch on screen), and how far along it is
  const pointAt = p => {
    const want = from + (to - from) * p;
    let i = 1; while (i < pts.length - 1 && pts[i][2] < want) i++;
    const [ax, ay, al] = pts[i - 1], [bx, by, bl] = pts[i], f = bl > al ? (want - al) / (bl - al) : 0;
    return [ax + (bx - ax) * f, ay + (by - ay) * f, want];
  };
  let at = 0;
  const place = p => {
    at = p;
    const [x, y, len] = pointAt(p);
    sun.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    lit.style.strokeDashoffset = (total - len).toFixed(1);
  };
  // a thing comes up just above the line where the sun passed it, beside the
  // phone and never over it; false when there's no room there
  const perch = i => {
    const chip = chips[i];
    if (!chip || !chip.offsetWidth) return false;
    const s = stage.getBoundingClientRect(), ph = live.getBoundingClientRect();
    const cw = chip.offsetWidth, ch = chip.offsetHeight, [ax] = pointAt(AT[i]);
    const lo = ph.left - s.left - 28 - cw, hi = ph.right - s.left + 28;   // the last left, the first right
    let x = ax - cw / 2;
    x = ax < (ph.left + ph.right) / 2 - s.left ? Math.min(x, lo) : Math.max(x, hi);
    if (x < 16 || x + cw > s.width - 16) return false;
    chip.style.left = `${x.toFixed(1)}px`; chip.style.right = 'auto';
    chip.style.top = `${(Math.min(yAt(x), yAt(x + cw)) - 34 - ch).toFixed(1)}px`;
    return true;
  };

  let count = 0, busy = false;
  const landed = AT.map(() => false), queue = [];
  const say = () => { today.textContent = SAY[count]; held.textContent = count; };
  const put = i => { slots[i].classList.add('in'); count++; say(); };
  const next = () => {
    const i = queue.shift();
    if (i == null) { busy = false; return; }
    busy = true;
    if (!perch(i)) { put(i); setTimeout(next, 380); return; }
    const chip = chips[i];
    chip.classList.add('on');                                      // it comes up
    setTimeout(() => {                                             // then flies into its place
      const a = chip.getBoundingClientRect(), b = slots[i].getBoundingClientRect();
      const bh = i < 2 ? b.height * 0.7 : b.height;                 // a stone shows its top, not the part under the next one
      chip.style.translate = `${(b.left + b.width / 2 - a.left - a.width / 2).toFixed(1)}px ${(b.top + bh / 2 - a.top - a.height / 2).toFixed(1)}px`;
      chip.style.scale = Math.min(1.2, b.width / a.width).toFixed(3);
      chip.classList.add('fly');
      setTimeout(() => put(i), 480);
      setTimeout(next, 900);
    }, 700);
  };
  const reach = p => AT.forEach((a, i) => { if (p >= a && !landed[i]) { landed[i] = true; queue.push(i); if (!busy) next(); } });

  stage.classList.add('rising');
  say();
  pinIt();
  lay();
  if (still) {
    place(0.5);
    slots.forEach((_, i) => { landed[i] = true; put(i); });
    chips.forEach(c => c.classList.add('fly'));
  } else {
    // from the stage coming into the window to the end of the stretch it stays put for
    // (without the pin: until most of the stage has gone by)
    const scrolled = () => {
      const top = (run ?? stage).getBoundingClientRect().top + scrollY;
      const start = top - innerHeight * 0.5;
      const end = run && run.classList.contains('pin')
        ? top + run.offsetHeight - stage.offsetHeight - PIN_TOP
        : top + stage.offsetHeight * 0.7 - innerHeight * 0.4;
      return Math.min(1, Math.max(0, (scrollY - Math.max(0, start)) / Math.max(240, end - Math.max(0, start))));
    };
    let dawn = 0, queued = false;
    const draw = () => { queued = false; const p = Math.max(dawn, scrolled()); place(p); reach(p); };
    const ask = () => { if (!queued) { queued = true; requestAnimationFrame(draw); } };
    addEventListener('scroll', ask, { passive: true });
    addEventListener('resize', () => { pinIt(); lay(); place(at); ask(); });
    // on arrival the sun comes up over the edge of the page, not yet to the first thing
    const t0 = performance.now(), RISE_MS = 1800, RISE_TO = 0.12;
    const rise = now => { const k = Math.min(1, (now - t0) / RISE_MS); dawn = RISE_TO * (1 - Math.pow(1 - k, 3)); draw(); if (k < 1) requestAnimationFrame(rise); };
    place(0); requestAnimationFrame(rise);
  }
  // the phone's layout settles with the fonts: draw the line again once they're in
  if (document.fonts) document.fonts.ready.then(() => { pinIt(); lay(); place(at); });
}

// The early-access form: sent in the background (Netlify Forms reads a plain
// urlencoded POST), then a quiet line instead of the form.
const signup = document.querySelector('form.signup');
if (signup) {
  const state = document.querySelector('.form-state'), btn = signup.querySelector('button');
  signup.addEventListener('submit', async e => {
    e.preventDefault();
    btn.disabled = true; state.className = 'form-state'; state.textContent = 'Sending…';
    try {
      const r = await fetch(signup.getAttribute('action') || '/', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(new FormData(signup)).toString(),
      });
      if (!r.ok) throw new Error(r.status);
      signup.hidden = true;
      state.className = 'form-state ok'; state.textContent = "Thanks. We'll write when the iPhone app is out.";
    } catch {
      btn.disabled = false;
      state.textContent = "That didn't go through. Please try again in a moment.";
    }
  });
  // "Get early access" anywhere on the page: scroll to the form, then the cursor in the field
  document.querySelectorAll('a[href$="#early-access"]').forEach(a => a.addEventListener('click', () => {
    setTimeout(() => signup.querySelector('input[type="email"]').focus({ preventScroll: true }), 700);
  }));
}

// "It learns you": the suggestion, and a Yes that really changes the estimate.
const learn = document.querySelector('.learn-demo');
if (learn) {
  const card = learn.querySelector('#learn-card'), mins = learn.querySelector('#learn-mins'), row = learn.querySelector('.learn-task');
  const after = learn.querySelector('.learn-after'), again = learn.querySelector('.learn-again');
  let run = 0;                                            // a reset cancels a count still running
  const count = (from, to) => {
    const id = ++run;
    if (still) { mins.textContent = to; return; }
    const t0 = performance.now();
    const step = now => {
      if (id !== run) return;
      const k = Math.min(1, (now - t0) / 700);
      mins.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const close = line => {
    card.classList.add('gone'); after.textContent = line; again.hidden = false;
    setTimeout(() => { card.hidden = true; }, 450);
  };
  card.querySelector('.yes').addEventListener('click', () => {
    row.classList.add('bumped'); count(45, 60);
    close('Done. The slides get 60 minutes now, and suggestions like this will come up more.');
  });
  card.querySelector('.no').addEventListener('click', () => close('Not now. This one rests for a week.'));
  again.addEventListener('click', () => {
    run++; card.hidden = false; row.classList.remove('bumped'); mins.textContent = '45'; after.textContent = ''; again.hidden = true;
    requestAnimationFrame(() => card.classList.remove('gone'));
  });
}

// Your next move: the one thing, the planner's facts for it, what comes after
// and the day you have. Not now, Something changed, Start and Done all go
// through the app's own planner (assets/nura-parser.js, from src/next.ts), so
// what comes up next, and why, is what the app would say. The day is an
// example: today at 2:10 PM, a call at 3:00, the day ending at 6:00. Every
// change can be undone.
const nm = document.querySelector('.nm');
if (nm && window.NuraParser) {
  const P = window.NuraParser;
  const $ = q => nm.querySelector(q);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const NOW = new Date().setHours(14, 10, 0, 0);
  const at = (days, h, m = 0) => { const d = new Date(NOW); d.setDate(d.getDate() + days); return d.setHours(h, m, 0, 0); };
  const CALL = at(0, 15), LEFT = 200;                       // 2:10 to 6:00, less the half hour call
  const mins = m => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
  const seed = () => [
    { id: 'a', title: 'Send the revised proposal to Maya', est_minutes: 12, due_at: at(0, 17), has_time: 1, priority: 3, project: 'The proposal',
      smaller: [['Open the proposal and mark what changed', 5], ['Rewrite the pricing section', 20], ['Send it to Maya', 5]] },
    { id: 'b', title: 'Review the Q3 numbers', est_minutes: 30, due_at: at(1, 9), project: 'The Q3 review',
      smaller: [['Open the Q3 sheet and skim the totals', 5], ['Check the three biggest changes', 15], ['Write two lines for the team', 10]] },
    { id: 'c', title: 'Reply to Alex', est_minutes: 10, project: 'The reply to Alex',
      smaller: [['Read Alex’s message again', 2], ['Write the first line', 5]] },
    { id: 'd', title: 'Book the dentist', est_minutes: 10, project: 'The dentist',
      smaller: [['Find the dentist’s number', 2], ['Call and pick a day', 8]] },
    { id: 'e', title: 'Prepare the board slides', est_minutes: 60, due_at: at(3, 9), project: 'The board slides',
      smaller: [['Write the five headings', 10], ['Draft the slides', 40], ['Run through it once', 10]] },
    { id: 'f', title: 'Research competitors', est_minutes: 60, project: 'The research',
      smaller: [['List five names to look at', 5], ['Read their pricing pages', 30], ['Note what stands out', 25]] },
  ].map((t, i) => ({ state: 'inbox', created_at: NOW - (i + 1) * 3_600_000, snooze_count: 0, snoozed_until: null, parent_id: null, priority: 0, due_at: null, has_time: 0, ...t }));
  // what Nura has learned from you (src/patterns.ts): your pace against your guesses, your good hour
  const LEARNED = [
    { kind: 'estimate_ratio', scope: 'all', value: 1.3, confidence: 0.8, sample_count: 8 },
    { kind: 'best_hour', scope: '1', value: 14, confidence: 0.8, sample_count: 8 },
  ];
  // back after a week: the same things, their days gone by. Nothing is called late.
  const GONE = { a: at(-3, 17), b: at(-2, 9), e: at(-1, 9) };
  const fresh = (mode = 'day') => ({
    mode, tasks: seed().map(t => (mode === 'back' && GONE[t.id] ? { ...t, due_at: GONE[t.id] } : t)),
    passed: [], done: 0, short: false, moves: {}, going: null, touched: false,
  });
  let S = fresh();
  const past = [];                                          // what Undo goes back to
  const keep = () => { past.push(JSON.stringify(S)); if (past.length > 20) past.shift(); };
  const rank = () => P.rankActions(S.tasks, {
    now: NOW, dayEndMin: 18 * 60, energy: 'steady', anchors: [CALL, ...(S.short ? [NOW + 15 * 60_000] : [])],
    passedIds: S.passed, moves: new Map(Object.entries(S.moves)), patterns: LEARNED,
  });
  // The app's comeback (src/learn/suggest.ts): after days away, before anything else
  // has happened, the smallest thing you're holding goes first. Then the planner again.
  const order = () => {
    const ranked = rank();
    if (S.mode !== 'back' || S.touched || !ranked.length) return { ranked, back: false };
    const small = [...ranked].sort((a, b) => (a.task.est_minutes ?? 15) - (b.task.est_minutes ?? 15) || a.task.created_at - b.task.created_at)[0];
    return { ranked: [small, ...ranked.filter(d => d !== small)], back: true };
  };
  // the facts that say most first: a day, a priority, a project; "fits before" last
  const telling = fs => [...fs.filter(f => !f.startsWith('Fits')), ...fs.filter(f => f.startsWith('Fits'))];

  const move = $('.nm-move'), title = $('.nm-title'), about = $('.nm-about'), facts = $('.nm-facts');
  const acts = $('.nm-acts'), changed = $('.nm-changed'), note = $('.nm-note'), after = $('.nm-after');
  const [bStart, bNot, bChanged] = acts.querySelectorAll('button');
  const say = (text, undo = true) => {
    note.hidden = !text;
    if (!text) return;
    note.querySelector('span').textContent = text;
    note.querySelector('[data-act="undo"]').hidden = !undo || !past.length;
    note.style.animation = 'none'; void note.offsetWidth; note.style.animation = '';
  };
  const open = on => { changed.hidden = !on; bChanged.setAttribute('aria-expanded', String(on)); };

  const render = swap => {
    const { ranked, back } = order(), d = ranked[0];
    const going = !!d && S.going === d.taskId;
    move.classList.toggle('going', going);
    facts.textContent = '';
    if (!d) {
      title.textContent = 'That’s everything.';
      about.textContent = 'Anything now is extra.';
      bStart.textContent = 'Start the day again'; bStart.dataset.act = 'reset';
      bNot.hidden = bChanged.hidden = true;
    } else {
      const m = d.suggestedMinutes ?? d.task.est_minutes, of = S.moves[d.taskId];
      title.textContent = d.task.title;
      about.textContent = [m ? `About ${mins(m)}` : null, of ? of.project : null].filter(Boolean).join(' · ');
      const why = going ? ['In session'] : back ? ['Last here 6 days ago', 'The smallest thing you’re holding', ...telling(d.facts).filter(f => f.startsWith('You guessed'))] : telling(d.facts);
      why.slice(0, 3).forEach(f => facts.append(el('li', '', f)));
      bStart.textContent = going ? 'Done' : 'Start'; bStart.dataset.act = going ? 'finish' : 'start';
      bNot.textContent = going ? 'Stop here' : 'Not now'; bNot.dataset.act = going ? 'stop' : 'notnow';
      bNot.hidden = false; bChanged.hidden = going;
    }
    after.textContent = '';
    ranked.slice(1, 4).forEach((x, i) => {
      const li = el('li'), text = el('span'), fact = telling(x.facts).find(f => !f.startsWith('Fits'));
      text.append(el('b', '', x.task.title));
      if (fact) text.append(el('small', '', fact));
      li.append(el('i', '', String(i + 2)), text, el('em', '', mins(x.suggestedMinutes ?? x.task.est_minutes)));
      li.style.animationDelay = still ? '0s' : `${i * 0.07}s`;
      after.append(li);
    });
    if (ranked.length < 2) after.append(el('li', 'none', d ? 'Nothing after this one.' : 'Nothing held.'));
    $('.nm-left').textContent = S.short ? '15 min' : mins(LEFT);
    $('.nm-leftk').textContent = S.short ? 'before you have to go' : 'left today, around your events';
    const done = $('.nm-done');
    done.hidden = !S.done && S.mode !== 'back';
    done.textContent = [S.mode === 'back' ? 'Last here 6 days ago' : null, S.done ? `${S.done} done today` : null].filter(Boolean).join(' · ');
    nm.parentElement.querySelectorAll('.nm-when button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.day === S.mode)));
    if (swap) { move.classList.remove('swap'); void move.offsetWidth; move.classList.add('swap'); }
  };

  // a finished move: a project's next step comes up in its place, anything else is gone
  const finish = t => {
    S.done++;
    const i = S.tasks.indexOf(t);
    if (t.rest && t.rest.length) {
      const [name, m] = t.rest[0], id = `${t.id}+`;
      S.moves[id] = S.moves[t.id];
      S.tasks[i] = { ...t, id, title: name, est_minutes: m, rest: t.rest.slice(1), state: 'inbox' };
    } else S.tasks.splice(i, 1);
  };
  const DO = {
    start: t => { S.going = t.id; say(null); },
    finish: t => { keep(); S.going = null; finish(t); say('Done. That one is gone.'); },
    stop: t => { keep(); S.going = null; t.state = 'doing'; say('Stopped. The time still counts.'); },
    notnow: t => { keep(); S.passed.push(t.id); say('Out of the way for today. Here’s the next one.'); },
    bigger: t => {
      keep();
      if (!t.smaller) { t.est_minutes = Math.min(t.est_minutes ?? 5, 5); return say('This is the smallest piece. Five minutes is enough to begin.'); }
      const [[name, m], ...rest] = t.smaller, id = `${t.id}+`;
      S.moves[id] = { project: t.project, touchedAt: NOW, blocked: false };
      S.tasks[S.tasks.indexOf(t)] = { ...t, id, title: name, est_minutes: m, rest, smaller: null };
      say(`Nu found a smaller way in: ${m} minutes to begin.`);
    },
    waiting: t => { keep(); Object.assign(t, { due_at: at(1, 9), has_time: 0, snoozed_until: at(1, 7) }); say('Moved to tomorrow while you wait. Here’s what you can do now.'); },
    short: () => { keep(); S.short = true; say('15 minutes it is. What fits comes first.'); },
    done: t => { keep(); finish(t); say('Done. That one is gone.'); },
    undo: () => { const was = past.pop(); if (was) S = JSON.parse(was); say(null); },
    reset: () => { S = fresh(S.mode); past.length = 0; say(S.mode === 'back' ? WELCOME : null, false); },
  };
  const WELCOME = 'Welcome back. No catching up needed, just one small thing.';
  nm.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'changed') return open(changed.hidden);
    const d = order().ranked[0];
    const t = d && S.tasks.find(x => x.id === d.taskId);
    if (!t && act !== 'undo' && act !== 'reset') return;
    open(false);
    DO[act](t);
    // anything but starting it ends the welcome: from here on it's the planner's order
    if (act !== 'start' && act !== 'undo' && act !== 'reset') S.touched = true;
    render(true);
  });
  // the day you're shown: an ordinary one, or the first one back after a week away
  nm.parentElement.querySelector('.nm-when').addEventListener('click', e => {
    const b = e.target.closest('[data-day]');
    if (!b || b.dataset.day === S.mode) return;
    S = fresh(b.dataset.day); past.length = 0;
    open(false);
    say(S.mode === 'back' ? WELCOME : null, false);
    render(true);
  });
  render(false);
}

// The breakdown (Try it): what you said, Nu reading it piece by piece (each
// thing marked and named in your own sentence, the rest fading), then the
// pieces sorted with a day and a length, the big one broken into steps, and
// where to start in front. The words are read by the app's own parser and
// the pick is the app's own planner (assets/nura-parser.js). The first time
// it's on screen it plays with a mess of its own; then it's yours to try.
const bd = document.querySelector('.bd');
if (bd && window.NuraParser) {
  const P = window.NuraParser;
  const mess = bd.querySelector('.bd-mess'), reply = bd.querySelector('.bd-reply');
  const list = bd.querySelector('.bd-list'), front = bd.querySelector('.bd-front');
  const waiting = bd.querySelector('.bd-wait');
  const hold = say => { waiting.hidden = !say; if (say) waiting.querySelector('span').textContent = say; };
  const wait = ms => new Promise(r => setTimeout(r, still ? 0 : ms));
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  // "ugh ok so I need to…": how it was said, not what to do
  const OPEN = /^(?:(?:ugh|ok|okay|so|um|well|right|hmm|oh|argh)[,.!]?\s+)+/i;
  const LEAD = /^(?:(?:and|also|then|plus)\s+)?(?:i\s+(?:really\s+)?(?:need|have|want|got)\s+to|i\s+must|i\s+should|i\s+gotta|need\s+to|have\s+to|remember\s+to|don'?t\s+forget\s+to)\s+/i;
  const tidy = s => s.trim().replace(OPEN, '').replace(LEAD, '').trim();
  // a length when none was said: what things like it usually take
  const guess = t => /\b(call|ring|phone)\b/i.test(t) ? 10 : /\b(send|email|text|reply|message|pay)\b/i.test(t) ? 5
    : /\b(book|buy|order|groceries|shop)\b/i.test(t) ? 20 : /\b(fix|clean|tidy|gym)\b/i.test(t) ? 30 : 15;
  // A big thing, thought through: its phases, every step it really takes, and
  // the things to have at hand, by name. (In the app Nu plans yours with you;
  // these are worked examples.) A step: [title, minutes, what to gather, a note].
  const PLANS = [
    [/web ?site|\bsite\b|landing page|portfolio/i, [
      ['Decide what it is', [
        ['List what’s left on the site', 15],
        ['Write who it’s for and the one thing they should do', 15],
        ['Sketch the pages and the menu', 20, ['Home', 'About', 'Work or services', 'Contact']],
      ]],
      ['Write and gather', [
        ['Write the homepage copy', 45],
        ['Write the about and contact pages', 40],
        ['Gather the pictures', 25, ['Your logo', 'A photo of you', '3 to 5 pictures of your work', 'Two lines from happy customers']],
      ]],
      ['Build', [
        ['Build the pages', 90, null, 'Waits on the copy'],
        ['Add the contact form and test it', 20],
        ['Check every page on a phone', 20],
        ['Fix what’s slow or broken', 30, ['Big images', 'Dead links', 'Typos']],
      ]],
      ['Get it ready to go live', [
        ['Connect the domain', 20, ['Domain login', 'Hosting login']],
        ['Write the page titles and descriptions for search', 20],
        ['Add the privacy page and the cookie notice', 20],
        ['Ask a friend to read it through', 10],
      ]],
      ['Launch', [
        ['Fix what they found', 30],
        ['Publish it', 15],
        ['Tell people it’s live', 15, ['Email', 'Your profiles', 'Your email signature']],
      ]],
    ]],
    [/\btax/i, [
      ['Gather your paperwork', [
        ['Find last year’s return', 10],
        ['Collect your income forms', 20, ['W-2 from each employer', '1099-NEC or 1099-K for freelance work', '1099-INT and 1099-DIV from your banks', '1099-G if you had unemployment', '1099-R or SSA-1099 for retirement income']],
        ['Collect what you can deduct', 25, ['1098 for mortgage interest', '1098-T for tuition', '1098-E for student loan interest', 'Charity receipts', 'Medical bills', 'Childcare costs and the provider’s tax ID']],
        ['Collect your health cover forms', 10, ['1095-A if you bought cover on the marketplace', 'HSA statements (1099-SA, 5498-SA)']],
        ['Get your details together', 10, ['Social Security numbers, yours and your dependents’', 'Bank routing and account number', 'Last year’s AGI', 'Your IP PIN, if you have one']],
      ]],
      ['Prepare the return', [
        ['Choose how you’ll file', 10, ['IRS Free File', 'Tax software', 'A preparer']],
        ['Enter your income', 30, null, 'Waits on the income forms'],
        ['Enter deductions and credits', 30],
        ['Add your state return', 20],
        ['Check it against last year’s', 15],
      ]],
      ['File and keep', [
        ['File the return', 15],
        ['Pay what you owe, or set up the refund', 10],
        ['Save a copy with all the forms', 5],
      ]],
    ]],
    [/offsite|retreat|workshop|conference/i, [
      ['Decide', [
        ['Agree what the offsite is for', 15],
        ['Set the budget', 15, ['Place', 'Travel', 'Food', 'Activities']],
        ['Pick two possible dates', 10],
        ['Ask who can come', 10],
      ]],
      ['Book', [
        ['Shortlist three places', 30],
        ['Book the place', 20, null, 'Waits on the dates'],
        ['Book travel and rooms', 40],
        ['Order the food', 20, ['Headcount', 'Dietary needs']],
      ]],
      ['Plan the days', [
        ['Draft the agenda', 30],
        ['Line up who runs each session', 20],
        ['Pack what the room needs', 15, ['Screen or projector', 'Whiteboard and pens', 'Adapters', 'Name tags']],
      ]],
      ['Send it round', [
        ['Send everyone the plan', 15, ['Dates and times', 'The address', 'What to bring']],
        ['Confirm numbers a week before', 10],
      ]],
    ]],
    [/\bmov(e|ing)\b|new (house|flat|apartment)/i, [
      ['Decide and book', [
        ['Pick the moving day', 10],
        ['Get three quotes from movers', 30],
        ['Book the movers or a van', 15],
      ]],
      ['Sort and pack', [
        ['Sort what to keep, give away and bin', 60],
        ['Get the packing things', 20, ['Boxes', 'Tape', 'Bubble wrap', 'Marker pens']],
        ['Pack room by room', 120],
        ['Pack a first night box', 15, ['Bedding', 'Chargers', 'Kettle and mugs', 'Toiletries']],
      ]],
      ['Paperwork', [
        ['Change your address', 25, ['Post office', 'Bank', 'Employer', 'Insurance', 'Driving licence']],
        ['Move the utilities', 25, ['Electricity and gas', 'Water', 'Internet']],
      ]],
      ['The day', [
        ['Walk through the old place', 20],
        ['Hand back the keys', 10],
      ]],
    ]],
    [/presentation|slides|\bdeck\b|\btalk\b|pitch/i, [
      ['Shape it', [
        ['Write who’s in the room and what they need', 10],
        ['Write the one thing they should remember', 10],
        ['Outline it in five headings', 15],
      ]],
      ['Build it', [
        ['Gather what goes in it', 25, ['The numbers', 'Pictures or screenshots', 'One story or example']],
        ['Draft the slides', 60],
        ['Cut it to the time you have', 20],
      ]],
      ['Rehearse', [
        ['Run through it out loud', 20],
        ['Check the room and the screen', 10, ['Adapter', 'Clicker', 'A copy on a stick']],
        ['Send the deck round', 5],
      ]],
    ]],
    [/party|wedding|birthday|dinner|shower/i, [
      ['Decide', [
        ['Pick the date and the place', 15],
        ['Write the guest list', 20],
        ['Set the budget', 10],
      ]],
      ['Book and invite', [
        ['Book the place', 20],
        ['Send the invitations', 20, ['Date and time', 'Address', 'Reply by']],
        ['Order the food and the cake', 20, ['Headcount', 'Dietary needs']],
      ]],
      ['Get ready', [
        ['Plan the music', 15],
        ['Buy what’s needed', 30, ['Drinks', 'Decorations', 'Candles', 'Plates and cups']],
        ['Confirm numbers', 10],
      ]],
      ['The day', [
        ['Set up the room', 40],
        ['Clear up after', 30],
      ]],
    ]],
  ];
  // anything else: the same thinking, in general words
  const ANY = [
    ['Get clear', [
      ['Write down what done looks like', 10],
      ['List everything it needs', 15, ['People to ask', 'Things to find or buy', 'Logins and files']],
      ['Put the list in order', 10],
    ]],
    ['Do it', [
      ['Do the first piece', 25],
      ['Get what’s missing', 20],
      ['Do the next piece', 45],
    ]],
    ['Finish', [
      ['Check it against what done looks like', 10],
      ['Hand it over or send it', 10],
    ]],
  ];
  const planOf = t => (PLANS.find(([re]) => re.test(t)) ?? [0, ANY])[1];
  const span = m => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
  const dayWord = ms => {
    const d = new Date(ms), t = new Date(), t1 = new Date(); t1.setDate(t.getDate() + 1);
    return d.toDateString() === t.toDateString() ? 'Today' : d.toDateString() === t1.toDateString() ? 'Tomorrow' : d.toLocaleDateString([], { weekday: 'long' });
  };
  const clock = ms => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  // 1. how Nu reads it: the pieces, what each one is, and how you sound
  const read = text => {
    const u = P.understand(text);
    const parts = u.items && u.items.length ? u.items : [text];
    const pieces = parts.map(raw => {
      const words = tidy(raw) || raw.trim();
      const v = P.understand(words);
      if (v.type === 'note') return { raw, words: raw.trim(), kind: 'feel', tag: 'Feeling' };
      const d = P.parseTask(words);
      // the parser's project, or a thing that's always several steps ("taxes", "the offsite")
      const project = v.type === 'project' || (/\btax(es)?\b|\boffsite\b|\bweb ?site\b/i.test(words) && d.title.split(/\s+/).length <= 5);
      const est = d.est_minutes || (project ? null : guess(d.title));
      const when = d.due_at ? (project ? `By ${dayWord(d.due_at)}` : dayWord(d.due_at) + (d.has_time ? ` ${clock(d.due_at)}` : '')) : null;
      const phases = project ? planOf(words) : null;
      return { raw, words, d, est, guessed: !d.est_minutes, kind: project ? 'project' : 'task', when,
        tag: [project ? 'Project' : 'Task', when].filter(Boolean).join(' · '), phases, steps: phases ? phases.flatMap(([, xs]) => xs) : null };
    });
    return { load: u.read && u.read.load, pieces };
  };
  // each piece marked where it sits in what you said; the words around it fade
  const markUp = (text, pieces) => {
    mess.textContent = '';
    const low = text.toLowerCase(), marks = [];
    let at = 0;
    for (const p of pieces) {
      let s = p.words.toLowerCase(), i = low.indexOf(s, at);
      if (i < 0) { s = p.raw.trim().toLowerCase(); i = low.indexOf(s, at); }
      if (i < 0) continue;
      if (i > at) mess.append(el('span', 'f', text.slice(at, i)));
      const m = el('mark', `k-${p.kind}`, text.slice(i, i + s.length));
      m.dataset.tag = p.tag;
      mess.append(m); marks.push(m);
      at = i + s.length;
    }
    if (at < text.length) mess.append(el('span', 'f', text.slice(at)));
    return marks;
  };
  // 3. where to start: the app's planner, over the tasks and each project's first step
  const pick = pieces => {
    const now = Date.now(), tasks = [], moves = new Map();
    pieces.forEach((p, n) => {
      if (p.kind === 'feel') return;
      const [title, est] = p.steps ? p.steps[0] : [p.d.title, p.est];
      const id = `t${n}`;
      tasks.push({ id, title, state: 'inbox', created_at: now - n * 1000, due_at: p.d.due_at ?? null, has_time: !p.steps && p.d.has_time ? 1 : 0,
        est_minutes: est, priority: p.d.priority || 0, snooze_count: 0, parent_id: null, piece: p });
      if (p.steps) moves.set(id, { project: p.d.title, touchedAt: now, blocked: false });
    });
    const today = new Date(now).toDateString();
    const anchors = tasks.filter(t => t.has_time && t.due_at && new Date(t.due_at).toDateString() === today).map(t => t.due_at);
    return P.rankActions(tasks, { now, dayEndMin: 23 * 60, energy: 'steady', anchors, moves })[0] ?? null;
  };
  // the phases across the days you have: today to the day it's due
  const daysFor = (phases, due) => {
    if (!due) return [];
    const t0 = new Date().setHours(12, 0, 0, 0), n = Math.max(0, Math.round((new Date(due).setHours(12, 0, 0, 0) - t0) / 86400000));
    return phases.map((_, i) => dayWord(t0 + Math.round(i * n / Math.max(1, phases.length - 1)) * 86400000));
  };
  const row = p => {
    const li = el('li');
    li.append(el('b', '', p.d.title));
    const chips = el('div', 'chips-row');
    if (p.steps) chips.append(el('span', 'proj', 'Project'));
    if (p.when) chips.append(el('span', '', p.when));
    if (p.steps) chips.append(el('span', '', `${p.steps.length} steps`), el('span', '', `about ${span(Math.round(p.steps.reduce((a, x) => a + x[1], 0) / 15) * 15)}`));
    if (p.est) chips.append(el('span', '', `${p.guessed ? 'about ' : ''}${p.est} min`));
    const label = p.d.label && P.labelById(p.d.label);
    if (label) chips.append(el('span', '', label.name));
    li.append(chips);
    if (p.phases) {
      const plan = el('div', 'bd-plan'), days = daysFor(p.phases, p.d.due_at);
      // the first phase shows; the rest folds away behind one button, so the tasks under the project stay in sight
      const shown = p.phases[0][1].length, fold = p.phases.length > 1 && p.steps.length > shown;
      const rest = fold ? el('div', 'bd-rest') : null;
      let n = 0;
      p.phases.forEach(([name, steps], i) => {
        const into = i && rest ? rest : plan, from = i && rest ? shown : 0;
        const head = el('div', 'bd-phase');
        head.append(el('b', '', name));
        if (days[i]) head.append(el('span', '', days[i]));
        head.style.animationDelay = still ? '0s' : `${0.2 + (n - from) * 0.09}s`;
        const ol = el('ol', 'bd-steps');
        steps.forEach(([t, m, items, note]) => {
          const s = el('li', n ? '' : 'first'), top = el('div', 'st');
          top.append(el('span', 'n', String(n + 1)), el('span', 't', t), el('span', 'm', span(m)));
          s.append(top);
          if (note) s.append(el('small', '', note));
          if (items) { const ul = el('ul', 'bd-need'); items.forEach(x => ul.append(el('li', '', x))); s.append(ul); }
          s.style.animationDelay = still ? '0s' : `${0.25 + (n - from) * 0.09}s`;
          ol.append(s); n++;
        });
        into.append(head, ol);
      });
      if (rest) {
        const all = `Show all ${p.steps.length} steps`, few = `Show the first ${shown} only`;
        const more = el('button', 'bd-more', all);
        more.type = 'button';
        rest.id = `bd-rest-${++folds}`;
        rest.hidden = true;
        more.setAttribute('aria-expanded', 'false');
        more.setAttribute('aria-controls', rest.id);
        more.style.animationDelay = still ? '0s' : `${0.25 + shown * 0.09}s`;
        more.addEventListener('click', () => {
          const open = rest.hidden;
          rest.hidden = !open;
          more.setAttribute('aria-expanded', String(open));
          more.textContent = open ? few : all;
          // folding it back up: keep the project in view rather than leaving you far down the page
          if (!open && li.getBoundingClientRect().top < 80) li.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
        });
        plan.append(rest, more);
        p.shown = shown;
      }
      li.append(plan);
    }
    p.li = li;
    return li;
  };

  let run = 0, folds = 0;
  const go = async (text, typed) => {
    const me = ++run;
    text = text.trim();
    if (!text) return;
    const { load, pieces } = read(text);
    list.textContent = ''; front.hidden = true; reply.hidden = true;
    mess.classList.remove('read');
    // what you said (typed out, the first time), Nu listening
    hold('Nu is listening…');
    if (typed && !still) {
      mess.classList.add('typing');
      for (let i = 1; i <= text.length; i++) { if (me !== run) return; mess.textContent = text.slice(0, i); await wait(i % 3 ? 16 : 30); }
      mess.classList.remove('typing');
      await wait(350);
    }
    // 2. Nu reads it: each piece marked and named, one after another
    const marks = markUp(text, pieces);
    hold('Nu is reading it…');
    await wait(250);
    mess.classList.add('read');
    for (const m of marks) { if (me !== run) return; m.classList.add('on'); await wait(430); }
    // sorted: a day and a length each, the big one broken into steps
    hold(null);
    if (load === 'overwhelmed' || load === 'busy' || pieces.some(p => p.kind === 'feel')) {
      reply.innerHTML = '';
      reply.append(el('b', '', 'Nu: '), document.createTextNode(load === 'busy' ? 'A full one. Here’s the order.' : 'That’s a lot. Here’s where to start.'));
      reply.hidden = false;
      await wait(450);
    }
    for (const p of pieces) {
      if (p.kind === 'feel') continue;
      if (me !== run) return;
      list.append(row(p));
      await wait(p.steps ? 500 + (p.shown ?? p.steps.length) * 90 : 380);
    }
    // where to start, in front
    await wait(400);
    const d = pick(pieces);
    if (!d || me !== run) return;
    front.querySelector('.bf-title').textContent = d.task.title;
    front.querySelector('.bf-fact').textContent = d.facts.slice(0, 2).join(' · ');
    const min = front.querySelector('.bf-min');
    min.replaceChildren();
    if (d.task.est_minutes) min.append(String(d.task.est_minutes), el('small', '', 'min'));
    front.hidden = false;
    front.style.animation = 'none'; void front.offsetWidth; front.style.animation = '';
    const p = d.task.piece;
    if (p && !p.steps && p.li) p.li.classList.add('picked');
  };

  // on view, once: its own mess, typed out and sorted
  const seed = mess.textContent;
  mess.textContent = '';
  let started = false;
  new IntersectionObserver(([e]) => {
    if (!e.isIntersecting || started) return;
    started = true;
    go(seed, true);
  }, { threshold: 0.35 }).observe(bd);
  bd.querySelector('.demo-form').addEventListener('submit', e => {
    e.preventDefault();
    const input = bd.querySelector('#mess');
    go(input.value, false); input.value = '';
  });
  bd.querySelectorAll('.demo-tries button').forEach(b => b.addEventListener('click', () => go(b.textContent, true)));
}

