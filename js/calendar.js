'use strict';
/* =========================================================
   COMPONENTE DE CALENDÁRIO ÚNICO
   Substitui initCalendar/renderCalendar (booking.js) e
   initAdminCalendar/renderAdminCalendar (admin.js), que tinham
   a mesma lógica de grid duplicada em dois arquivos.
   ========================================================= */

const MONTHS_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function createCalendar(opts) {
  const {
    gridEl,
    monthSelectEl = null,   // modo cliente: <select> de mês
    yearSelectEl = null,    // modo cliente: <select> de ano
    monthLabelEl = null,    // modo admin: <span> com o nome do mês
    yearLabelEl = null,     // modo admin: <span> com o ano
    prevBtn,
    nextBtn,
    disablePast = false,    // true = desabilita dias anteriores a hoje (uso do cliente)
    selectedDate = keyDate(new Date()),
    onSelect = () => {}
  } = opts;

  const state = {
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
    selected: selectedDate
  };

  function setupSelects() {
    if (!monthSelectEl || !yearSelectEl) return;
    monthSelectEl.innerHTML = MONTHS_FULL.map((m, i) => `<option value="${i}">${m}</option>`).join('');
    monthSelectEl.value = state.month;
    const yNow = new Date().getFullYear();
    yearSelectEl.innerHTML = Array.from({ length: 3 }, (_, i) => `<option value="${yNow + i}">${yNow + i}</option>`).join('');
    yearSelectEl.value = state.year;
    monthSelectEl.addEventListener('change', e => { state.month = +e.target.value; render(); });
    yearSelectEl.addEventListener('change', e => { state.year = +e.target.value; render(); });
  }

  function syncHeader() {
    if (monthSelectEl) monthSelectEl.value = state.month;
    if (yearSelectEl && yearSelectEl.querySelector(`option[value="${state.year}"]`)) yearSelectEl.value = state.year;
    if (monthLabelEl) monthLabelEl.textContent = MONTHS_FULL[state.month];
    if (yearLabelEl) yearLabelEl.textContent = state.year;
  }

  function render() {
    syncHeader();
    gridEl.innerHTML = '';

    const firstDay = new Date(state.year, state.month, 1).getDay();
    const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
    const today = new Date(); today.setHours(0, 0, 0, 0);

    for (let i = 0; i < firstDay; i++) {
      const empty = document.createElement('div');
      empty.className = 'cal-day empty';
      gridEl.appendChild(empty);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(state.year, state.month, d);
      const k = keyDate(dateObj);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal-day';
      btn.textContent = d;

      const isPast = disablePast && dateObj < today;
      if (isPast) {
        btn.classList.add('disabled');
        btn.disabled = true;
      } else {
        if (k === state.selected) btn.classList.add('selected');
        btn.addEventListener('click', () => {
          state.selected = k;
          render();
          onSelect(k);
        });
      }
      gridEl.appendChild(btn);
    }
  }

  function shiftMonth(delta) {
    state.month += delta;
    if (state.month < 0) { state.month = 11; state.year--; }
    if (state.month > 11) { state.month = 0; state.year++; }
    render();
  }

  prevBtn.addEventListener('click', e => { e.preventDefault(); shiftMonth(-1); });
  nextBtn.addEventListener('click', e => { e.preventDefault(); shiftMonth(1); });

  setupSelects();
  render();

  return {
    getSelected: () => state.selected,
    setSelected: (k) => { state.selected = k; render(); },
    render
  };
}
