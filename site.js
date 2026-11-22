'use strict';
document.addEventListener('DOMContentLoaded', async () => {
  const catalog = ['featuredServices', 'servicesGrid', 'priceTable']
    .map(id => document.getElementById(id)).find(Boolean);
  if (catalog) {
    renderCatalogState(catalog, 'Carregando serviços…');
    try {
      const services = await loadServices();
      if (services.length) renderCatalog(catalog, services);
      else renderCatalogState(catalog, 'Nenhum serviço está disponível no momento.');
    } catch {
      renderCatalogState(catalog, 'Não foi possível carregar os serviços. Atualize a página para tentar novamente.');
    } finally {
      catalog.setAttribute('aria-busy', 'false');
    }
  }

  try{
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
      el.setAttribute('aria-busy', 'false');
    }
    document.querySelectorAll('.reveal').forEach(el=>{
      if(!el.classList.contains('in')) el.classList.add('in');
    });
  }catch(e){ console.error(e); toast('Erro ao carregar dados.'); }
});

function renderCatalogState(catalog, message) {
  if (catalog.id === 'priceTable') {
    catalog.tBodies[0].innerHTML = `<tr><td colspan="3" class="empty"><span role="status">${esc(message)}</span></td></tr>`;
  } else {
    catalog.innerHTML = `<p class="empty" role="status">${esc(message)}</p>`;
  }
}

function renderCatalog(catalog, services) {
  if (catalog.id === 'priceTable') {
    catalog.tBodies[0].innerHTML = services.map(s => `
      <tr><td>${esc(s.name)}</td><td>${esc(s.duration)}</td><td>${money(s.price)}</td></tr>`).join('');
    return;
  }
  const featured = catalog.id === 'featuredServices';
  const list = featured ? services.slice(0, 3) : services;
  catalog.innerHTML = list.map(s => `
    <article class="card reveal in">
      <div class="icon" aria-hidden="true">${esc(s.icon || '💅')}</div>
      <h3>${esc(s.name)}</h3>
      <p class="lead" style="font-size:13.5px">${esc(s.description || '')}${featured ? '' : ` · ${esc(s.duration)}`}</p>
      <span class="price">${money(s.price)}${featured ? ' <small>a partir</small>' : ''}</span>
      ${featured ? '' : '<a class="btn btn-ghost mt-4" href="agendamento.html">Agendar <span class="arrow">→</span></a>'}
    </article>`).join('');
}
