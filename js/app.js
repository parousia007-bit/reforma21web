// ==========================================================================
// REFORMA 2.1 · Lógica del index
// Dependencias opcionales (CDN): GSAP (+ ScrollTrigger, SplitText), Lenis,
// vanilla-tilt, Lucide y DOMPurify. Si alguna no carga, la página sigue
// funcionando con su versión básica.
// ==========================================================================

window.__appReady = true;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const hasGSAP = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
let lenis = null;

function navOffset() {
  return (document.getElementById('nav')?.offsetHeight || 64) + 12;
}

// Desplazamiento a un elemento: usa Lenis si está activo, si no el scroll nativo
function scrollToEl(target, offset = navOffset()) {
  if (lenis) return lenis.scrollTo(target, { offset: -offset, duration: 1.4 });
  window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - offset, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
}

function renderIcons(root) {
  if (window.lucide) lucide.createIcons({ attrs: { 'aria-hidden': 'true' }, ...(root ? { root } : {}) });
}

function sanitize(text) {
  const str = String(text ?? '');
  if (window.DOMPurify) return DOMPurify.sanitize(str, { ALLOWED_TAGS: [] });
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// Solo aceptamos colores hex o var(--x) para evitar inyección en atributos style
function safeColor(value, fallback = 'var(--gold)') {
  const v = String(value || '').trim();
  return /^#[0-9a-f]{3,8}$/i.test(v) || /^var\(--[a-z0-9-]+\)$/i.test(v) ? v : fallback;
}

function safeUrl(value) {
  try {
    const u = new URL(value, window.location.href);
    return ['http:', 'https:'].includes(u.protocol) ? u.href : '';
  } catch { return ''; }
}

// Telemetría de conversiones (se refleja en el dashboard: whatsapp / beca)
function trackInteraction(type, buttonName) {
  fetch('/api/metrics/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ article_id: null, event_type: type, button_name: buttonName }),
    keepalive: true
  }).catch(() => {});
}

// --------------------------------------------------------------------------
// 1. Fondo de constelaciones (con brillo suave)
// --------------------------------------------------------------------------
(function stars() {
  const canvas = document.createElement('canvas');
  canvas.id = 'stars-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(canvas, document.body.firstChild);
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let width, height, stars = [], links = [];
  // Posición del cursor (solo con mouse); las estrellas cercanas se conectan y se apartan
  const mouse = { x: -9999, y: -9999, active: false };
  const RADIUS = 170, LINK = 120;
  if (finePointer && !prefersReducedMotion) {
    window.addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true; }, { passive: true });
    document.addEventListener('pointerleave', () => { mouse.active = false; });
  }

  let seed = 42;
  const random = () => { const x = Math.sin(seed++) * 10000; return x - Math.floor(x); };

  function build() {
    seed = 42;
    const count = Math.round(Math.min(160, (width * height) / 9000));
    stars = Array.from({ length: count }, () => {
      const type = Math.floor(random() * 6);
      return {
        x: random() * width,
        y: random() * height,
        r: (random() * 1.2 + 0.5) * (type === 0 ? 1.6 : 1),
        color: type === 0 ? '226,176,79' : type === 1 ? '90,140,220' : '255,255,255',
        base: type === 0 ? 0.85 : type === 1 ? 0.7 : 0.45,
        glow: type === 0,
        phase: random() * Math.PI * 2,
        speed: 0.4 + random() * 0.8,
        ox: 0, oy: 0 // desplazamiento animado respecto a su posición base
      };
    });
    // Constelaciones fijas: cada estrella dorada se une a sus dos vecinas más cercanas
    links = [];
    stars.forEach((s, i) => {
      if (!s.glow) return;
      stars.map((o, j) => [j, Math.hypot(o.x - s.x, o.y - s.y)])
        .filter(([j, d]) => j !== i && d < 160)
        .sort((a, b) => a[1] - b[1])
        .slice(0, 2)
        .forEach(([j]) => links.push([i, j]));
    });
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
    draw(0);
  }

  function drawLinks() {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(226,176,79,0.10)';
    ctx.lineWidth = 0.6;
    for (const [i, j] of links) {
      const a = stars[i], b = stars[j];
      ctx.moveTo(a.x + a.ox, a.y + a.oy);
      ctx.lineTo(b.x + b.ox, b.y + b.oy);
    }
    ctx.stroke();
  }

  function draw(t) {
    ctx.clearRect(0, 0, width, height);
    const near = [];

    // Las estrellas cerca del cursor se apartan suavemente; las demás vuelven a su sitio
    for (const s of stars) {
      let tx = 0, ty = 0;
      if (mouse.active) {
        const dx = s.x - mouse.x, dy = s.y - mouse.y;
        const d = Math.hypot(dx, dy);
        if (d < RADIUS) {
          const push = (1 - d / RADIUS) * 18;
          tx = (dx / (d || 1)) * push;
          ty = (dy / (d || 1)) * push;
          near.push(s);
        }
      }
      s.ox += (tx - s.ox) * 0.08;
      s.oy += (ty - s.oy) * 0.08;
    }

    drawLinks();

    // Hilos dorados entre las estrellas que rodean al cursor
    for (let i = 0; i < near.length; i++) {
      const a = near[i];
      const ax = a.x + a.ox, ay = a.y + a.oy;
      const fa = 1 - Math.hypot(ax - mouse.x, ay - mouse.y) / RADIUS;
      ctx.beginPath();
      ctx.strokeStyle = `rgba(226,176,79,${Math.max(0, fa) * 0.35})`;
      ctx.lineWidth = 0.6;
      ctx.moveTo(ax, ay);
      ctx.lineTo(mouse.x, mouse.y);
      ctx.stroke();
      for (let j = i + 1; j < near.length; j++) {
        const b = near[j];
        const bx = b.x + b.ox, by = b.y + b.oy;
        const d = Math.hypot(ax - bx, ay - by);
        if (d < LINK) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(226,176,79,${(1 - d / LINK) * fa * 0.5})`;
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
      }
    }

    for (const s of stars) {
      const x = s.x + s.ox, y = s.y + s.oy;
      const a = prefersReducedMotion ? s.base : s.base * (0.65 + 0.35 * Math.sin(t / 1000 * s.speed + s.phase));
      if (s.glow) {
        ctx.beginPath();
        ctx.fillStyle = `rgba(${s.color},${a * 0.15})`;
        ctx.arc(x, y, s.r * 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.fillStyle = `rgba(${s.color},${a})`;
      ctx.arc(x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  let running = true;
  function loop(t) {
    if (!running) return;
    draw(t);
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  resize();
  if (!prefersReducedMotion) {
    document.addEventListener('visibilitychange', () => {
      running = document.visibilityState === 'visible';
      if (running) requestAnimationFrame(loop);
    });
    requestAnimationFrame(loop);
  }
})();

// --------------------------------------------------------------------------
// 2. Navegación, menú móvil y scroll
// --------------------------------------------------------------------------
(function navigation() {
  const nav = document.getElementById('nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const burger = document.getElementById('burger');
  const mobMenu = document.getElementById('mob-menu');
  const setOpen = (open) => {
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    mobMenu.classList.toggle('open', open);
  };
  const isOpen = () => burger.getAttribute('aria-expanded') === 'true';
  burger.addEventListener('click', () => setOpen(!isOpen()));
  mobMenu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('click', e => { if (isOpen() && !nav.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) setOpen(false); });

  // Scroll suave con compensación del nav fijo
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.classList.contains('app-trigger')) return;
    const id = a.getAttribute('href');
    const target = id.length > 1 && document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    scrollToEl(target);
    history.replaceState(null, '', id);
  });

  // Resaltar la sección activa en el menú
  const links = [...document.querySelectorAll('.nav-links a[href^="#"]')];
  if ('IntersectionObserver' in window) {
    const spy = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + entry.target.id));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    links.forEach(l => { const s = document.querySelector(l.getAttribute('href')); if (s) spy.observe(s); });
  }

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();

// --------------------------------------------------------------------------
// 3. Animaciones: GSAP si está disponible, IntersectionObserver si no
// --------------------------------------------------------------------------
const revealIO = 'IntersectionObserver' in window
  ? new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('visible'); revealIO.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' })
  : null;

function observeReveals(root = document) {
  const els = root.querySelectorAll('.reveal:not(.visible)');
  els.forEach((el, i) => {
    el.style.transitionDelay = (i % 4) * 0.08 + 's';
    revealIO ? revealIO.observe(el) : el.classList.add('visible');
  });
}

// Scroll suave (Lenis) sincronizado con ScrollTrigger
(function smoothScroll() {
  if (!hasGSAP || prefersReducedMotion || typeof window.Lenis === 'undefined') return;
  gsap.registerPlugin(ScrollTrigger);
  lenis = new Lenis({ duration: 1.15, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(time => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
})();

(function heroIntro() {
  if (!hasGSAP || prefersReducedMotion) return;
  gsap.registerPlugin(ScrollTrigger);

  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  tl.from('[data-hero-line]', { yPercent: 110, duration: 1.4, stagger: 0.12 })
    .from('[data-hero]', { y: 24, opacity: 0, duration: 1.1, stagger: 0.1 }, '-=1.1')
    .from('[data-hero-stagger] > *', { y: 30, opacity: 0, duration: 1, stagger: 0.08 }, '-=0.8');

  // Parallax suave del hero al hacer scroll
  gsap.to('.hero-inner', {
    yPercent: -8, opacity: 0.35, ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
  });
  gsap.to('.ambient', {
    yPercent: 15, ease: 'none',
    scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: true }
  });
})();

// --------------------------------------------------------------------------
// 3b. Motivo básico religioso: creación, caída y redención (sección fijada)
// --------------------------------------------------------------------------
(function story() {
  const section = document.querySelector('.story');
  if (!section || !hasGSAP || prefersReducedMotion) return; // sin GSAP: bloques apilados normales
  section.classList.add('is-pinned');

  // SplitText mide las letras: esperamos a las fuentes reales (máx. 3 s) para no medir con la provisional
  const fontsReady = document.fonts ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))]) : Promise.resolve();
  fontsReady.then(() => buildStory(section));
})();

function buildStory(section) {

  const panels = [...section.querySelectorAll('.story-panel')];
  const steps = [...section.querySelectorAll('.story-steps li')];
  const bar = section.querySelector('.story-progress span');
  const hasSplit = typeof window.SplitText !== 'undefined';
  if (hasSplit) gsap.registerPlugin(SplitText);

  // Divide cada palabra grande en letras y cada frase en palabras
  const parts = panels.map(panel => {
    const word = panel.querySelector('.story-word');
    const chars = hasSplit ? SplitText.create(word, { type: 'chars', mask: 'chars' }).chars : [word];
    const line = panel.querySelector('.story-line');
    const words = hasSplit ? SplitText.create(line, { type: 'words', mask: 'words' }).words : [line];
    const rest = panel.querySelectorAll('.story-n, .story-text, .story-cta');
    return { panel, chars, words, rest };
  });

  const setActive = (i) => {
    steps.forEach((li, k) => li.classList.toggle('is-active', k === i));
    section.style.setProperty('--story-c', getComputedStyle(panels[i]).getPropertyValue('--c'));
  };
  setActive(0);

  const tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    scrollTrigger: {
      trigger: section,
      start: 'top top',
      end: () => '+=' + window.innerHeight * panels.length * 0.9,
      pin: '.story-stage',
      scrub: 0.8,
      anticipatePin: 1,
      onUpdate: self => {
        if (bar) bar.style.transform = `scaleX(${self.progress})`;
        setActive(Math.min(panels.length - 1, Math.floor(self.progress * panels.length * 0.999)));
      }
    }
  });

  // Animación de entrada de un acto (letras, palabras y texto)
  const intro = (target, { chars, words, rest }, at) => target
    .from(chars, { yPercent: 110, rotate: 4, duration: 1, stagger: 0.04 }, at)
    .from(words, { yPercent: 100, opacity: 0, duration: 0.8, stagger: 0.05 }, '<0.25')
    .from(rest, { y: 30, opacity: 0, duration: 0.8, stagger: 0.12 }, '<0.2');

  // El primer acto entra solo al aparecer la sección (no depende del scroll),
  // para que nunca se vea el escenario vacío.
  gsap.set(parts[0].panel, { visibility: 'visible' });
  intro(gsap.timeline({ defaults: { ease: 'expo.out' }, scrollTrigger: { trigger: section, start: 'top 75%' } }), parts[0], 0);

  parts.forEach((part, i) => {
    const { panel } = part;
    if (i > 0) intro(tl.set(panel, { visibility: 'visible' }, '>'), part, '<');
    tl.to({}, { duration: 1.2 }); // pausa de lectura

    if (i < parts.length - 1) {
      tl.to(panel, { yPercent: -12, opacity: 0, filter: 'blur(6px)', duration: 0.8, ease: 'power2.in' })
        .set(panel, { visibility: 'hidden' });
    }
  });
  ScrollTrigger.refresh();
}

// --------------------------------------------------------------------------
// 3c. Fondo de luz con shader WebGL (aurora dorada y azul tras el título)
// --------------------------------------------------------------------------
(function aurora() {
  const canvas = document.getElementById('hero-aurora');
  if (!canvas) return;
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false, alpha: true });
  if (!gl) return; // sin WebGL queda el degradado ambiental de CSS

  const vert = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
  const frag = `
    precision mediump float;
    uniform vec2 u_res; uniform float u_time; uniform vec2 u_mouse;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.02; a *= 0.5; } return v; }
    void main(){
      vec2 uv = gl_FragCoord.xy / u_res;
      vec2 p = uv; p.x *= u_res.x / u_res.y;
      float t = u_time * 0.035;
      vec2 q = vec2(fbm(p * 1.4 + vec2(t, 0.0)), fbm(p * 1.4 - vec2(0.0, t) + 3.1));
      float f = fbm(p * 1.1 + q * 1.9 + vec2(t * 2.0, -t));
      vec3 gold = vec3(0.89, 0.69, 0.31), blue = vec3(0.23, 0.43, 0.77), violet = vec3(0.48, 0.29, 0.71);
      vec3 col = mix(blue, gold, smoothstep(0.35, 0.75, q.x));
      col = mix(col, violet, smoothstep(0.55, 0.9, q.y) * 0.45);
      vec2 m = u_mouse; m.x *= u_res.x / u_res.y;
      float glow = exp(-dot(p - m, p - m) * 5.0);
      float a = smoothstep(0.38, 0.9, f) * 0.5;
      a *= smoothstep(0.05, 0.75, uv.y) * mix(0.55, 1.0, uv.x);
      a += glow * f * 0.28;
      gl_FragColor = vec4(col * a, a);
    }`;

  const compile = (type, src) => { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null; };
  const vs = compile(gl.VERTEX_SHADER, vert), fs = compile(gl.FRAGMENT_SHADER, frag);
  if (!vs || !fs) return;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(prog, 'u_res');
  const uTime = gl.getUniformLocation(prog, 'u_time');
  const uMouse = gl.getUniformLocation(prog, 'u_mouse');

  // Renderizamos a media resolución: el efecto es difuso y así cuesta 4 veces menos GPU
  const SCALE = 0.5;
  function resize() {
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * SCALE));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * SCALE));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
  }

  const mouse = { x: 0.75, y: 0.6, tx: 0.75, ty: 0.6 };
  if (finePointer) {
    window.addEventListener('pointermove', e => {
      const r = canvas.getBoundingClientRect();
      mouse.tx = (e.clientX - r.left) / r.width;
      mouse.ty = 1 - (e.clientY - r.top) / r.height;
    }, { passive: true });
  }

  let visible = true, raf = 0;
  const start = performance.now();
  function frame(now) {
    mouse.x += (mouse.tx - mouse.x) * 0.04;
    mouse.y += (mouse.ty - mouse.y) * 0.04;
    gl.uniform1f(uTime, (now - start) / 1000 + 20);
    gl.uniform2f(uMouse, mouse.x, mouse.y);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (!prefersReducedMotion && visible && document.visibilityState === 'visible') raf = requestAnimationFrame(frame);
    else raf = 0;
  }
  const kick = () => { if (!raf && !prefersReducedMotion) raf = requestAnimationFrame(frame); };

  resize();
  window.addEventListener('resize', () => { resize(); if (prefersReducedMotion) frame(performance.now()); });
  frame(performance.now());
  canvas.classList.add('is-ready');

  // Solo anima mientras la portada está en pantalla y la pestaña visible
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) kick(); }).observe(canvas);
  }
  document.addEventListener('visibilitychange', kick);
})();

// --------------------------------------------------------------------------
// 3d. Tarjetas con inclinación 3D (solo con mouse)
// --------------------------------------------------------------------------
function applyTilt(elements) {
  if (!finePointer || prefersReducedMotion || typeof window.VanillaTilt === 'undefined') return;
  const list = [...elements].filter(el => !el.vanillaTilt);
  if (!list.length) return;
  VanillaTilt.init(list, { max: 6, speed: 700, perspective: 1100, scale: 1.015, glare: true, 'max-glare': 0.12 });
  list.forEach(el => el.classList.add('has-tilt'));
}
applyTilt(document.querySelectorAll('.muro-card, .esf-card'));

observeReveals();

// --------------------------------------------------------------------------
// 4. Embudo hacia la App
// --------------------------------------------------------------------------
document.querySelectorAll('.app-trigger').forEach(el => {
  const go = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const name = el.getAttribute('data-target') || 'este contenido';
    const dl = document.getElementById('descargar');
    if (!dl) return;
    const title = dl.querySelector('#dl-title');
    if (title) title.innerHTML = `Accede a <em>"${sanitize(name)}"</em><br/>desde nuestra App.`;
    scrollToEl(dl);
    dl.classList.add('is-highlight');
    setTimeout(() => dl.classList.remove('is-highlight'), 1600);
  };
  el.addEventListener('click', go);
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') go(e); });
});

document.querySelectorAll('[data-track]').forEach(el => {
  el.addEventListener('click', () => trackInteraction(el.dataset.track, el.dataset.trackName || el.textContent.trim()));
});

// --------------------------------------------------------------------------
// 5. Carga dinámica de artículos (API → fallback local)
// --------------------------------------------------------------------------
let currentPage = 1;
let hasMoreArticles = true;
let isFetchingArticles = false;

function skeletons(n) {
  return Array.from({ length: n }, () =>
    `<div class="skeleton" data-skeleton><div class="sk-img"></div><div class="sk-line w60"></div><div class="sk-line w80"></div><div class="sk-line"></div></div>`
  ).join('');
}

function articleCard(article) {
  const href = 'vistas/detalle_articulo.html?id=' + encodeURIComponent(article.id);
  const tagText = article.categoria || (Array.isArray(article.etiquetas) && article.etiquetas[0]);
  const img = safeUrl(article.imagen_cabecera);
  const card = document.createElement('article');
  card.className = 'muro-card reveal';
  card.innerHTML = `
    <div class="muro-img"${img ? ` style="background-image:url('${img.replace(/'/g, '%27')}')"` : ''}>
      ${tagText ? `<span class="muro-tag" style="--tag:${safeColor(article.color_tema)}">${sanitize(tagText)}</span>` : ''}
    </div>
    <div class="muro-content">
      ${article.fecha || article.autor ? `<div class="muro-meta">${sanitize(article.autor || '')}${article.fecha ? ' · ' + sanitize(article.fecha) : ''}</div>` : ''}
      <h3 class="muro-title"><a href="${href}">${sanitize(article.titulo || 'Sin título')}</a></h3>
      <p class="muro-excerpt">${sanitize(article.extracto || article.lead || '')}</p>
      <div class="muro-actions"><span class="muro-cta">Leer artículo <i data-lucide="arrow-right"></i></span></div>
    </div>`;
  return card;
}

async function loadMoreArticles() {
  const container = document.getElementById('dynamic-articles');
  const loader = document.getElementById('articles-loader');
  if (!container || !hasMoreArticles || isFetchingArticles) return;
  isFetchingArticles = true;
  container.insertAdjacentHTML('beforeend', skeletons(currentPage === 1 ? 3 : 2));

  let articles = [];
  try {
    const response = await fetch(`/api/articles?page=${currentPage}&limit=6`);
    if (!response.ok) throw new Error('API ' + response.status);
    const data = await response.json();
    articles = Array.isArray(data) ? data : (data.articles || []);
    hasMoreArticles = data.hasMore !== undefined ? data.hasMore : articles.length >= 6;
    currentPage++;
  } catch (error) {
    console.warn('API no disponible, usando articulosDB local.', error);
    if (typeof articulosDB !== 'undefined' && currentPage === 1) {
      articles = Object.keys(articulosDB).map(key => ({ id: key, ...articulosDB[key] }));
    }
    hasMoreArticles = false;
  }

  container.querySelectorAll('[data-skeleton]').forEach(s => s.remove());
  articles
    .filter(a => a.tipo !== 'devocional' && a.id !== 'fasciculo_01')
    .forEach(a => container.appendChild(articleCard(a)));

  renderIcons();
  observeReveals(container);
  applyTilt(container.querySelectorAll('.muro-card'));
  if (hasGSAP) ScrollTrigger.refresh(); // el alto de la página cambió
  if (loader) loader.hidden = true;
  isFetchingArticles = false;
}

document.addEventListener('DOMContentLoaded', () => {
  renderIcons();
  loadMoreArticles();

  const trigger = document.getElementById('infinite-scroll-trigger');
  if (trigger && 'IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) loadMoreArticles();
    }, { rootMargin: '0px 0px 300px 0px' }).observe(trigger);
  }
});
