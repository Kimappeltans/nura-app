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
    <path class="ahead" fill="none" stroke="#171313" stroke-opacity=".2" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="1.5 7"/>
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

  // The line, in the stage's own pixels: a hill whose top is the phone's day.
  // It crosses the horizon at Start and at Day ends, peaks under the
  // greeting, and levels off low across the page on either side.
  let pts = [], total = 0, from = 0, to = 0, yAt = () => 0;
  const lay = () => {
    const s = stage.getBoundingClientRect();
    const mid = el => { const b = live.querySelector(el).getBoundingClientRect(); return [b.left + b.width / 2 - s.left, b.top + b.height / 2 - s.top]; };
    const [x0, hz] = mid('.day .s'), [x1] = mid('.day .e');
    const W = s.width, H = s.height, C = (x0 + x1) / 2, half = (x1 - x0) / 2;
    const rise = (hz - (live.querySelector('.day').getBoundingClientRect().top - s.top)) * 0.64;
    const low = Math.min(H - 24 - hz, Math.max(80, W * 0.085));  // how far under the horizon it runs across the page
    const sigma = half / Math.sqrt(2 * Math.log((low + rise) / low));
    yAt = x => hz + low - (low + rise) * Math.exp(-(((x - C) / sigma) ** 2) / 2);
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
    const k = Math.min(1, live.offsetWidth / 340);
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
  lay();
  if (still) {
    place(0.5);
    slots.forEach((_, i) => { landed[i] = true; put(i); });
    chips.forEach(c => c.classList.add('fly'));
  } else {
    const scrolled = () => {
      const travel = Math.max(360, stage.offsetTop + stage.offsetHeight * 0.7 - innerHeight * 0.4);
      return Math.min(1, Math.max(0, scrollY / travel));
    };
    let dawn = 0, queued = false;
    const draw = () => { queued = false; const p = Math.max(dawn, scrolled()); place(p); reach(p); };
    const ask = () => { if (!queued) { queued = true; requestAnimationFrame(draw); } };
    addEventListener('scroll', ask, { passive: true });
    addEventListener('resize', () => { lay(); place(at); ask(); });
    // on arrival the sun comes up over the edge of the page, not yet to the first thing
    const t0 = performance.now(), RISE_MS = 1800, RISE_TO = 0.12;
    const rise = now => { const k = Math.min(1, (now - t0) / RISE_MS); dawn = RISE_TO * (1 - Math.pow(1 - k, 3)); draw(); if (k < 1) requestAnimationFrame(rise); };
    place(0); requestAnimationFrame(rise);
  }
  // the phone's layout settles with the fonts: draw the line again once they're in
  if (document.fonts) document.fonts.ready.then(() => { lay(); place(at); });
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

// The live demo: messy lines fall into a pile, the app's own parser sorts them
// (assets/nura-parser.js, built from src/assistant.ts), and the next move rises.
const demo = document.querySelector('.demo');
if (demo && window.NuraParser) {
  const P = window.NuraParser;
  const pile = demo.querySelector('.pile'), list = demo.querySelector('.demo-list'), front = demo.querySelector('.demo-front');
  const items = [];                                         // what Nu holds, newest first
  const SPOTS = [[4, 4, -3], [46, 4, 4], [8, 34, 6], [50, 32, -7], [18, 64, -4], [42, 94, 8]];
  let slot = 0;
  const clock = ms => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const dayWord = ms => {
    const d = new Date(ms).toDateString(), t = new Date(), t1 = new Date(); t1.setDate(t.getDate() + 1);
    return d === t.toDateString() ? 'Today' : d === t1.toDateString() ? 'Tomorrow' : new Date(ms).toLocaleDateString([], { weekday: 'long' });
  };
  const chipsOf = d => {
    const c = [];
    if (d.due_at) c.push(dayWord(d.due_at) + (d.has_time ? ` · ${clock(d.due_at)}` : ''));
    if (d.est_minutes) c.push(d.est_minutes < 60 ? `${d.est_minutes} min` : `${Math.round(d.est_minutes / 6) / 10} hr`);
    const l = d.label && P.labelById(d.label); if (l) c.push(l.name);
    return c;
  };
  // the one in front: the smallest thing that has a length, else the newest
  const pickOne = () => items.filter(d => d.est_minutes).sort((a, b) => a.est_minutes - b.est_minutes)[0] ?? items[0];
  const render = () => {
    const p = pickOne();
    list.innerHTML = '';
    items.filter(d => d !== p).slice(0, 5).forEach(d => {
      const li = document.createElement('li'), b = document.createElement('b'), row = document.createElement('div');
      b.textContent = d.title; row.className = 'chips-row';
      const c = chipsOf(d);
      (c.length ? c : ['Held until it fits']).forEach(t => { const s = document.createElement('span'); s.textContent = t; if (!c.length) s.className = 'held'; row.appendChild(s); });
      li.append(b, row); list.appendChild(li);
    });
    if (!p) return;
    front.hidden = false;
    front.querySelector('.df-title').textContent = p.title;
    const anchors = items.filter(d => d !== p && d.has_time && d.due_at).map(d => d.due_at);
    front.querySelector('.df-fact').textContent = P.factLine({ ...p, id: 'demo' }, anchors, 23 * 60) || '';
    front.querySelector('.df-min').innerHTML = p.est_minutes ? `${p.est_minutes}<small>min</small>` : '';
    front.style.animation = 'none'; void front.offsetWidth; front.style.animation = '';
  };
  const drop = (text, delay) => {
    const [l, b, r] = SPOTS[slot++ % SPOTS.length];
    const s = document.createElement('span');
    s.textContent = text;
    s.style.setProperty('--l', `${l}%`); s.style.setProperty('--b', `${b}px`); s.style.setProperty('--r', `${r}deg`);
    s.style.animationDelay = `${delay}ms`;
    pile.appendChild(s);
    return s;
  };
  const sortIn = (pill, text) => {
    const d = P.parseTask(text);
    pill.classList.add('away'); setTimeout(() => pill.remove(), 400);
    if (d && d.title) { items.unshift(d); render(); }
  };
  const tell = text => {
    text = text.trim(); if (!text) return;
    const pill = drop(text, 0);
    setTimeout(() => sortIn(pill, text), still ? 0 : 1300);
  };
  // on view, once: the mess falls in, then sorts itself
  const SEED = ['board deck by friday 2h', 'call accountant tmrw 9am', 'renew passport', 'prep for investor call mon 10am 30 min', 'reply to Dana about the contract 10 min'];
  let started = false;
  new IntersectionObserver(([e]) => {
    if (!e.isIntersecting || started) return;
    started = true;
    const pills = SEED.map((t, i) => drop(t, still ? 0 : i * 170));
    const settle = still ? 0 : SEED.length * 170 + 1200;
    SEED.forEach((t, i) => setTimeout(() => sortIn(pills[i], t), settle + (still ? 0 : i * 380)));
  }, { threshold: 0.35 }).observe(demo);
  demo.querySelector('.demo-form').addEventListener('submit', e => {
    e.preventDefault();
    const input = demo.querySelector('#mess'); tell(input.value); input.value = '';
  });
  demo.querySelectorAll('.demo-tries button').forEach(b => b.addEventListener('click', () => tell(b.textContent)));
}
