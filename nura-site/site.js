// Nura — the site: the header hairline, sections easing in, the moving characters, the demos.

// the header gets its hairline once the page moves
const header = document.querySelector('header');
const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
onScroll(); addEventListener('scroll', onScroll, { passive: true });

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

  // The line, in the stage's own pixels: it climbs from the page's bottom
  // corners into the phone, crosses the horizon at Start and at Day ends,
  // and peaks under the greeting. A monotone curve through those points, so
  // it never overshoots.
  const smooth = (xs, ys) => {
    const n = xs.length, d = [], m = [];
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) {
      const h0 = xs[i] - xs[i - 1], h1 = xs[i + 1] - xs[i];
      m[i] = d[i - 1] * d[i] <= 0 ? 0 : 3 * (h0 + h1) / ((2 * h1 + h0) / d[i - 1] + (h1 + 2 * h0) / d[i]);
    }
    return x => {
      let i = 0; while (i < n - 2 && x > xs[i + 1]) i++;
      const h = xs[i + 1] - xs[i], t = Math.max(0, Math.min(1, (x - xs[i]) / h)), t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
    };
  };
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
    const rise = (hz - (live.querySelector('.day').getBoundingClientRect().top - s.top)) * 0.64;
    const foot = Math.min(H - 28, hz + Math.max(120, H * 0.45));   // where it starts and ends, low on the page
    const low = hz + (foot - hz) * 0.55;
    yAt = smooth([-30, x0 / 2, x0, C, x1, (x1 + W) / 2, W + 30], [foot, low, hz, hz - rise, hz, low, foot]);
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
  // a big thing's first steps (in the app, Nu plans these with you)
  const PLANS = [
    [/web ?site|\bsite\b|landing page|portfolio/i, [['List what’s left on the site', 15], ['Write the homepage copy', 45], ['Pick the photos', 20], ['Publish it', 15]]],
    [/offsite|trip|holiday|wedding|party|birthday/i, [['Pick two possible dates', 10], ['Ask who can come', 10], ['Book the place', 30], ['Send the plan round', 15]]],
    [/\btax/i, [['Find last year’s return', 15], ['Gather this year’s papers', 30], ['Fill in the numbers', 45], ['File it', 15]]],
    [/\bmov(e|ing)\b|house|flat|apartment/i, [['List what has to move', 20], ['Get two quotes', 30], ['Book the day', 10]]],
  ];
  const planOf = t => (PLANS.find(([re]) => re.test(t)) ?? [0, [['Write down what done looks like', 10], ['List the pieces', 15], ['Do the first piece', 25]]])[1];
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
      return { raw, words, d, est, guessed: !d.est_minutes, kind: project ? 'project' : 'task', when,
        tag: [project ? 'Project' : 'Task', when].filter(Boolean).join(' · '), steps: project ? planOf(words) : null };
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
  const row = p => {
    const li = el('li');
    li.append(el('b', '', p.d.title));
    const chips = el('div', 'chips-row');
    if (p.steps) chips.append(el('span', 'proj', 'Project'));
    if (p.when) chips.append(el('span', '', p.when));
    if (p.est) chips.append(el('span', '', `${p.guessed ? 'about ' : ''}${p.est} min`));
    const label = p.d.label && P.labelById(p.d.label);
    if (label) chips.append(el('span', '', label.name));
    li.append(chips);
    if (p.steps) {
      const ol = el('ol', 'bd-steps');
      p.steps.forEach(([t, m], i) => {
        const s = el('li', i ? '' : 'first', t); s.append(el('span', '', `${m} min`));
        s.style.animationDelay = still ? '0s' : `${0.25 + i * 0.22}s`;
        ol.append(s);
      });
      li.append(ol);
    }
    p.li = li;
    return li;
  };

  let run = 0;
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
      await wait(p.steps ? 1100 : 380);
    }
    // where to start, in front
    await wait(400);
    const d = pick(pieces);
    if (!d || me !== run) return;
    front.querySelector('.bf-title').textContent = d.task.title;
    front.querySelector('.bf-fact').textContent = d.facts.slice(0, 2).join(' · ');
    front.querySelector('.bf-min').innerHTML = d.task.est_minutes ? `${d.task.est_minutes}<small>min</small>` : '';
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

