// ==========================================================================
// REFORMA 2.1 · Utilidades compartidas de las páginas internas (vistas/)
// Iconos, barra de progreso de lectura, avisos y progreso del lector.
// ==========================================================================
window.Reforma = (function () {
  'use strict';

  function icons() {
    if (window.lucide) lucide.createIcons({ attrs: { 'aria-hidden': 'true' } });
  }

  // Barra superior que avanza con el scroll. Requiere <span id="read-progress">
  function readProgress() {
    const bar = document.getElementById('read-progress');
    if (!bar) return;
    const update = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = `scaleX(${h > 0 ? Math.min(window.scrollY / h, 1) : 0})`;
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  let toastTimer;
  function toast(message, icon = 'check-circle') {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.innerHTML = `<i data-lucide="${icon}"></i><span></span>`;
    el.querySelector('span').textContent = message;
    icons();
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  // Progreso del lector guardado en este navegador (no requiere cuenta).
  const STORE_KEY = 'reforma21:progress';
  const store = {
    _read() {
      try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
    },
    _write(data) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch { /* modo privado */ }
    },
    isDone(id) { return Boolean(this._read()[id]?.done); },
    markDone(id) { const d = this._read(); d[id] = { ...d[id], done: true, at: Date.now() }; this._write(d); },
    unmark(id) { const d = this._read(); if (d[id]) { d[id].done = false; this._write(d); } },
    getNote(id) { return this._read()[id]?.note || ''; },
    setNote(id, note) { const d = this._read(); d[id] = { ...d[id], note }; this._write(d); }
  };

  // "La Profecía del Hogar (2/3)" → { name: "La Profecía del Hogar", part: 2, total: 3 }
  function parseSerie(serie) {
    const m = String(serie || '').match(/^(.*?)\s*\((\d+)\s*\/\s*(\d+)\)\s*$/);
    return m ? { name: m[1].trim(), part: +m[2], total: +m[3] } : { name: String(serie || '').trim(), part: 0, total: 0 };
  }

  // Agrupa una base de datos { id: item } por nombre de serie, ordenada por parte.
  function groupSeries(db) {
    const groups = {};
    Object.entries(db || {}).forEach(([id, item]) => {
      const s = parseSerie(item.serie);
      if (!s.name) return;
      (groups[s.name] = groups[s.name] || []).push({ id, ...item, _part: s.part });
    });
    Object.values(groups).forEach(list => list.sort((a, b) => a._part - b._part));
    return groups;
  }

  document.addEventListener('DOMContentLoaded', () => { icons(); readProgress(); });

  return { icons, toast, store, parseSerie, groupSeries };
})();
