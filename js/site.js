'use strict';
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
      document.getElementById('homeGallery').innerHTML=list.map(g=>`
        <figure><img src="${esc(g.url)}" alt="${esc(g.alt||'')}" loading="lazy"></figure>`).join('');
    }
    if(document.getElementById('fullGallery')){
      const list=await loadGallery();
      const el=document.getElementById('fullGallery');
      el.innerHTML = list.length
        ? list.map(g=>`<figure><img src="${esc(g.url)}" alt="${esc(g.alt||'')}" loading="lazy"></figure>`).join('')
        : '<div class="empty">Nenhuma foto cadastrada ainda.</div>';
    }
    document.querySelectorAll('.reveal').forEach(el=>{
      if(!el.classList.contains('in')) el.classList.add('in');
    });
  }catch(e){ console.error(e); toast('Erro ao carregar dados.'); }
});