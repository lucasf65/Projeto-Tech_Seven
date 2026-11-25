'use strict';
/* Página de preços: lista os serviços do Firestore em formato de cardápio */
const PR_CLOCK = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

function prPrice(n) {
  const [int, cts] = (+n || 0).toFixed(2).split('.');
  return `<b class="pr-price"><span class="sr">${esc(money(n))}</span><span aria-hidden="true"><span class="cur">R$</span>${(+int).toLocaleString('pt-BR')}<span class="cts">,${cts}</span></span></b>`;
}

function prItem(s) {
  return `
    <li class="pr-item">
      <div class="pr-head"><h3>${esc(s.name)}</h3><i class="pr-lead" aria-hidden="true"></i>${prPrice(s.price)}</div>
      <p class="pr-meta">
        ${s.description ? `<span>${esc(s.description)}</span>` : ''}
        ${s.duration ? `<span class="pr-dur">${PR_CLOCK}${esc(s.duration)}</span>` : ''}
      </p>
    </li>`;
}

document.addEventListener('DOMContentLoaded', async () => {
  const list = document.getElementById('prList');
  if (!list) return;

  const wa = document.getElementById('prWa');
  if (wa) wa.href = waLink(WHATSAPP, 'Olá! Gostaria de saber os valores de decoração e manutenção.');

  try {
    const services = await loadServices();
    list.innerHTML = services.length
      ? services.map(prItem).join('')
      : '<li class="pr-state"><strong>Valores em atualização</strong>Fale com a Carol pelo WhatsApp para saber os preços.</li>';
  } catch (e) {
    console.error(e);
    list.innerHTML = '<li class="pr-state"><strong>Não foi possível carregar os valores</strong>Atualize a página ou fale com a Carol pelo WhatsApp.</li>';
  }
  list.setAttribute('aria-busy', 'false');
});
