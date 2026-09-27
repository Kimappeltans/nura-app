// Nura — the site: the header hairline, the dotted sun, sections easing in, the moving characters.

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
      state.className = 'form-state ok'; state.textContent = "You're on the list. We'll write when early access opens.";
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
  const SEED = ['proposal outline by friday 2h', 'call mum tmrw 6pm', 'renew passport', 'slides for monday 45 min', 'reply to Sam 10 min'];
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
