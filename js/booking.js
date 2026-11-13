'use strict';
const bookingState = { service: null, date: keyDate(new Date()), time: null, appointmentId: null };
let servicesCache = [];

/* ===== CALENDÁRIO ===== */
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
const monthsNames = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

document.addEventListener('DOMContentLoaded', async () => {
  if(!document.getElementById('services')) return;
  document.getElementById('pixKey').textContent = PIX_KEY;
  servicesCache = await loadServices();
  renderServices();
  initCalendar();
  await renderSlots();
  updateSummary();

  document.getElementById('name').addEventListener('input', updateSummary);
  document.getElementById('phone').addEventListener('input', e => { formatPhoneInput(e); updateSummary(); });
  document.getElementById('privacy').addEventListener('change', updateSummary);
  document.getElementById('request').addEventListener('click', submitAppointment);
  document.getElementById('copyPix').addEventListener('click', () => {
    navigator.clipboard.writeText(PIX_KEY).then(() => toast('Chave PIX copiada!')).catch(() => toast('Copie manualmente: ' + PIX_KEY));
  });
  document.getElementById('paidPix').addEventListener('click', markPixPaid);
});

function setStep(n) {
  document.querySelectorAll('.step-pill').forEach(p => {
    const s = +p.dataset.step;
    p.classList.toggle('active', s === n);
    p.classList.toggle('done', s < n);
  });
}

function currentStep() {
  if (!bookingState.service) return 1;
  if (!bookingState.time) return 2;
  if (!document.getElementById('name').value.trim() || digits(document.getElementById('phone').value).length < 10) return 3;
  return bookingState.appointmentId ? 4 : 3;
}

function renderServices() {
  const r = document.getElementById('services');
  r.innerHTML = servicesCache.map(s => `
    <button class="service${bookingState.service?.id === s.id ? ' selected' : ''}" data-id="${s.id}" type="button">
      <span class="icon">${esc(s.icon || '💅')}</span>
      <span><strong>${esc(s.name)}</strong><small>${esc(s.description || '')} · ${esc(s.duration)}</small></span>
      <span class="price">${money(s.price)}</span>
    </button>`).join('');
  r.querySelectorAll('.service').forEach(b => b.addEventListener('click', () => {
    bookingState.service = servicesCache.find(s => String(s.id) === b.dataset.id);
    renderServices(); updateSummary();
    setStep(currentStep());
  }));
}

/* ===== LÓGICA DO CALENDÁRIO ===== */
function initCalendar() {
  const mSel = document.getElementById('calMonth');
  const ySel = document.getElementById('calYear');

  mSel.innerHTML = monthsNames.map((m, i) => `<option value="${i}">${m}</option>`).join('');
  mSel.value = currentMonth;

  const yNow = new Date().getFullYear();
  let yOpts = '';
  for (let i = 0; i < 3; i++) yOpts += `<option value="${yNow + i}">${yNow + i}</option>`;
  ySel.innerHTML = yOpts;
  ySel.value = currentYear;

  mSel.addEventListener('change', e => { currentMonth = +e.target.value; renderCalendar(); });
  ySel.addEventListener('change', e => { currentYear = +e.target.value; renderCalendar(); });

  document.getElementById('prevMonth').addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    mSel.value = currentMonth;
    if (ySel.querySelector(`option[value="${currentYear}"]`)) ySel.value = currentYear;
    renderCalendar();
  });

  document.getElementById('nextMonth').addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    mSel.value = currentMonth;
    if (ySel.querySelector(`option[value="${currentYear}"]`)) ySel.value = currentYear;
    renderCalendar();
  });

  renderCalendar();
}

function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Dias vazios antes do dia 1
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day empty';
    grid.appendChild(empty);
  }

  // Dias do mês
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(currentYear, currentMonth, d);
    const k = keyDate(dateObj);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cal-day';
    btn.textContent = d;

    if (dateObj < today) {
      btn.classList.add('disabled');
      btn.disabled = true;
    } else {
      if (k === bookingState.date) btn.classList.add('selected');
      btn.addEventListener('click', async () => {
        bookingState.date = k;
        bookingState.time = null;
        renderCalendar();
        await renderSlots();
        updateSummary();
        setStep(currentStep());
      });
    }
    grid.appendChild(btn);
  }
}

/* ===== HORÁRIOS E ENVIO ===== */
async function renderSlots() {
  const r = document.getElementById('slots'); 
  r.innerHTML = '';
  document.getElementById('chosenDate').textContent = 'Horários para ' + br(bookingState.date, true);

  let busy = [];
  let closed = [];

  try {
    busy = await Promise.all(SLOTS.map(t => isSlotBusy(bookingState.date, t)));
    closed = await Promise.all(SLOTS.map(t => isSlotClosed(bookingState.date, t)));
  } catch (error) {
    console.error("Erro ao checar disponibilidade:", error);
    // Se der erro no Firebase, libera todos os horários para não travar a tela
    busy = SLOTS.map(() => false);
    closed = SLOTS.map(() => false);
  }

  SLOTS.forEach((t, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'slot' + (bookingState.time === t ? ' selected' : '');
    b.textContent = t; 
    b.disabled = busy[i] || closed[i];
    b.addEventListener('click', () => { 
      bookingState.time = t; 
      renderSlots(); 
      updateSummary(); 
      setStep(currentStep()); 
    });
    r.appendChild(b);
  });
}

function updateSummary() {
  document.getElementById('sService').textContent = bookingState.service?.name || '—';
  document.getElementById('sDate').textContent = br(bookingState.date);
  document.getElementById('sTime').textContent = bookingState.time || '—';
  document.getElementById('sPrice').textContent = bookingState.service ? money(bookingState.service.price) : '—';
  const name = document.getElementById('name').value.trim();
  const phone = digits(document.getElementById('phone').value);
  const ok = bookingState.service && bookingState.date && bookingState.time && name.length > 1 && phone.length >= 10 && document.getElementById('privacy').checked;
  document.getElementById('request').disabled = !ok || !!bookingState.appointmentId;
  setStep(currentStep());
}

async function submitAppointment() {
  if (await isSlotBusy(bookingState.date, bookingState.time) || await isSlotClosed(bookingState.date, bookingState.time)) {
    toast('Esse horário não está mais disponível.'); return renderSlots();
  }
  const name = document.getElementById('name').value.trim();
  const phone = digits(document.getElementById('phone').value);

  let clienteId;
  const cs = await db.collection('clientes').where('telefone', '==', phone).get();
  if (!cs.empty) clienteId = cs.docs[0].id;
  else clienteId = (await db.collection('clientes').add({ nome: name, telefone: phone, criadoEm: firebase.firestore.FieldValue.serverTimestamp() })).id;

  const historical = await db.collection('agendamentos').where('clienteId', '==', clienteId)
    .where('status', 'in', ['confirmado', 'concluido']).get();
  const isLoyal = !historical.empty;

  const ref = await db.collection('agendamentos').add({
    clienteId, nome: name, telefone: phone,
    servico: bookingState.service.name, servicoId: bookingState.service.id,
    preco: bookingState.service.price,
    data: bookingState.date, horario: bookingState.time,
    status: 'pendente',
    deposito: isLoyal ? 'nao-aplicavel' : 'pendente',
    reagendamentos: 0, isLoyal,
    criadoEm: firebase.firestore.FieldValue.serverTimestamp()
  });
  bookingState.appointmentId = ref.id;
  toast('Solicitação enviada! Agora pague o sinal de R$ 30.');
  document.getElementById('request').disabled = true;
  document.getElementById('pixHint').textContent = 'Pagamento liberado. Envie o comprovante pelo WhatsApp após pagar.';
  document.getElementById('paidPix').disabled = false;
  document.getElementById('statusNotice').innerHTML = 'Solicitação <b>pendente</b>. Após o sinal, a Carol confirma.';
  renderSlots(); setStep(4);
}

async function markPixPaid() {
  if (!bookingState.appointmentId) return;
  try {
    await db.collection('agendamentos').doc(bookingState.appointmentId).update({
      deposito: 'pago', pixStatus: 'pago',
      pixPagoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast('Recebemos seu aviso! A Carol vai confirmar em breve.');
    document.getElementById('paidPix').disabled = true;
    document.getElementById('pixHint').textContent = 'Aviso enviado. Aguarde a confirmação da Carol.';
  } catch (e) { console.error(e); toast('Erro ao registrar pagamento.'); }
}