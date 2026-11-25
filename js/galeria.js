'use strict';
/* Lightbox da galeria: abre ao clicar numa foto; setas, Esc e deslize no celular. */
document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('fullGallery');
  if (!grid) return;

  const ICON = {
    close: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    prev:  '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    next:  '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>'
  };

  const lb = document.createElement('div');
  lb.className = 'lb';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.setAttribute('aria-label', 'Visualizador de fotos');
  lb.innerHTML = `
    <div class="lb-top">
      <span class="lb-count" aria-live="polite"></span>
      <button type="button" class="lb-btn lb-close" aria-label="Fechar">${ICON.close}</button>
    </div>
    <div class="lb-stage">
      <button type="button" class="lb-btn lb-nav lb-prev" aria-label="Foto anterior">${ICON.prev}</button>
      <img class="lb-img" alt="">
      <button type="button" class="lb-btn lb-nav lb-next" aria-label="Próxima foto">${ICON.next}</button>
    </div>
    <div class="lb-cap"></div>`;
  document.body.appendChild(lb);

  const imgEl = lb.querySelector('.lb-img');
  const capEl = lb.querySelector('.lb-cap');
  const countEl = lb.querySelector('.lb-count');
  const closeBtn = lb.querySelector('.lb-close');
  const prevBtn = lb.querySelector('.lb-prev');
  const nextBtn = lb.querySelector('.lb-next');

  let items = [];
  let index = 0;
  let isOpen = false;
  let lastFocus = null;

  // Tamanho do "bloco" do padrão da grade em cada largura (8 no computador, 6 no tablet, 5 no celular).
  // As fotos do último bloco incompleto ficam em tamanho simples, para não sobrar buraco.
  const mqTablet = window.matchMedia('(max-width:1000px)');
  const mqPhone = window.matchMedia('(max-width:640px)');
  function tidy() {
    const period = mqPhone.matches ? 5 : mqTablet.matches ? 6 : 8;
    const figs = grid.querySelectorAll('figure');
    const full = Math.floor(figs.length / period) * period;
    figs.forEach((f, i) => f.classList.toggle('g-plain', i >= full));
  }
  new MutationObserver(tidy).observe(grid, { childList: true });
  [mqTablet, mqPhone].forEach(m => (m.addEventListener ? m.addEventListener('change', tidy) : m.addListener(tidy)));
  tidy();

  const collect = () => Array.from(grid.querySelectorAll('figure img')).map(i => ({ src: i.currentSrc || i.src, alt: i.alt || '' }));

  function show(i) {
    index = (i + items.length) % items.length;
    const it = items[index];
    imgEl.classList.remove('swap');
    void imgEl.offsetWidth; // reinicia a animação
    imgEl.src = it.src;
    imgEl.alt = it.alt;
    imgEl.classList.add('swap');
    capEl.textContent = it.alt;
    countEl.textContent = `${index + 1} / ${items.length}`;
    // pré-carrega as vizinhas
    [index - 1, index + 1].forEach(n => { const p = new Image(); p.src = items[(n + items.length) % items.length].src; });
  }

  function open(i) {
    items = collect();
    if (!items.length) return;
    lastFocus = document.activeElement;
    lb.classList.toggle('lb-single', items.length < 2);
    isOpen = true;
    show(i);
    lb.classList.add('open');
    document.documentElement.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    lb.classList.remove('open');
    document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.g-open');
    if (!btn) return;
    const figs = Array.from(grid.querySelectorAll('figure'));
    open(figs.indexOf(btn.closest('figure')));
  });

  closeBtn.addEventListener('click', close);
  prevBtn.addEventListener('click', () => show(index - 1));
  nextBtn.addEventListener('click', () => show(index + 1));
  lb.addEventListener('click', (e) => { if (e.target === lb || e.target.classList.contains('lb-stage')) close(); });

  document.addEventListener('keydown', (e) => {
    if (!isOpen) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(index - 1);
    else if (e.key === 'ArrowRight') show(index + 1);
    else if (e.key === 'Tab') { // mantém o foco dentro do visualizador
      const f = Array.from(lb.querySelectorAll('button')).filter(b => b.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // deslizar para trocar de foto no celular
  let x0 = null;
  lb.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
  });
});
