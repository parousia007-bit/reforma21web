// LÓGICA DE CARGA Y NAVEGACIÓN
function openModal(id) {
  // Ahora redirigimos a la subpágina dinámica
  const esDevo = dbDevocionales && dbDevocionales[id];
  const vistaPath = esDevo ? 'vistas/detalle_devocional.html' : 'vistas/detalle_articulo.html';
  window.location.href = vistaPath + '?id=' + id;
}

function closeModal() {
  document.getElementById('articleModal').classList.remove('open');
  document.body.style.overflow = 'auto';
}

document.getElementById('articleModal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

// CONSTELACIONES Y EFECTOS DE SCROLL (Aquí estaba el fallo de la invisibilidad)
(function(){
  'use strict';
  
  // 1. CONSTELACIONES EN EL FONDO
  const canvas = document.createElement('canvas');
  canvas.id = 'stars-canvas';
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '0';
  document.body.insertBefore(canvas, document.body.firstChild);

  const ctx = canvas.getContext('2d');
  let width, height;

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    drawSpace();
  }

  let seed = 42;
  function random() {
    let x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  }

  function drawSpace() {
    ctx.clearRect(0, 0, width, height);
    seed = 42; 
    const stars = [];
    const gold = 'rgba(200, 146, 42, ';
    const cobalt = 'rgba(45, 95, 166, ';

    for (let i = 0; i < 150; i++) {
      const pos = { x: random() * width, y: random() * height };
      stars.push(pos);
      const type = Math.floor(random() * 5);
      let radius = random() * 1.5 + 0.8;

      ctx.beginPath();
      if (type === 0) {
        radius *= 1.5;
        ctx.fillStyle = gold + '0.9)';
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = gold + '0.15)';
        ctx.arc(pos.x, pos.y, radius * 3, 0, Math.PI * 2);
      } else if (type === 1) {
        ctx.fillStyle = cobalt + '0.8)';
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    function drawConstellation(indices) {
      ctx.beginPath();
      ctx.strokeStyle = gold + '0.15)';
      ctx.lineWidth = 0.5;
      ctx.moveTo(stars[indices[0]].x, stars[indices[0]].y);
      for (let i = 1; i < indices.length; i++) {
        ctx.lineTo(stars[indices[i]].x, stars[indices[i]].y);
      }
      ctx.stroke();
    }

    drawConstellation([10, 25, 40, 55, 10]);
    drawConstellation([80, 85, 90, 95]);
    drawConstellation([110, 115, 120, 110]);
  }

  window.addEventListener('resize', resize);
  resize();

  // 2. NAVEGACIÓN Y MENÚ MÓVIL
  const nav=document.getElementById('nav');
  window.addEventListener('scroll',()=>nav.classList.toggle('scrolled',window.scrollY>60),{passive:true});
  
  const burger=document.getElementById('burger'), mobMenu=document.getElementById('mob-menu');
  let open=false;
  const toggle=()=>{
    open=!open;
    burger.setAttribute('aria-expanded',open);
    mobMenu.classList.toggle('open',open);
    const s=burger.querySelectorAll('span');
    if(open){
      s[0].style.transform='rotate(45deg) translate(5px,5px)';
      s[1].style.opacity='0';
      s[2].style.transform='rotate(-45deg) translate(5px,-5px)';
    } else {
      s.forEach(x=>{x.style.transform='';x.style.opacity='';});
    }
  };
  burger.addEventListener('click',toggle);
  mobMenu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{if(open)toggle()}));
  document.addEventListener('click',e=>{if(open&&!nav.contains(e.target))toggle()});
  
  // 3. EFECTO REVEAL (ESTO ENCENDERÁ TUS TARJETAS INVISIBLES)
  const revealEls = document.querySelectorAll('.reveal');
  if('IntersectionObserver' in window){
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if(e.isIntersecting){
          e.target.classList.add('visible');
          io.unobserve(e.target);
        }
      });
    }, {threshold: 0.1, rootMargin: '0px 0px -50px 0px'});
    
    revealEls.forEach((el, i) => {
      el.style.transitionDelay = (i % 4) * 0.08 + 's';
      io.observe(el);
    });
  } else {
    // Fallback si el navegador es antiguo
    revealEls.forEach(el => el.classList.add('visible'));
  }

  // 4. EMBUDO APP (Smooth Scroll)
  document.querySelectorAll('.app-trigger').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      // Si el botón está dentro de un muro-card, no ejecutar el link de la tarjeta
      e.stopPropagation();
      
      const articleName = e.currentTarget.getAttribute('data-target') || 'este contenido';
      const dlSection = document.getElementById('descargar');
      if (dlSection) {
        const dlTitle = dlSection.querySelector('#dl-title');
        if (dlTitle) {
          dlTitle.innerHTML = `Accede a <em>"${articleName}"</em><br/>desde nuestra App.`;
        }
        dlSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        dlSection.style.transition = "background 0.5s";
        dlSection.style.background = "var(--surface2)";
        setTimeout(() => dlSection.style.background = "transparent", 1500);
      }
    });
  });

  // Smooth scroll global para anclas
  document.querySelectorAll('a[href^="#"]').forEach(a=>{
    a.addEventListener('click',e=>{
      if(a.classList.contains('app-trigger')) return; 
      const t=document.querySelector(a.getAttribute('href'));
      if(!t)return;
      e.preventDefault();
      const h=(document.querySelector('#nav')||{offsetHeight:72}).offsetHeight+16;
      window.scrollTo({top:t.getBoundingClientRect().top+window.scrollY-h,behavior:'smooth'});
    });
  });
})();

// 5. CARGA DINÁMICA DE ARTÍCULOS (API FETCH)
async function loadArticles() {
  const container = document.getElementById('dynamic-articles');
  if (!container) return; // Solo ejecutar en index.html

  let articles = [];

  try {
    const response = await fetch('/api/articles');
    if (!response.ok) throw new Error('API request failed');
    articles = await response.json();
  } catch (error) {
    console.warn('Backend fetch failed, falling back to articulosDB...', error);
    // Fallback de Seguridad: usar la variable local antigua si existe
    if (typeof articulosDB !== 'undefined') {
      articles = Object.keys(articulosDB).map(key => ({
        id: key,
        ...articulosDB[key]
      }));
    }
  }

  // Filtrar los que no deben mostrarse o ya están estáticos
  articles = articles.filter(a => a.tipo !== 'devocional' && a.id !== 'fasciculo_01');

  // Renderizar
  articles.forEach(article => {
    const card = document.createElement('article');
    card.className = 'muro-card reveal';
    card.style.cursor = 'pointer';
    card.onclick = () => { window.location.href = 'vistas/detalle_articulo.html?id=' + encodeURIComponent(article.id); };
    
    // Tag / Categoría
    let tagHtml = '';
    const tagText = article.categoria || (article.etiquetas && article.etiquetas[0]);
    if (tagText) {
       const color = article.color_tema || 'var(--gold)';
       tagHtml = `<span class="muro-tag" style="background: ${color}; color: #FFFFFF;">${DOMPurify.sanitize(tagText)}</span>`;
    }

    const imgStyle = article.imagen_cabecera ? `background-image: url('${DOMPurify.sanitize(article.imagen_cabecera)}');` : '';
    const title = article.titulo ? DOMPurify.sanitize(article.titulo) : 'Sin título';
    const excerpt = article.extracto || article.lead || '';
    
    card.innerHTML = `
      <div class="muro-img" style="${imgStyle}">
        ${tagHtml}
      </div>
      <div class="muro-content">
        <h3 class="muro-title">${title}</h3>
        <p class="muro-excerpt">${DOMPurify.sanitize(excerpt)}</p>
        <button class="btn btn-outline btn-sm">Leer Artículo →</button>
      </div>
    `;
    container.appendChild(card);
  });

  // Re-aplicar el IntersectionObserver para las nuevas tarjetas
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if(e.isIntersecting){
          e.target.classList.add('visible');
          io.unobserve(e.target);
        }
      });
    }, {threshold: 0.1, rootMargin: '0px 0px -50px 0px'});
    
    container.querySelectorAll('.reveal').forEach((el, i) => {
      el.style.transitionDelay = (i % 4) * 0.08 + 's';
      io.observe(el);
    });
  } else {
    container.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
  }
}

document.addEventListener('DOMContentLoaded', loadArticles);
