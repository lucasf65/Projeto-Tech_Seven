'use strict';

const adminState = { isAdmin: false };
const adminEl = id => document.getElementById(id);
const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const STATUS_LABELS = {
  pendente: 'Pendente',
  'aguardando-sinal': 'Aguardando sinal',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  recusado: 'Recusado',
  cancelado: 'Cancelado'
};
let openCatalogItem;

document.addEventListener('DOMContentLoaded', () => {
  if (!adminEl('adminLogin')) return;
  initServiceModal();
  initAdminCalendarModal();

  adminEl('adminLoginBtn').addEventListener('click', () => {
    const email = adminEl('adminEmail').value.trim();
    const password = adminEl('adminPassword').value;
    if (!email || !password) return toast('Preencha e-mail e senha.');
    if (!validEmail(email)) return toast('Informe um e-mail válido.');
    adminLogin(email, password);
  });

  adminEl('adminLogout').addEventListener('click', adminLogout);
  adminEl('statusFilter').addEventListener('change', renderAdminAppointments);
  adminEl('dateFilter').addEventListener('change', renderAdminAppointments);
  adminEl('addGal').addEventListener('click', addGaleria);

  if (typeof auth === 'undefined') {
    adminEl('adminLoginBtn').disabled = true;
    toast('O acesso ao painel ainda não está configurado.');
    return;
  }
  auth.onAuthStateChanged(async user => {
    try {
      const access = user && await db.collection('admins').doc(user.uid).get();
      if (auth.currentUser?.uid !== user?.uid) return;
      adminState.isAdmin = Boolean(access?.exists);
      adminEl('adminLogin').classList.toggle('hidden', adminState.isAdmin);
      adminEl('adminPanel').classList.toggle('hidden', !adminState.isAdmin);
      if (adminState.isAdmin) await renderAllAdmin();
    } catch {
      toast('Não foi possível verificar o acesso ao painel. Tente entrar novamente.');
    }
  });
});

async function adminApi(action, data = {}, write = false) {
  const user = auth.currentUser;
  if (!user || !adminState.isAdmin) throw new Error('Entre novamente na área administrativa.');
  const token = await user.getIdToken();
  const params = new URLSearchParams(write ? { action } : { action, ...data });
  const headers = { Authorization: `Bearer ${token}` };
  const options = { headers, cache: 'no-store' };
  if (write) {
    options.method = 'POST';
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify({ action, ...data });
  }
  const response = await fetch(`/api/booking?${params}`, options).catch(() => {
    throw new Error('Confira sua conexão e tente novamente.');
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    const fallback = response.status === 401 || response.status === 403
      ? 'Entre novamente com uma conta administrativa.'
      : 'O serviço está indisponível. Tente novamente em instantes.';
    throw new Error(result?.error?.message || fallback);
  }
  return result;
}

function adminFeedback(id, message = '', error = false) {
  const element = adminEl(id);
  element.textContent = message;
  element.classList.toggle('admin-feedback-error', error);
}

function focusDialog(overlay, element) {
  requestAnimationFrame(() => {
    if (overlay.classList.contains('active')) element.focus();
  });
}

function trapDialogFocus(overlay) {
  overlay.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const candidates = [...overlay.querySelectorAll('button, input, select, summary, a[href]')];
    const focusable = candidates.filter(element => !element.disabled && element.getClientRects().length);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    }
  });
}

function initServiceModal() {
  const overlay = adminEl('serviceModal');
  const opener = adminEl('openServiceModal');
  const form = adminEl('serviceForm');
  const save = adminEl('saveNewService');
  let editingId = null;
  let trigger = opener;

  const dialog = createModal({
    overlayEl: overlay,
    closeBtn: overlay.querySelector('.close-modal'),
    lockScroll: true,
    onOpen: () => focusDialog(overlay, adminEl('newServiceName')),
    onClose: () => (trigger.isConnected ? trigger : opener).focus()
  });
  trapDialogFocus(overlay);

  openCatalogItem = (item = {}, button = opener) => {
    if (save.disabled) return;
    trigger = button;
    editingId = item.id ?? null;
    form.reset();
    adminEl('serviceModalTitle').textContent = editingId === null ? 'Novo item do catálogo' : 'Editar item do catálogo';
    adminEl('newServiceName').value = item.name ?? '';
    adminEl('newServiceKind').value = item.kind === 'pacote' ? 'pacote' : 'servico';
    adminEl('newServiceDesc').value = item.description ?? '';
    adminEl('newServiceDuration').value = item.duration ?? '';
    adminEl('newServicePrice').value = item.price ?? '';
    adminEl('newServiceIcon').value = item.icon || '💅';
    adminEl('newServiceImage').value = item.image ?? '';
    adminFeedback('serviceFeedback');
    dialog.open();
  };
  opener.addEventListener('click', () => openCatalogItem());

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (save.disabled) return;
    const service = {
      name: adminEl('newServiceName').value.trim().replace(/\s+/g, ' '),
      description: adminEl('newServiceDesc').value.trim(),
      duration: adminEl('newServiceDuration').value.trim(),
      price: adminEl('newServicePrice').valueAsNumber,
      icon: adminEl('newServiceIcon').value.trim() || '💅',
      image: adminEl('newServiceImage').value.trim(),
      kind: adminEl('newServiceKind').value
    };
    if (editingId !== null) service.id = editingId;
    save.disabled = true;
    adminFeedback('serviceFeedback', 'Salvando…');
    try {
      await adminApi('service', { operation: editingId === null ? 'create' : 'update', service }, true);
      dialog.close();
      await renderAdminServices();
      opener.focus();
      toast('Item salvo no catálogo.');
    } catch (error) {
      if (dialog.isOpen()) adminFeedback('serviceFeedback', error.message, true);
      else toast(error.message);
    } finally {
      save.disabled = false;
    }
  });
}

function addHoursRow(container, label, values = ['', '']) {
  const row = document.createElement('div');
  row.className = 'agenda-hours-row';
  row.innerHTML = `
    <label>Início <input type="time" required></label>
    <label>Fim <input type="time" required></label>
    <button class="tiny danger" type="button">Remover</button>`;
  const [start, end] = row.querySelectorAll('input');
  start.value = values[0];
  end.value = values[1] === '24:00' ? '00:00' : values[1];
  start.setAttribute('aria-label', `Início do período de ${label}`);
  end.setAttribute('aria-label', `Fim do período de ${label}`);
  const remove = row.querySelector('button');
  remove.setAttribute('aria-label', `Remover período de ${label}`);
  remove.addEventListener('click', () => {
    row.remove();
    container.dispatchEvent(new Event('change', { bubbles: true }));
    container.parentElement.querySelector('.agenda-add-period, #addExceptionWindow')?.focus();
  });
  container.appendChild(row);
  return start;
}

function readHours(container) {
  return [...container.querySelectorAll('.agenda-hours-row')].map(row => {
    const [start, end] = [...row.querySelectorAll('input')].map(input => input.value);
    return [start, end === '00:00' ? '24:00' : end];
  });
}

function startingTimes(windows) {
  const times = new Set();
  for (const [start, end] of windows) {
    if (!start || !end || start >= end) continue;
    const [hour, minute] = start.split(':').map(Number);
    const [lastHour, lastMinute] = end.split(':').map(Number);
    for (let value = hour * 60 + minute; value < lastHour * 60 + lastMinute; value += 60) {
      times.add(`${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`);
    }
  }
  return [...times].sort();
}

function initAdminCalendarModal() {
  const overlay = adminEl('agendaModal');
  const opener = adminEl('openAgendaModal');
  const dateInput = adminEl('availDate');
  const daily = adminEl('exceptionForm');
  const weekly = adminEl('weeklyForm');
  const weeklyEditor = adminEl('weeklyEditor');
  const weeklyHours = adminEl('weeklyHours');
  const mode = adminEl('exceptionMode');
  const specialHours = adminEl('specialHours');
  const specialRows = adminEl('exceptionWindows');
  const blockedSlots = adminEl('blockedSlots');
  const retry = adminEl('retrySchedule');
  let calendar;
  let schedule;
  let requestNumber = 0;
  let saving = false;
  let blocked = new Set();
  dateInput.value = keyDate(new Date());

  function renderBlocks() {
    const weekday = new Date(dateInput.value + 'T12:00:00').getDay();
    const slots = mode.value === 'special'
      ? startingTimes(readHours(specialRows))
      : schedule?.weekly?.[weekday] ? startingTimes(schedule.weekly[weekday]) : schedule?.starts ?? [];
    const container = adminEl('modalAvailability');
    container.replaceChildren();
    for (const time of [...new Set([...slots, ...blocked])].sort()) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = blocked.has(time);
      input.addEventListener('change', () => {
        if (input.checked) blocked.add(time);
        else blocked.delete(time);
      });
      label.append(input, document.createTextNode(time));
      container.appendChild(label);
    }
    if (!container.childElementCount) container.textContent = 'Nenhum horário neste dia.';
  }

  function changeMode() {
    specialHours.hidden = mode.value !== 'special';
    blockedSlots.hidden = mode.value === 'closed';
    if (mode.value === 'special' && !specialRows.childElementCount) {
      addHoursRow(specialRows, 'horários especiais');
    }
    specialRows.querySelectorAll('input').forEach(input => {
      input.disabled = specialHours.hidden;
    });
    if (!blockedSlots.hidden) renderBlocks();
  }

  function renderWeekly() {
    weeklyHours.replaceChildren();
    WEEKDAYS.forEach((day, index) => {
      const group = document.createElement('fieldset');
      const legend = document.createElement('legend');
      const hours = document.createElement('div');
      const add = document.createElement('button');
      group.className = 'agenda-day';
      legend.textContent = day;
      hours.dataset.weekday = index;
      add.type = 'button';
      add.className = 'tiny agenda-add-period';
      add.textContent = 'Adicionar período';
      add.setAttribute('aria-label', `Adicionar período em ${day}`);
      add.addEventListener('click', () => addHoursRow(hours, day).focus());
      for (const window of schedule.weekly[index] ?? []) addHoursRow(hours, day, window);
      group.append(legend, hours, add);
      weeklyHours.appendChild(group);
    });
  }

  async function loadSchedule() {
    const date = dateInput.value;
    const currentLoad = ++requestNumber;
    const weekday = new Date(date + 'T12:00:00').getDay();
    adminEl('modalSelectedDate').textContent = br(date);
    daily.hidden = true;
    weeklyEditor.hidden = true;
    retry.hidden = true;
    adminFeedback('exceptionFeedback');
    adminFeedback('weeklyFeedback');
    adminFeedback('scheduleFeedback', 'Carregando a agenda…');
    try {
      const result = await adminApi('schedule', { date });
      if (currentLoad !== requestNumber) return;
      schedule = { ...result, weekly: result.weekly ?? result.defaultWeekly ?? {} };
      const standard = schedule.weekly[weekday] ?? [];
      adminEl('standardHours').textContent = standard.length
        ? `Horários semanais: ${standard.map(([start, end]) => `${start}–${end}`).join(', ')}.`
        : 'A agenda semanal está fechada neste dia.';
      const exception = schedule.exception;
      const windows = exception?.windows;
      mode.value = windows == null ? 'regular' : windows.length ? 'special' : 'closed';
      blocked = new Set(exception?.closed ?? []);
      specialRows.replaceChildren();
      for (const window of windows ?? []) addHoursRow(specialRows, 'horários especiais', window);
      const appointments = schedule.appointments ?? schedule.conflicts ?? [];
      const occupied = appointments.map(item => (
        typeof item === 'string' ? item : [item.time ?? item.horario, item.service ?? item.servico].filter(Boolean).join(' ')
      )).filter(Boolean);
      adminEl('dayAppointments').textContent = occupied.length
        ? `Solicitações e atendimentos que ocupam a agenda: ${occupied.join(', ')}.`
        : 'Nenhuma solicitação ou atendimento ocupando esta data.';
      changeMode();
      renderWeekly();
      daily.hidden = false;
      weeklyEditor.hidden = false;
      adminFeedback('scheduleFeedback');
      return true;
    } catch (error) {
      if (currentLoad !== requestNumber) return;
      adminFeedback('scheduleFeedback', error.message, true);
      retry.hidden = false;
    }
  }

  async function saveSchedule(action, data, feedbackId, form) {
    if (saving) return;
    saving = true;
    const buttons = [daily.querySelector('button[type=submit]'), weekly.querySelector('button[type=submit]')];
    for (const button of buttons) button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    adminFeedback(feedbackId, 'Salvando…');
    const calendarBox = overlay.querySelector('.modal-calendar-box');
    calendarBox.inert = true;
    daily.inert = true;
    weekly.inert = true;
    try {
      await adminApi(action, data, true);
      if (await loadSchedule()) adminFeedback('scheduleFeedback', 'Horários atualizados.');
    } catch (error) {
      adminFeedback(feedbackId, error.message, true);
    } finally {
      saving = false;
      calendarBox.inert = false;
      daily.inert = false;
      weekly.inert = false;
      for (const button of buttons) button.disabled = false;
      form.removeAttribute('aria-busy');
      if (dialog.isOpen()) form.querySelector('button[type=submit]').focus();
    }
  }

  const dialog = createModal({
    overlayEl: overlay,
    openBtn: opener,
    closeBtn: adminEl('closeAgendaModal'),
    extraCloseBtns: [adminEl('doneAgendaModal')],
    lockScroll: true,
    onOpen: () => {
      if (!calendar) {
        calendar = createCalendar({
          gridEl: adminEl('adminCalendarGrid'),
          monthLabelEl: adminEl('adminCalMonth'),
          yearLabelEl: adminEl('adminCalYear'),
          prevBtn: adminEl('adminPrevMonth'),
          nextBtn: adminEl('adminNextMonth'),
          selectedDate: dateInput.value,
          onSelect: date => { dateInput.value = date; loadSchedule(); }
        });
      }
      loadSchedule();
      focusDialog(overlay, adminEl('closeAgendaModal'));
    },
    onClose: () => opener.focus()
  });
  trapDialogFocus(overlay);
  window.__openAgendaModal = dialog.open;
  retry.addEventListener('click', loadSchedule);
  mode.addEventListener('change', changeMode);
  specialRows.addEventListener('change', renderBlocks);
  adminEl('addExceptionWindow').addEventListener('click', () => addHoursRow(specialRows, 'horários especiais').focus());
  daily.addEventListener('submit', event => {
    event.preventDefault();
    const windows = mode.value === 'regular' ? null : mode.value === 'closed' ? [] : readHours(specialRows);
    if (mode.value === 'special' && !windows.length) {
      adminFeedback('exceptionFeedback', 'Adicione um período ou escolha fechar o dia.', true);
      return;
    }
    saveSchedule('exception', { date: dateInput.value, windows, closed: [...blocked] }, 'exceptionFeedback', daily);
  });
  weekly.addEventListener('submit', event => {
    event.preventDefault();
    const hours = Object.fromEntries([...weeklyHours.querySelectorAll('[data-weekday]')]
      .map(container => [container.dataset.weekday, readHours(container)]));
    saveSchedule('weekly', { weekly: hours }, 'weeklyFeedback', weekly);
  });
}

async function adminLogin(email, password) {
  const button = adminEl('adminLoginBtn');
  button.disabled = true;
  try {
    const { user } = await auth.signInWithEmailAndPassword(email, password);
    const access = await db.collection('admins').doc(user.uid).get();
    if (!access.exists) {
      await auth.signOut();
      toast('Sua conta não tem acesso a este painel.');
      return;
    }
    adminEl('adminEmail').value = '';
    adminEl('adminPassword').value = '';
    toast('Bem-vinda, Carol!');
  } catch {
    toast('Não foi possível entrar. Confira o e-mail e a senha.');
  } finally {
    button.disabled = false;
  }
}

async function adminLogout() {
  try {
    await auth.signOut();
    adminFeedback('adminAppointmentStatus');
    toast('Você saiu do painel.');
  } catch {
    toast('Não foi possível sair agora. Tente novamente.');
  }
}

async function renderAllAdmin() {
  await Promise.all([
    renderStats(), populateDateFilter(), renderAdminAppointments(),
    renderAdminServices(), renderRevenue(), renderAdminGaleria()
  ]);
}

async function renderStats() {
  try {
    const [pending, awaiting, today] = await Promise.all([
      db.collection('agendamentos').where('status', '==', 'pendente').get(),
      db.collection('agendamentos').where('status', '==', 'aguardando-sinal').get(),
      db.collection('agendamentos').where('data', '==', keyDate(new Date())).where('status', '==', 'confirmado').get()
    ]);
    adminEl('stats').innerHTML = `
      <div class="stat"><b>${pending.size}</b><span>Pendentes</span></div>
      <div class="stat"><b>${awaiting.size}</b><span>Aguardando sinal</span></div>
      <div class="stat"><b>${today.size}</b><span>Confirmados hoje</span></div>`;
  } catch {
    adminEl('stats').textContent = 'Não foi possível carregar o resumo de hoje.';
  }
}

async function populateDateFilter() {
  const select = adminEl('dateFilter');
  try {
    const snap = await db.collection('agendamentos').orderBy('data').get();
    const dates = [...new Set(snap.docs.map(doc => doc.data().data))]
      .filter(date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date))
      .sort();
    const previous = select.value;
    select.replaceChildren(new Option('Todas as datas', 'all'), ...dates.map(date => new Option(br(date), date)));
    if (dates.includes(previous)) select.value = previous;
  } catch {
    adminFeedback('adminAppointmentStatus', 'Não foi possível atualizar o filtro por data.', true);
  }
}

let appointmentLoadId = 0;

async function renderAdminAppointments() {
  const loadId = ++appointmentLoadId;
  const status = adminEl('statusFilter').value;
  const date = adminEl('dateFilter').value;
  const container = adminEl('adminAppointments');
  container.setAttribute('aria-busy', 'true');
  container.innerHTML = '<p class="empty">Carregando solicitações…</p>';

  try {
    let query = db.collection('agendamentos');
    if (status !== 'all') query = query.where('status', '==', status);
    if (date && date !== 'all') query = query.where('data', '==', date);
    const snapshot = await query.get();
    if (loadId !== appointmentLoadId) return;
    const appointments = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    appointments.sort((a, b) => (b.criadoEm?.toMillis?.() || 0) - (a.criadoEm?.toMillis?.() || 0));
    if (appointments.length) container.replaceChildren(...appointments.map(appointmentRow));
    else container.innerHTML = '<p class="empty">Nenhuma solicitação encontrada com estes filtros.</p>';
  } catch {
    if (loadId === appointmentLoadId) {
      container.innerHTML = '<p class="empty" role="status">Não foi possível carregar as solicitações.</p>';
    }
  } finally {
    if (loadId === appointmentLoadId) container.removeAttribute('aria-busy');
  }
}

function appointmentRow(appointment) {
  const row = document.createElement('article');
  row.className = 'appointment';
  const status = STATUS_LABELS[appointment.status] ? appointment.status : '';
  const pix = appointment.sinalVerificadoEm
    ? ' · <b>Sinal verificado</b>'
    : ['informado', 'pago'].includes(appointment.pixStatus) ? ' · <b>Cliente informou o PIX</b>' : '';
  const refund = appointment.reembolsoStatus === 'pendente' ? '<p><strong>Reembolso pendente</strong></p>' : '';
  const change = appointment.trocaEmAnalise ? '<p>Troca de horário em análise</p>'
    : appointment.reagendamentoPendente ? '<p>Reserva original mantida durante a análise da troca</p>' : '';
  const count = Number(appointment.reagendamentos) || 0;
  row.innerHTML = `
    <div class="appointment-head">
      <div>
        <h3>${esc(appointment.servico)}</h3>
        <p>${esc(appointment.nome)} · ${formatPhoneDisplay(appointment.telefone)}</p>
        <p>${br(appointment.data)} às <b>${esc(appointment.horario)}</b> · ${money(appointment.preco)}${count ? ` · ${count}x reagendado` : ''}${pix}</p>
        ${change}${refund}
      </div>
      <span class="badge ${status}">${STATUS_LABELS[status] ?? 'Status desconhecido'}</span>
    </div>
    <div class="actions"></div>`;
  const actions = row.querySelector('.actions');

  function addAction(label, nextStatus, role) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `tiny ${role}`;
    button.textContent = label;
    button.addEventListener('click', async () => {
      const buttons = actions.querySelectorAll('button');
      for (const item of buttons) item.disabled = true;
      adminFeedback('adminAppointmentStatus', 'Atualizando a solicitação…');
      try {
        const result = await adminApi('status', { id: appointment.id, status: nextStatus }, true);
        const updatedStatus = STATUS_LABELS[result.appointment?.status ?? result.status];
        adminFeedback('adminAppointmentStatus', updatedStatus ? `Novo status: ${updatedStatus}.` : 'Status atualizado.');
        await Promise.all([renderAdminAppointments(), renderStats(), renderRevenue()]);
      } catch (error) {
        adminFeedback('adminAppointmentStatus', error.message, true);
      } finally {
        for (const item of buttons) item.disabled = false;
      }
    });
    actions.appendChild(button);
  }

  function addWhatsApp(label, message) {
    const link = document.createElement('a');
    link.className = 'tiny wa';
    link.href = waLink(appointment.telefone, message);
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = label;
    actions.appendChild(link);
  }

  if (appointment.reembolsoStatus === 'pendente') addAction('Registrar reembolso já resolvido', 'resolver-reembolso', 'go');
  if (appointment.reagendamentoPendente) return row;
  if (status === 'pendente') {
    addAction('Aprovar', 'aprovar', 'go');
    addAction('Recusar', 'recusado', 'danger');
    addAction('Cancelar', 'cancelado', 'danger');
  } else if (status === 'aguardando-sinal') {
    addWhatsApp('Cobrar sinal', `Oi ${appointment.nome}! A solicitação de ${appointment.servico} em ${br(appointment.data)} às ${appointment.horario} está aguardando o sinal de R$ ${SINAL}.`);
    addAction('Confirmar sinal recebido', 'confirmado', 'go');
    addAction('Recusar', 'recusado', 'danger');
    addAction('Cancelar', 'cancelado', 'danger');
  } else if (status === 'confirmado') {
    addWhatsApp('Lembrar pelo WhatsApp', `Oi ${appointment.nome}! Lembrete do seu horário de ${appointment.servico} em ${br(appointment.data)} às ${appointment.horario}.`);
    addAction('Concluir', 'concluido', 'go');
    addAction('Cancelar', 'cancelado', 'danger');
  }
  return row;
}

async function renderAdminServices() {
  const container = adminEl('adminServices');
  container.setAttribute('aria-busy', 'true');
  container.innerHTML = '<p class="empty">Carregando o catálogo…</p>';
  try {
    const { services } = await adminApi('services', { admin: 1 });
    container.replaceChildren();
    if (!services.length) {
      const empty = document.createElement('p');
      empty.textContent = 'Nenhum item no catálogo.';
      empty.className = 'empty';
      const seed = catalogButton('Cadastrar serviços iniciais', 'go', () => changeCatalog('seed', {}, seed));
      container.append(empty, seed);
    } else {
      for (const item of services) {
        const archived = item.active === false || Boolean(item.archived);
        const row = document.createElement('div');
        const details = document.createElement('div');
        row.className = 'admin-service catalog-row';
        details.innerHTML = `<strong>${esc(item.name)}</strong>
          <p>${item.kind === 'pacote' ? 'Pacote' : 'Serviço'} · ${esc(item.duration)} · ${money(item.price)}${archived ? ' · Arquivado' : ''}</p>`;
        const controls = document.createElement('div');
        controls.className = 'catalog-actions';
        const edit = catalogButton('Editar', '', () => openCatalogItem(item, edit));
        const action = catalogButton(archived ? 'Reativar' : 'Arquivar', archived ? 'go' : 'danger', () => {
          if (!archived && !confirm(`Arquivar ${item.name}? O histórico dos atendimentos será mantido.`)) return;
          changeCatalog(archived ? 'restore' : 'archive', { id: item.id }, action);
        });
        controls.append(edit, action);
        row.append(details, controls);
        container.appendChild(row);
      }
    }
  } catch {
    container.replaceChildren();
    const message = document.createElement('p');
    message.className = 'empty';
    message.setAttribute('role', 'status');
    message.textContent = 'Não foi possível carregar o catálogo.';
    container.append(message, catalogButton('Carregar novamente', '', renderAdminServices));
  } finally {
    container.removeAttribute('aria-busy');
  }
}

function catalogButton(text, role, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `tiny ${role}`;
  button.textContent = text;
  button.addEventListener('click', onClick);
  return button;
}

async function changeCatalog(operation, data, button) {
  button.disabled = true;
  try {
    await adminApi('service', { operation, ...data }, true);
    await renderAdminServices();
    adminEl('openServiceModal').focus();
    toast('Catálogo atualizado.');
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
}

async function renderRevenue() {
  try {
    const snap = await db.collection('agendamentos').where('status', '==', 'concluido').get();
    const total = snap.docs.reduce((s, d) => s + (+d.data().preco || 0), 0);
    document.getElementById('completedCount').textContent = snap.size;
    document.getElementById('revenue').textContent = money(total);
  } catch(e) { console.error(e); }
}

async function renderAdminGaleria() {
  const r = document.getElementById('adminGaleria');
  try {
    const snap = await db.collection('galeria').orderBy('ordem').get();
    if (snap.empty) { r.innerHTML = '<div class="empty" style="font-size:12px;padding:10px">Nenhuma foto cadastrada.</div>'; return; }
    r.innerHTML = '';
    snap.docs.forEach(doc => {
      const g = { id: doc.id, ...doc.data() };
      const row = document.createElement('div'); row.className = 'admin-service';
      row.innerHTML = `
        <img src="${esc(g.url)}" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:8px">
        <span style="flex:1;font-size:12px;word-break:break-all">${esc(g.alt || g.url)}</span>
        <button class="tiny danger">✕</button>`;
      row.querySelector('button').addEventListener('click', async () => {
        if (confirm('Remover esta foto?')) {
          try {
            await db.collection('galeria').doc(g.id).delete();
            renderAdminGaleria();
            toast('Foto removida.');
          } catch(e) { console.error(e); toast('Erro ao remover foto.'); }
        }
      });
      r.appendChild(row);
    });
  } catch(e) { console.error(e); }
}

async function addGaleria() {
  const url = document.getElementById('galUrl').value.trim();
  const alt = document.getElementById('galAlt').value.trim();
  if (!url) return toast('Informe a URL da imagem.');
  if (!validHttpsUrl(url)) return toast('Informe um endereço válido, começando com https://');
  if (alt.length > 120) return toast('A descrição pode ter até 120 caracteres.');

  try {
    const snap = await db.collection('galeria').orderBy('ordem', 'desc').limit(1).get();
    const ordem = snap.empty ? 1 : (+snap.docs[0].data().ordem || 0) + 1;
    await db.collection('galeria').add({ url, alt, ordem });
    document.getElementById('galUrl').value = ''; document.getElementById('galAlt').value = '';
    renderAdminGaleria(); toast('Foto adicionada.');
  } catch(e) { console.error(e); toast('Erro ao adicionar foto.'); }
}
