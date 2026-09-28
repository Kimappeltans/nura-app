/* The story: one pinned SVG scene driven by scroll position.
   s = fractional step index (0 = water ... 6 = your day). Everything is a function of s
   (plus a small ambient time t for waves, stars and ripples). */
(() => {
  const saga = document.querySelector('.saga');
  if (!saga) return;
  const stage = saga.querySelector('.saga-stage');
  const svg = saga.querySelector('.saga-svg');
  const steps = [...saga.querySelectorAll('.saga-step')];
  const cards = steps.map((st) => st.querySelector('.saga-card'));
  const q = (sel) => svg.querySelector(sel);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ---------- helpers ----------
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ss = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (c1, c2, t) => {
    const a = rgb(c1), b = rgb(c2);
    return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t))).join(',')})`;
  };
  // stops: [[s, value], ...] (numbers or #hex colours), smoothstepped between stops
  const ramp = (stops, s) => {
    const isColor = typeof stops[0][1] === 'string';
    if (s <= stops[0][0]) return isColor ? mix(stops[0][1], stops[0][1], 0) : stops[0][1];
    for (let i = 0; i < stops.length - 1; i++) {
      const [s0, v0] = stops[i], [s1, v1] = stops[i + 1];
      if (s <= s1) {
        const t = ss(s0, s1, s);
        return isColor ? mix(v0, v1, t) : lerp(v0, v1, t);
      }
    }
    const last = stops[stops.length - 1][1];
    return isColor ? mix(last, last, 0) : last;
  };
  const set = (el, attrs) => { for (const k in attrs) el.setAttribute(k, attrs[k]); };
  // the sun's path: half-ellipse centred (800, 640), rx 240, ry 340. u = 0 (east) .. 1 (west)
  const pt = (u) => { const th = Math.PI * (1 - u); return { x: 800 + 240 * Math.cos(th), y: 640 - 340 * Math.sin(th) }; };

  // ---------- elements ----------
  const el = {
    skyTop: q('#sg-sky-top'), skyHor: q('#sg-sky-hor'), skyBot: q('#sg-sky-bot'),
    dawn: q('#sg-dawn'), stars: q('#sg-stars'),
    arc: q('#sg-arc'), arcDone: q('#sg-arc-done'), marks: q('#sg-arc-marks'),
    tasks: [...svg.querySelectorAll('.sg-task')], markText: [...svg.querySelectorAll('#sg-arc-marks text')],
    names: q('#sg-names'), nKhepri: q('#sg-n-khepri'), nRa: q('#sg-n-ra'), nAtum: q('#sg-n-atum'),
    sun: q('#sg-sun'), sunDisc: q('#sg-sun-disc'),
    far: q('#sg-far'), obBody: q('#sg-ob-body'), obTip: q('#sg-ob-tip'), obGlint: q('#sg-ob-glint'),
    obL: q('#sg-ob-l'), obR: q('#sg-ob-r'),
    pyr: q('#sg-pyr'), cap: q('#sg-cap'), capLabel: q('#sg-cap-label'),
    waterBack: q('#sg-water-back'), glint: q('#sg-glint'), nu: q('#sg-nu'),
    mound: q('#sg-mound'), benben: q('#sg-benben'),
    water: q('#sg-water'), waterTop: q('#sg-water-top'), waterBot: q('#sg-water-bot'),
    ripples: q('#sg-ripples'), ra: q('#sg-ra'), labels: q('#sg-labels'), lRa: q('#sg-l-ra'),
  };
  const pyrLen = el.pyr.getTotalLength();
  el.pyr.style.strokeDasharray = pyrLen;
  const arcLen = el.arcDone.getTotalLength();
  el.arcDone.style.strokeDasharray = arcLen;

  // stars (seeded so they never jump)
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const NS = 'http://www.w3.org/2000/svg';
  const stars = Array.from({ length: 130 }, () => {
    const c = document.createElementNS(NS, 'circle');
    const r = rnd() < 0.12 ? 2.2 : 0.8 + rnd() * 1.1;
    set(c, { cx: (-1600 + rnd() * 4800).toFixed(1), cy: (10 + Math.pow(rnd(), 1.4) * 560).toFixed(1), r, fill: '#DCE4FF' });
    el.stars.appendChild(c);
    return { c, base: 0.35 + rnd() * 0.65, sp: 0.6 + rnd() * 1.8, ph: rnd() * 6.28 };
  });
  const ripples = Array.from({ length: 3 }, () => {
    const e = document.createElementNS(NS, 'ellipse');
    el.ripples.appendChild(e);
    return e;
  });

  // ---------- framing: keep the composition in view at any aspect ratio ----------
  let vb = { x: 0, w: 1600 }, small = false;
  const waterG = q('#sg-waterg');
  const frame = () => {
    const hdr = document.querySelector('header');
    const hdrH = hdr && /sticky|fixed/.test(getComputedStyle(hdr).position) ? hdr.offsetHeight : 0;
    saga.style.setProperty('--hdr', hdrH + 'px');
    const r = stage.getBoundingClientRect();
    const sw = Math.max(1, r.width), sh = Math.max(1, r.height);
    let H, y0, cx; // cx = screen x (px) where the composition's centre (790) lands
    if (sw >= 900) {
      // text sits in a left column: put the scene in the space to its right
      const card = steps[0].querySelector('.saga-card').getBoundingClientRect();
      const left = card.right + 32, room = Math.max(240, sw - left);
      H = Math.max(640, (640 * sh) / (0.92 * room));
      y0 = 645 - 0.74 * H; // the horizon low, so the text has the sky to itself
      cx = left + room / 2;
    } else {
      // The text is read over the water, so the water is only as high as the text needs:
      // the horizon sits just above where the tallest passage starts, with room under it
      // for the two rows of labels. The scene is a little bigger too (620 units across).
      H = Math.max(1000, (620 * sh) / sw);
      const vh = window.innerHeight, line = vh * 0.55;
      let top = Infinity;                       // the highest a passage's text reaches where it's read
      steps.forEach((st) => {
        const cd = st.querySelector('.saga-card');
        if (!cd) return;
        const pb = parseFloat(getComputedStyle(st).paddingBottom) || 0;
        top = Math.min(top, line + st.offsetHeight / 2 - pb - cd.offsetHeight);
      });
      const text = (Number.isFinite(top) ? top : vh * 0.62) - hdrH;   // in the stage's own pixels
      const hz = Math.max(0.4 * sh, Math.min(0.62 * sh, text - (104 * sh) / H - 10));
      // never lower than the pyramid's tip (232) with air above it: on a short or
      // wide-ish window the top of the pyramid was cut off under the header
      y0 = Math.min(645 - (hz / sh) * H, 190);
      cx = sw / 2;
      // the water deepens behind the text only, not over what stands on it
      stage.style.setProperty('--sg-scrim-h', Math.round(sh - text + 64) + 'px');
    }
    small = sw < 900;
    // the names under the figures: closer to them on a small screen, where the text follows soon after
    svg.querySelectorAll('#sg-labels text:not(#sg-l-ra)').forEach((tx) => tx.setAttribute('y', small ? 738 : 780));
    const k = H / sh, W = sw * k;
    vb = { x: 790 - cx * k, w: W, y0, H };
    svg.setAttribute('viewBox', `${vb.x.toFixed(1)} ${y0.toFixed(1)} ${W.toFixed(1)} ${H.toFixed(1)}`);
    waterG.setAttribute('y2', (y0 + H).toFixed(1));
  };

  // ---------- scroll -> s ----------
  const progress = () => {
    const line = window.innerHeight * 0.55;
    const c = steps.map((st) => { const r = st.getBoundingClientRect(); return r.top + r.height / 2; });
    if (line <= c[0]) return 0;
    for (let i = 0; i < c.length - 1; i++) {
      if (line < c[i + 1]) return i + (line - c[i]) / (c[i + 1] - c[i]);
    }
    return c.length - 1;
  };

  const wave = (L, a1, a2, ph) => {
    const x0 = Math.floor(vb.x - 40), x1 = Math.ceil(vb.x + vb.w + 40);
    let d = `M${x0} 1700 L${x0} ${L.toFixed(1)}`;
    for (let x = x0; x <= x1; x += 16) {
      const y = L + a1 * Math.sin(x * 0.011 + ph) + a2 * Math.sin(x * 0.027 - ph * 1.6);
      d += ` L${x} ${y.toFixed(1)}`;
    }
    return d + ` L${x1} 1700 Z`;
  };

  // ---------- draw ----------
  let lastDay = null;
  const draw = (s, t) => {
    const D = ss(4.5, 5.1, s); // night -> day

    // sky
    el.skyTop.setAttribute('stop-color', ramp([[0, '#05081A'], [3.8, '#070B22'], [4.3, '#161B48'], [4.7, '#5A3C77'], [5.05, '#F1CDB9'], [5.6, '#FAF1E6']], s));
    const hor = ramp([[0, '#0E1640'], [3.8, '#111A4A'], [4.3, '#2E3480'], [4.7, '#E0806A'], [5.05, '#FFC8A6'], [5.6, '#FFDCC4']], s);
    el.skyHor.setAttribute('stop-color', hor);
    el.skyBot.setAttribute('stop-color', hor);
    el.dawn.setAttribute('opacity', ramp([[3.6, 0], [4.1, 0.35], [4.6, 1], [5.2, 0.6], [5.8, 0.35]], s).toFixed(3));

    const starO = ramp([[0, 1], [4.0, 1], [4.8, 0]], s);
    el.stars.setAttribute('opacity', starO.toFixed(3));
    if (starO > 0.01) for (const st of stars) st.c.setAttribute('opacity', (st.base * (0.6 + 0.4 * Math.sin(t * st.sp + st.ph))).toFixed(2));

    // water level: high, then the flood goes down
    const L = ramp([[0, 560], [0.4, 564], [1.2, 640], [6.5, 650]], s);

    // far shore + mound colours
    el.far.setAttribute('fill', ramp([[0, '#0C1336'], [4.3, '#1E2150'], [5.0, '#D8A988'], [5.6, '#E9C6A4']], s));
    el.far.setAttribute('opacity', ss(0.5, 1.2, s).toFixed(3));
    el.mound.setAttribute('fill', ramp([[0, '#141C4C'], [4.3, '#20255A'], [5.0, '#C99772'], [5.6, '#DDB08A']], s));

    // Nu under the surface, then peeking out
    const nuY = L + lerp(40, -128, ss(0.5, 1.5, s)) + Math.sin(t * 1.2) * 3;
    el.nu.setAttribute('y', nuY.toFixed(1));
    const glintO = (1 - ss(0.8, 1.3, s)) * (0.55 + 0.35 * Math.sin(t * 1.6));
    set(el.glint, { cy: (L - 2).toFixed(1), opacity: glintO.toFixed(3) });

    // the Benben rises out of the water
    const rise = ss(1.4, 2.0, s);
    set(el.benben, { y: (424 + (1 - rise) * 190 + Math.sin(t * 0.9) * (rise > 0.99 ? 2 : 0)).toFixed(1), opacity: ss(1.4, 1.7, s).toFixed(3) });

    // the pyramid outline and its capstone
    const draw3 = ss(2.4, 3.0, s), fade3 = 1 - ss(3.6, 4.1, s);
    el.pyr.style.strokeDashoffset = (pyrLen * (1 - draw3)).toFixed(1);
    el.pyr.setAttribute('opacity', (draw3 > 0 ? 0.85 * fade3 : 0).toFixed(3));
    const capO = ss(2.8, 3.1, s) * fade3;
    el.cap.setAttribute('opacity', capO.toFixed(3));
    el.capLabel.setAttribute('opacity', capO.toFixed(3));

    // Heliopolis: the obelisk rises, first light finds its tip
    const obRise = ss(3.4, 4.0, s);
    el.obBody.setAttribute('transform', `translate(0 ${((1 - obRise) * 340).toFixed(1)})`);
    el.obL.setAttribute('stop-color', ramp([[0, '#2A3572'], [4.4, '#3A3F7A'], [5.2, '#E6BE94']], s));
    el.obR.setAttribute('stop-color', ramp([[0, '#18204C'], [4.4, '#24285A'], [5.2, '#C9976E']], s));
    const lit = ss(3.75, 4.05, s);
    el.obTip.setAttribute('fill', mix('#16204F', '#FFB547', lit));
    el.obGlint.setAttribute('opacity', (lit * (1 - ss(5.4, 5.9, s)) * (0.8 + 0.2 * Math.sin(t * 2))).toFixed(3));

    // water (drawn over Nu and the mound)
    el.waterTop.setAttribute('stop-color', ramp([[0, '#0C1850'], [4.2, '#1A2A78'], [5.0, '#6F8FD8'], [5.6, '#A9C0EE']], s));
    el.water.setAttribute('opacity', ramp([[0, 0.9], [1.5, 0.86], [5.5, 0.9]], s).toFixed(3));
    waterG.setAttribute('y1', (L - 4).toFixed(1));
    el.water.setAttribute('d', wave(L, 5, 3, t * 1.1));
    const waterBot = ramp([[0, '#05081A'], [4.2, '#0A1030'], [5.0, '#D9CFE0'], [5.6, '#FFFFFF']], s);
    el.waterBot.setAttribute('stop-color', waterBot);
    el.waterBack.setAttribute('fill', ramp([[0, '#132066'], [5.0, '#8AA6E6'], [5.6, '#C4D3F3']], s));
    el.waterBack.setAttribute('d', wave(L - 7, 4, 2.5, t * 0.8 + 2));

    // ripples around the Benben
    const rp = ss(1.6, 2.0, s);
    const rc = mix('#9FB8FF', '#FFFFFF', D);
    ripples.forEach((e, i) => {
      const k = (t * 0.22 + i / 3) % 1;
      const rx = 100 + k * 280;
      set(e, { cx: 800, cy: (L + 3).toFixed(1), rx: rx.toFixed(1), ry: (rx * 0.085).toFixed(1), stroke: rc, opacity: ((1 - k) * 0.55 * rp).toFixed(3) });
    });

    // the sun crosses the sky: Khepri, Ra, Atum
    const u = ramp([[4.45, -0.12], [4.8, 0.1], [5.2, 0.5], [5.55, 0.95]], s);
    const sp = pt(u);
    el.sun.setAttribute('transform', `translate(${sp.x.toFixed(1)} ${sp.y.toFixed(1)})`);
    el.sun.setAttribute('opacity', (ss(4.4, 4.55, s) * (1 - ss(5.5, 5.65, s))).toFixed(3));
    el.sunDisc.setAttribute('fill', mix('#FF8A3D', '#FFC24D', clamp(1 - Math.abs(u - 0.5) * 2)));

    const arcCol = mix('#8FA9FF', '#B98E72', D);
    el.arc.setAttribute('stroke', arcCol);
    el.arc.setAttribute('opacity', ss(4.5, 4.8, s).toFixed(3));
    const nameCol = mix('#F4F2FF', '#4A4340', D);
    el.names.setAttribute('fill', nameCol);
    el.names.setAttribute('opacity', (ss(4.7, 4.9, s) * (1 - ss(5.5, 5.65, s))).toFixed(3));
    const pK = pt(0.2), pR = pt(0.5), pA = pt(0.8);
    set(el.nKhepri, { x: (pK.x + 22).toFixed(1), y: (pK.y - 30).toFixed(1), 'text-anchor': 'start' });
    set(el.nRa, { x: pR.x, y: (pR.y - 70).toFixed(1) });
    set(el.nAtum, { x: (pA.x - 28).toFixed(1), y: (pA.y - 30).toFixed(1), 'text-anchor': 'end' });

    // a new day: Ra rides the arc, which is now your day
    const uRa = ramp([[5.6, 0.02], [6.0, 0.38]], s);
    const rp2 = pt(uRa);
    set(el.ra, {
      x: (rp2.x - 75).toFixed(1),
      y: (rp2.y - 75 + Math.sin(t * 1.4) * 3).toFixed(1),
      opacity: ss(5.55, 5.75, s).toFixed(3),
    });
    el.arcDone.setAttribute('opacity', ss(5.6, 5.8, s).toFixed(3));
    el.arcDone.style.strokeDashoffset = (arcLen * (1 - uRa)).toFixed(1);
    el.marks.setAttribute('opacity', ss(5.65, 5.9, s).toFixed(3));
    [0.18, 0.5, 0.74].forEach((tu, i) => {
      const p = pt(tu);
      set(el.tasks[i], { cx: p.x.toFixed(1), cy: p.y.toFixed(1), fill: tu <= uRa ? '#FF6B35' : '#E3CFBF', stroke: '#FFFFFF', 'stroke-width': 3 });
    });
    el.markText.forEach((tx) => tx.style.fill = mix('#8FA9FF', '#7B7360', D));
    el.labels.setAttribute('opacity', ss(5.8, 6.0, s).toFixed(3));
    set(el.lRa, { x: (rp2.x - 92).toFixed(1), y: (rp2.y + 8).toFixed(1), 'text-anchor': 'end' });

    // the text follows the sky, light on the night and dark on the day, with no jump between
    const tone = ss(4.6, 5.0, s);
    saga.style.setProperty('--sg-fg', mix('#FFFFFF', '#171313', tone));
    saga.style.setProperty('--sg-fg2', mix('#E6E6F2', '#2E2826', tone));
    saga.style.setProperty('--sg-mh', mix('#9A9EC0', '#8A806C', tone));
    saga.style.setProperty('--sg-scrim', waterBot);

    // each passage is fully there while it's the one in the middle, and fades as the next arrives.
    // On a small screen it's read over the water, so it goes before it climbs over what stands there.
    cards.forEach((cd, i) => {
      if (!cd) return;
      const d = s - i;
      cd.style.opacity = (1 - (small && d > 0 ? ss(0.12, 0.42, d) : ss(0.25, 0.7, Math.abs(d)))).toFixed(3);
    });

    const day = D > 0.5;
    if (day !== lastDay) { saga.classList.toggle('is-day', day); lastDay = day; }
  };

  // ---------- loop ----------
  let visible = true, raf = 0, t0 = performance.now();
  const tick = (now) => {
    raf = 0;
    const t = reduce.matches ? 0 : (now - t0) / 1000;
    draw(progress(), t);
    if (visible && !reduce.matches) raf = requestAnimationFrame(tick);
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };

  new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) kick(); }).observe(saga);
  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('resize', () => { frame(); kick(); });
  reduce.addEventListener?.('change', kick);
  frame();
  draw(progress(), 0);
  kick();
})();
