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
    today = () => keyDate(new Date()),
    maxDate = null,
    onSelect = () => {}
  } = opts;

  const yearOf = (date) => Number(date.slice(0, 4));
  const monthOf = (date) => Number(date.slice(5, 7)) - 1;
  const dateKey = (year, month, day) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const state = {
    month: monthOf(selectedDate),
    year: yearOf(selectedDate),
    selected: selectedDate,
    disabled: false
  };

  function monthAllowed(year, month) {
    const key = dateKey(year, month, 1).slice(0, 7);
    return (!disablePast || key >= today().slice(0, 7)) && (!maxDate || key <= maxDate.slice(0, 7));
  }

  function setupSelects() {
    if (!monthSelectEl || !yearSelectEl) return;
    monthSelectEl.innerHTML = MONTHS_FULL.map((m, i) => `<option value="${i}">${m}</option>`).join('');
    const firstYear = yearOf(today());
    const lastYear = maxDate ? yearOf(maxDate) : firstYear + 2;
    yearSelectEl.innerHTML = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => {
      const year = firstYear + i;
      return `<option value="${year}">${year}</option>`;
    }).join('');
    monthSelectEl.addEventListener('change', e => { state.month = +e.target.value; render(); });
    yearSelectEl.addEventListener('change', e => {
      state.year = +e.target.value;
      if (!monthAllowed(state.year, state.month)) {
        state.month = state.year === yearOf(today()) ? monthOf(today()) : monthOf(maxDate);
      }
      render();
    });
  }

  function offsetMonth(delta) {
    return new Date(state.year, state.month + delta, 1);
  }

  function syncHeader() {
    if (monthSelectEl) {
      monthSelectEl.disabled = state.disabled;
      monthSelectEl.value = state.month;
      for (const option of monthSelectEl.options) option.disabled = !monthAllowed(state.year, Number(option.value));
    }
    if (yearSelectEl) {
      yearSelectEl.disabled = state.disabled;
      yearSelectEl.value = state.year;
    }
    if (monthLabelEl) monthLabelEl.textContent = MONTHS_FULL[state.month];
    if (yearLabelEl) yearLabelEl.textContent = state.year;
    const previous = offsetMonth(-1);
    const next = offsetMonth(1);
    prevBtn.disabled = state.disabled || !monthAllowed(previous.getFullYear(), previous.getMonth());
    nextBtn.disabled = state.disabled || !monthAllowed(next.getFullYear(), next.getMonth());
  }

  function render(focusDate) {
    syncHeader();
    gridEl.innerHTML = '';

    const firstDay = new Date(state.year, state.month, 1).getDay();
    const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
    const currentDay = today();
    let focusButton;

    for (let i = 0; i < firstDay; i++) {
      const empty = document.createElement('div');
      empty.className = 'cal-day empty';
      gridEl.appendChild(empty);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const k = dateKey(state.year, state.month, d);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal-day';
      btn.textContent = d;
      btn.setAttribute('aria-label', `${d} de ${MONTHS_FULL[state.month].toLowerCase()} de ${state.year}`);
      if (k === currentDay) btn.setAttribute('aria-current', 'date');
      const blocked = (disablePast && k < currentDay) || (maxDate && k > maxDate);
      btn.disabled = Boolean(state.disabled || blocked);
      btn.classList.toggle('disabled', Boolean(blocked));
      btn.classList.toggle('selected', k === state.selected);
      btn.setAttribute('aria-pressed', String(k === state.selected));
      btn.addEventListener('click', () => {
        state.selected = k;
        render(k);
        onSelect(k);
      });
      gridEl.appendChild(btn);
      if (focusDate === k) focusButton = btn;
    }
    focusButton?.focus({ preventScroll: true });
  }

  function shiftMonth(delta) {
    const offset = offsetMonth(delta);
    state.month = offset.getMonth();
    state.year = offset.getFullYear();
    render();
  }

  prevBtn.addEventListener('click', e => { e.preventDefault(); shiftMonth(-1); });
  nextBtn.addEventListener('click', e => { e.preventDefault(); shiftMonth(1); });

  setupSelects();
  render();

  return {
    getSelected: () => state.selected,
    setSelected: (k) => { state.selected = k; render(); },
    setDisabled: (disabled) => { state.disabled = disabled; render(); },
    render
  };
}
