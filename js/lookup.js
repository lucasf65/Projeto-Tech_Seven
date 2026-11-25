'use strict';
/* =========================================================
   MEUS HORÁRIOS — consulta, cancelamento e reagendamento
   ========================================================= */
const ACTIVE_STATUS = ['pendente', 'aguardando-sinal', 'confirmado'];
const STATUS_LABEL = {
  'pendente': 'Aguardando aprovação',
  'aguardando-sinal': 'Aguardando sinal',
  'confirmado': 'Confirmado',
  'concluido': 'Concluído',
  'recusado': 'Recusado',
  'cancelado': 'Cancelado'
};
const MH_ICON = {
  clock: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  tag: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.2"/></svg>',
  cal: '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  warn: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5"/></svg>'
};
const MAX_REAGENDAMENTOS = 3;
let lookingUp = false;
const $m = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', () => {
  const inp = $m('lookup'); if (!inp) return;
  inp.addEventListener('input', e => { formatPhoneInput(e); setFieldError(inp, '', 'lookupErr'); });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') findAppointments(); });
  $m('findAppointments').addEventListener('click', findAppointments);
  const wa = $m('mhWa'); if (wa) wa.href = waLink(WHATSAPP, 'Olá! Preciso de ajuda com o meu agendamento.');
  $m('myAppointments').addEventListener('click', onAction);
});

/* ---------- helpers ---------- */
function dateParts(k) {
  if (!k) return { day: '—', mon: '', wd: '' };
  const d = new Date(k + 'T12:00:00');
  return {
    day: String(d.getDate()).padStart(2, '0'),
    mon: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
    wd: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  };
}
const slotKey = (a) => (a.data || '') + ' ' + (a.horario || '');

/* ---------- consulta ---------- */
async function findAppointments() {
  if (lookingUp) return;
  const inp = $m('lookup');
  const phone = digits(inp.value);
  if (!validPhoneLookup(phone)) {
    setFieldError(inp, 'Informe um WhatsApp válido com DDD, ex.: (11) 99999-9999.', 'lookupErr');
    toast('Informe um WhatsApp válido.');
    return;
  }
  setFieldError(inp, '', 'lookupErr');

  const btn = $m('findAppointments');
  const box = $m('myAppointments');
  lookingUp = true; btn.disabled = true; btn.textContent = 'Consultando…';
  box.innerHTML = '<div class="mh-list"><div class="mh-skel"></div><div class="mh-skel"></div></div>';

  try {
    // Sem orderBy na consulta: filtrar por telefone + ordenar por outro campo exigiria um índice composto no Firestore.
    const snap = await db.collection('agendamentos').where('telefone', '==', phone).get();
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAppointments(list);
  } catch (e) {
    console.error(e);
    box.innerHTML = `
      <div class="mh-empty">${MH_ICON.search}
        <div><strong>Não foi possível consultar</strong><p>Tente novamente em instantes.</p></div>
      </div>`;
  } finally {
    lookingUp = false; btn.disabled = false; btn.textContent = 'Consultar agendamentos';
  }
}

/* ---------- desenho dos resultados ---------- */
let currentById = new Map();

function renderAppointments(list) {
  const box = $m('myAppointments');
  currentById = new Map(list.map(a => [a.id, a]));

  if (!list.length) {
    box.innerHTML = `
      <div class="mh-empty">${MH_ICON.search}
        <div><strong>Nenhum agendamento encontrado</strong>
        <p>Não encontramos solicitações para este WhatsApp. Confira o número ou faça um novo agendamento.</p></div>
        <a class="btn btn-primary" href="agendamento.html">Agendar horário <span class="arrow">→</span></a>
      </div>`;
    return;
  }

  const today = keyDate(new Date());
  const isUpcoming = a => ACTIVE_STATUS.includes(a.status) && (a.data || '') >= today;
  const upcoming = list.filter(isUpcoming).sort((x, y) => slotKey(x).localeCompare(slotKey(y)));
  const past = list.filter(a => !isUpcoming(a)).sort((x, y) => slotKey(y).localeCompare(slotKey(x)));
  const first = ((list[0].nome || '').trim().split(/\s+/)[0]) || '';

  const sub = upcoming.length
    ? `Você tem ${upcoming.length} horário${upcoming.length === 1 ? '' : 's'} a caminho.`
    : 'Você não tem horários futuros no momento.';

  box.innerHTML = `
    <div class="mh-summary">
      <div><h2>${first ? 'Olá, ' + esc(first) + '!' : 'Seus horários'}</h2><p>${sub}</p></div>
      ${upcoming.length ? '' : '<a class="btn btn-primary" href="agendamento.html">Agendar novo horário <span class="arrow">→</span></a>'}
    </div>
    ${upcoming.length ? `<h3 class="mh-group">Próximos</h3><div class="mh-list">${upcoming.map(a => cardHtml(a, true)).join('')}</div>` : ''}
    ${past.length ? `<h3 class="mh-group">Histórico</h3><div class="mh-list">${past.map(a => cardHtml(a, false)).join('')}</div>` : ''}`;
}

function cardHtml(a, canAct) {
  const p = dateParts(a.data);
  const st = a.status || '';
  let hint = '';
  if (canAct && a.deposito === 'pago') hint = '<span class="mh-hint ok">✓ Sinal informado como pago</span>';
  else if (canAct && st === 'aguardando-sinal') hint = `<span class="mh-hint warn">Aguardando o pagamento do sinal de ${money(SINAL)}</span>`;

  const wa = waLink(WHATSAPP, `Olá! Sobre o meu agendamento de ${a.servico || 'serviço'} em ${br(a.data)} às ${a.horario || ''}.`);
  const actions = canAct ? `
    <div class="mh-actions">
      <button type="button" class="tiny" data-act="rebook" data-id="${esc(a.id)}">Reagendar</button>
      <button type="button" class="tiny danger" data-act="cancel" data-id="${esc(a.id)}">Cancelar</button>
      <a class="tiny wa" href="${esc(wa)}" target="_blank" rel="noopener">Falar com a Carol</a>
    </div>` : '';

  return `
    <article class="mh-card is-${esc(st)}${canAct ? '' : ' is-past'}">
      <div class="mh-date"><span class="mh-day">${p.day}</span><span class="mh-mon">${esc(p.mon)}</span><span class="mh-wd">${esc(p.wd)}</span></div>
      <div class="mh-info">
        <div class="mh-top">
          <h3>${esc(a.servico || 'Serviço')}</h3>
          <span class="badge ${esc(st)}">${esc(STATUS_LABEL[st] || st.replace('-', ' ') || '—')}</span>
        </div>
        <p class="mh-meta">
          <span>${MH_ICON.clock}<b>${esc(a.horario || '—')}</b></span>
          <span>${MH_ICON.tag}${money(a.preco)}</span>
        </p>
        ${hint}
        ${actions}
      </div>
    </article>`;
}

/* ---------- ações: cancelar e reagendar ---------- */
async function onAction(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const a = currentById.get(btn.dataset.id);
  if (!a) return;

  if (btn.dataset.act === 'cancel') {
    const ok = await confirmDialog({
      title: 'Cancelar este horário?',
      text: `${a.servico || 'Seu atendimento'} em ${br(a.data)} às ${a.horario || ''} será cancelado e o horário volta para a agenda.`,
      confirmLabel: 'Cancelar horário', cancelLabel: 'Manter', danger: true
    });
    if (!ok) return;
    btn.disabled = true;
    try {
      await db.collection('agendamentos').doc(a.id).update({ status: 'cancelado', canceladoPor: 'cliente' });
      toast('Agendamento cancelado.');
      findAppointments();
    } catch (err) {
      console.error(err); btn.disabled = false;
      toast('Não foi possível cancelar. Tente novamente.');
    }
    return;
  }

  if (btn.dataset.act === 'rebook') {
    if ((a.reagendamentos || 0) >= MAX_REAGENDAMENTOS) {
      toast('Limite de 3 reagendamentos atingido. Fale com a Carol.');
      return;
    }
    const ok = await confirmDialog({
      title: 'Reagendar este horário?',
      text: `O horário atual (${br(a.data)} às ${a.horario || ''}) será liberado e você escolherá uma nova data na próxima tela.`,
      confirmLabel: 'Escolher novo horário', cancelLabel: 'Voltar', danger: false
    });
    if (!ok) return;
    btn.disabled = true;
    try {
      await db.collection('agendamentos').doc(a.id).update({
        status: 'cancelado', canceladoPor: 'reagendamento', reagendamentos: (a.reagendamentos || 0) + 1
      });
      location.href = 'agendamento.html';
    } catch (err) {
      console.error(err); btn.disabled = false;
      toast('Não foi possível reagendar. Tente novamente.');
    }
  }
}

/* ---------- diálogo de confirmação ---------- */
function confirmDialog({ title, text, confirmLabel = 'Confirmar', cancelLabel = 'Voltar', danger = false }) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const o = document.createElement('div');
    o.className = 'mh-dlg-overlay';
    o.innerHTML = `
      <div class="mh-dlg${danger ? ' danger' : ''}" role="alertdialog" aria-modal="true" aria-labelledby="mhDlgT" aria-describedby="mhDlgD">
        <span class="mh-dlg-icon">${danger ? MH_ICON.warn : MH_ICON.refresh}</span>
        <h3 id="mhDlgT">${esc(title)}</h3>
        <p id="mhDlgD">${esc(text)}</p>
        <div class="mh-dlg-actions">
          <button type="button" class="btn btn-ghost" data-r="0">${esc(cancelLabel)}</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-r="1">${esc(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(o);
    requestAnimationFrame(() => o.classList.add('on'));

    const done = (v) => {
      document.removeEventListener('keydown', onKey);
      o.classList.remove('on');
      setTimeout(() => { o.remove(); if (prev && prev.focus) prev.focus(); }, 180);
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') done(false);
      else if (e.key === 'Tab') {
        const f = Array.from(o.querySelectorAll('button'));
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    o.addEventListener('click', (e) => {
      if (e.target === o) return done(false);
      const b = e.target.closest('[data-r]');
      if (b) done(b.dataset.r === '1');
    });
    o.querySelector('[data-r="0"]').focus();
  });
}
