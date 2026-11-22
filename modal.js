'use strict';
/* =========================================================
   COMPONENTE DE MODAL ÚNICO (comportamento, não visual)
   Unifica abrir/fechar, clique no fundo, tecla ESC e o
   scroll-lock do body, usado pelos dois modais do admin.
   ========================================================= */

function createModal(opts) {
  const {
    overlayEl,
    openBtn = null,
    closeBtn = null,
    extraCloseBtns = [],
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
