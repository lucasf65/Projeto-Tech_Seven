'use strict';

function galleryFigure(photo, index, interactive) {
  const figure = document.createElement('figure');
  const image = document.createElement('img');
  image.src = photo.url;
  image.alt = photo.alt;
  image.loading = 'lazy';
  image.decoding = 'async';
  if (!interactive) {
    figure.append(image);
    return figure;
  }
  figure.style.setProperty('--i', String(index));
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'g-open';
  open.setAttribute('aria-label', `Ampliar foto: ${photo.alt}`);
  const caption = document.createElement('figcaption');
  caption.textContent = photo.alt;
  open.append(image);
  figure.append(open, caption);
  return figure;
}

document.addEventListener('DOMContentLoaded', async () => {
  try{
    if(document.getElementById('featuredServices')){
      const list=(await loadServices()).slice(0,3);
      document.getElementById('featuredServices').innerHTML=list.map(s=>`
        <article class="card reveal">
          <div class="icon">${esc(s.icon||'💅')}</div>
          <h3>${esc(s.name)}</h3>
          <p class="lead" style="font-size:13.5px">${esc(s.description||'')}</p>
          <span class="price">${money(s.price)} <small>a partir</small></span>
        </article>`).join('');
    }
    if(document.getElementById('servicesGrid')){
      const list=await loadServices();
      document.getElementById('servicesGrid').innerHTML=list.map(s=>`
        <article class="card reveal">
          <div class="icon">${esc(s.icon||'💅')}</div>
          <h3>${esc(s.name)}</h3>
          <p class="lead" style="font-size:13.5px">${esc(s.description||'')} · ${esc(s.duration)}</p>
          <span class="price">${money(s.price)}</span>
          <a class="btn btn-ghost mt-4" href="agendamento.html">Agendar <span class="arrow">→</span></a>
        </article>`).join('');
    }
    if(document.getElementById('priceTable')){
      const list=await loadServices();
      document.getElementById('priceTable').querySelector('tbody').innerHTML=list.map(s=>`
        <tr><td>${esc(s.name)}</td><td>${esc(s.duration)}</td><td>${money(s.price)}</td></tr>`).join('');
    }
    if(document.getElementById('homeGallery')){
      const list=(await loadGallery()).slice(0,4);
      document.getElementById('homeGallery').replaceChildren(...list.map((photo, index) => galleryFigure(photo, index, false)));
    }
    if(document.getElementById('fullGallery')){
      const list=await loadGallery();
      const el=document.getElementById('fullGallery');
      el.replaceChildren();
      if (list.length) {
        el.append(...list.map((photo, index) => galleryFigure(photo, index, true)));
      } else {
        const notice = document.createElement('div');
        notice.className = 'empty';
        notice.textContent = 'Nenhuma foto cadastrada ainda.';
        el.append(notice);
      }
      el.setAttribute('aria-busy','false');
      const cnt=document.getElementById('galCount');
      if(cnt) cnt.textContent = list.length ? `${list.length} trabalho${list.length===1?'':'s'}` : '';
    }
    document.querySelectorAll('.reveal').forEach(el=>{
      if(!el.classList.contains('in')) el.classList.add('in');
    });
  }catch(e){ console.error(e); toast('Erro ao carregar dados.'); }
});
