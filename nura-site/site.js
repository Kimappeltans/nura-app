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
  document.querySelectorAll('img[data-clip]').forEach(img => movers.observe(img));
}

// Box 01: the loose thoughts fall into a pile when it comes into view — again each time
document.querySelectorAll('.mess').forEach(pile => {
  if (still) { pile.classList.add('go'); return; }
  new IntersectionObserver(([e]) => {
    if (e.intersectionRatio >= 0.6) pile.classList.add('go');
    else if (!e.isIntersecting) pile.classList.remove('go');
  }, { threshold: [0, 0.6] }).observe(pile);
});

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
