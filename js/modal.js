'use strict';
/* =========================================================
   COMPONENTE DE MODAL ÚNICO (comportamento, não visual)
   Unifica abrir/fechar, clique no fundo, tecla ESC e o
   scroll-lock do body — que antes só existia no modal de
   agenda (admin.js) e faltava no modal de novo serviço.

   As duas aparências (modal-overlay simples e
   modal-agenda-overlay em duas colunas) continuam existindo
   no styles.css porque representam conteúdos diferentes
   (formulário x painel de calendário/horários); só a lógica
   de controle foi unificada aqui.

   Uso:
     const modal = createModal({
       overlayEl: document.getElementById('serviceModal'),
       openBtn: document.getElementById('openServiceModal'),
       closeBtn: document.querySelector('#serviceModal .close-modal'),
       lockScroll: false,       // true trava o scroll da página por trás (usado na agenda)
       onOpen: () => { ... },   // opcional: roda toda vez que abre
       onClose: () => { ... }   // opcional: roda toda vez que fecha
     });
     modal.open(); modal.close();
   ========================================================= */

function createModal(opts) {
  const {
    overlayEl,
    openBtn = null,
    closeBtn = null,
    extraCloseBtns = [],     // ex.: botão "Concluir" do modal de agenda também fecha
    lockScroll = false,
    closeOnBackdrop = true,
    closeOnEsc = true,
    onOpen = () => {},
    onClose = () => {}
  } = opts;

  let scrollY = 0;
  let isOpen = false;

  function open() {
    if (!overlayEl || isOpen) return;
    isOpen = true;

    if (lockScroll) {
      scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
    }

    onOpen();

    overlayEl.classList.remove('active');
    void overlayEl.offsetWidth; // força reflow para reiniciar a animação de entrada
    overlayEl.classList.add('active');
  }

  function close() {
    if (!overlayEl || !isOpen) return;
    isOpen = false;
    overlayEl.classList.remove('active');

    if (lockScroll) {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    }

    onClose();
  }

  if (openBtn) openBtn.addEventListener('click', open);
  if (closeBtn) closeBtn.addEventListener('click', close);
  extraCloseBtns.forEach(btn => btn && btn.addEventListener('click', close));

  if (closeOnBackdrop && overlayEl) {
    overlayEl.addEventListener('click', e => { if (e.target === overlayEl) close(); });
  }
  if (closeOnEsc) {
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen) close(); });
  }

  return { open, close, isOpen: () => isOpen };
}
