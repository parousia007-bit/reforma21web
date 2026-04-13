// LÓGICA DEL MODAL
function openModal(id) {
  const data = contenidosDB[id];
  if(!data) return;

  // Info de cabecera
  document.getElementById('modal-sphere').innerText = data.esfera;
  document.getElementById('modal-time').innerText = data.tiempo;
  document.getElementById('modal-title').innerText = data.titulo;
  document.getElementById('modal-series').innerText = data.serie;

  // Estilar la caja superior
  const topBox = document.getElementById('modal-topbox');
  if(data.tipo === 'devocional') {
    topBox.classList.add('is-devo');
    topBox.style.borderLeftColor = 'var(--gold)';
    document.getElementById('modal-verse').style.color = 'var(--ink)';
  } else {
    topBox.classList.remove('is-devo');
    topBox.style.borderLeftColor = 'var(--cobalt)';
    document.getElementById('modal-verse').style.color = 'var(--inkMid)';
  }

  document.getElementById('modal-verse').innerText = data.lead;
  document.getElementById('modal-reference').innerText = '— ' + data.autor;

  // Cuerpo del texto
  document.getElementById('modal-text').innerHTML = data.texto;

  // Mostrar u ocultar ejercicio
  const bottomBox = document.getElementById('modal-bottombox');
  if(data.ejercicio) {
    bottomBox.style.display = 'block';
    document.getElementById('modal-exercise').innerText = data.ejercicio;
  } else {
    bottomBox.style.display = 'none';
  }

  // Abrir Modal
  document.getElementById('articleModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('articleModal').classList.remove('open');
  document.body.style.overflow = 'auto';
}

document.getElementById('articleModal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

// CONSTELACIONES Y LÓGICA GENERAL
(function(){
  'use strict';

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

  // NAVEGACIÓN Y MENÚ MÓVIL
  const nav=document.getElementById('nav');
  window.addEventListener('scroll',()=>nav.classList.toggle('scrolled',scrollY>60),{passive:true});

  const burger=document.getElementById('burger'),mobMenu=document.getElementById('mob-menu');
  let open=false;
  const toggle=()=>{open=!open;burger.setAttribute('aria-expanded',open);mobMenu.classList.toggle('open',open);const s=burger.querySelectorAll('span');if(open){s[0].style.transform='rotate(45deg) translate(5px,5px)';s[1].style.opacity='0';s[2].style.transform='rotate(-45deg) translate(5px,-5px)'}else s.forEach(x=>{x.style.transform='';x.style.opacity='';})};
  burger.addEventListener('click',toggle);
  mobMenu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{if(open)toggle()}));
  document.addEventListener('click',e=>{if(open&&!nav.contains(e.target))toggle()});

  const revealEls=document.querySelectorAll('.reveal');
  if('IntersectionObserver' in window){const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');io.unobserve(e.target)}}),{threshold:.1,rootMargin:'0px 0px -50px 0px'});revealEls.forEach((el,i)=>{el.style.transitionDelay=(i%4)*.08+'s';io.observe(el)});}else revealEls.forEach(el=>el.classList.add('visible'));

  // EMBUDO APP
  document.querySelectorAll('.app-trigger').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if(!e.target.closest('.muro-card') || !e.target.closest('.muro-card').hasAttribute('onclick')) {
        const articleName = e.target.closest('.app-trigger').getAttribute('data-target') || 'este contenido';
        const dlSection = document.getElementById('descargar');
        const dlTitle = dlSection.querySelector('#dl-title');
        dlTitle.innerHTML = `Accede a <em>"${articleName}"</em><br/>desde nuestra App.`;
        dlSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        dlSection.style.transition = "background 0.5s";
        dlSection.style.background = "var(--surface2)";
        setTimeout(() => dlSection.style.background = "transparent", 1500);
      }
    });
  });

  document.querySelectorAll('a[href^="#"]').forEach(a=>{a.addEventListener('click',e=>{if(a.classList.contains('app-trigger')) return; const t=document.querySelector(a.getAttribute('href'));if(!t)return;e.preventDefault();const h=(document.querySelector('#nav')||{offsetHeight:72}).offsetHeight+16;window.scrollTo({top:t.getBoundingClientRect().top+scrollY-h,behavior:'smooth'});});});
})();
