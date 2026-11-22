'use strict';
const bookingState = { service: null, date: keyDate(new Date()), time: null, appointmentId: null };
let servicesCache = [];
let bookingCal = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!document.getElementById('services')) return;
  document.getElementById('pixKey').textContent = PIX_KEY;
  servicesCache = await loadServices();
  renderServices();

  bookingCal = createCalendar({
    gridEl: document.getElementById('calendarGrid'),
    monthSelectEl: document.getElementById('calMonth'),
    yearSelectEl: document.getElementById('calYear'),
    prevBtn: document.getElementById('prevMonth'),
    nextBtn: document.getElementById('nextMonth'),
    disablePast: true,
    selectedDate: bookingState.date,
    onSelect: async (k) => {
      bookingState.date = k;
      bookingState.time = null;
      await renderSlots();
      updateSummary();
      setStep(currentStep());
    }
  });

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
