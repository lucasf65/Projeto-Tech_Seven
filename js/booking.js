'use strict';
const bookingState = { service: null, date: keyDate(new Date()), time: null, appointmentId: null };
let servicesCache = [];
let bookingCal = null;
let submitting = false;
const touched = { name: false, phone: false, privacy: false };

const $el = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
  if (!$el('services')) return;
  $el('pixKey').textContent = PIX_KEY_LABEL;
  $el('pixFavorecida').textContent = PIX_FAVORECIDA;
  $el('pixCode').textContent = PIX_COPIA_COLA;

  try {
    servicesCache = await loadServices();
  } catch (e) {
    console.error(e);
    toast('Não foi possível carregar os serviços. Atualize a página.');
  }
  renderServices();

  bookingCal = createCalendar({
    gridEl: $el('calendarGrid'),
    monthSelectEl: $el('calMonth'),
    yearSelectEl: $el('calYear'),
    prevBtn: $el('prevMonth'),
    nextBtn: $el('nextMonth'),
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

  $el('name').addEventListener('input', () => { updateSummary(); if (touched.name) showErrors(); });
  $el('name').addEventListener('blur', () => { touched.name = true; showErrors(); });
  $el('phone').addEventListener('input', e => { formatPhoneInput(e); updateSummary(); if (touched.phone) showErrors(); });
  $el('phone').addEventListener('blur', () => { touched.phone = true; showErrors(); });
  $el('privacy').addEventListener('change', () => { touched.privacy = true; updateSummary(); showErrors(); });
  $el('request').addEventListener('click', submitAppointment);
  $el('copyPix').addEventListener('click', () => copyText(PIX_COPIA_COLA, 'Código PIX copiado! Cole no app do seu banco.'));
  $el('copyKey').addEventListener('click', () => copyText(PIX_KEY, 'Chave PIX copiada!'));
  $el('paidPix').addEventListener('click', markPixPaid);
});

/* ---------- Copiar para a área de transferência ---------- */
function copyText(text, okMsg) {
  const fallback = () => {
    const t = document.createElement('textarea');
    t.value = text; t.setAttribute('readonly', '');
    t.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(t); t.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { /* ignora */ }
    t.remove();
    toast(ok ? okMsg : 'Não deu para copiar. Selecione o código e copie manualmente.');
  };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => toast(okMsg)).catch(fallback);
  } else fallback();
}

/* ---------- Validação ---------- */
function fieldStatus() {
  const name = $el('name').value;
  const phone = $el('phone').value;
  return {
    name: validName(name) ? '' : (cleanName(name) ? 'Use apenas letras (mínimo 2).' : 'Informe seu nome.'),
    phone: validPhone(phone) ? '' : (digits(phone) ? 'Informe um WhatsApp válido com DDD, ex.: (11) 99999-9999.' : 'Informe seu WhatsApp.'),
    privacy: $el('privacy').checked ? '' : 'É necessário autorizar o uso dos dados para agendar.'
  };
}

function showErrors(all = false) {
  const st = fieldStatus();
  if (all || touched.name) setFieldError($el('name'), st.name, 'nameErr');
  if (all || touched.phone) setFieldError($el('phone'), st.phone, 'phoneErr');
  if (all || touched.privacy) setFieldError($el('privacy'), st.privacy, 'privacyErr');
}

function isPastSlot(date, time) {
  const now = new Date();
  if (date !== keyDate(now)) return false;
  const hm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  return time <= hm;
}

function formIsValid() {
  const st = fieldStatus();
  return !!(bookingState.service && bookingState.date && bookingState.time
    && bookingState.date >= keyDate(new Date())
    && !st.name && !st.phone && !st.privacy);
}

/* ---------- Etapas ---------- */
function setStep(n) {
  document.querySelectorAll('.step-pill').forEach(p => {
    const s = +p.dataset.step;
    p.classList.toggle('active', s === n);
    p.classList.toggle('done', s < n);
  });
  // no celular as etapas rolam na horizontal: centraliza a etapa atual (sem mexer na rolagem da página)
  const bar = $el('stepsPills');
  const cur = bar && bar.querySelector('.step-pill.active');
  if (cur && bar.scrollWidth > bar.clientWidth) {
    const left = cur.getBoundingClientRect().left - bar.getBoundingClientRect().left + bar.scrollLeft;
    bar.scrollTo({ left: left - (bar.clientWidth - cur.offsetWidth) / 2, behavior: 'smooth' });
  }
}

function currentStep() {
  if (!bookingState.service) return 1;
  if (!bookingState.time) return 2;
  if (!validName($el('name').value) || !validPhone($el('phone').value)) return 3;
  return bookingState.appointmentId ? 4 : 3;
}

/* ---------- Serviços e horários ---------- */
function renderServices() {
  const r = $el('services');
  if (!servicesCache.length) {
    r.innerHTML = '<div class="empty">Nenhum serviço disponível no momento.</div>';
    return;
  }
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
  const r = $el('slots');
  r.innerHTML = '';
  $el('chosenDate').textContent = 'Horários para ' + br(bookingState.date, true);

  let busy = [];
  let closed = [];

  try {
    busy = await Promise.all(SLOTS.map(t => isSlotBusy(bookingState.date, t)));
    closed = await Promise.all(SLOTS.map(t => isSlotClosed(bookingState.date, t)));
  } catch (error) {
    console.error('Erro ao checar disponibilidade:', error);
    busy = SLOTS.map(() => false);
    closed = SLOTS.map(() => false);
  }

  SLOTS.forEach((t, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'slot' + (bookingState.time === t ? ' selected' : '');
    b.textContent = t;
    b.disabled = busy[i] || closed[i] || isPastSlot(bookingState.date, t);
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
  $el('sService').textContent = bookingState.service?.name || '—';
  $el('sDate').textContent = br(bookingState.date);
  $el('sTime').textContent = bookingState.time || '—';
  $el('sPrice').textContent = bookingState.service ? money(bookingState.service.price) : '—';
  $el('request').disabled = submitting || !formIsValid() || !!bookingState.appointmentId;
  setStep(currentStep());
}

/* ---------- Envio ---------- */
async function submitAppointment() {
  if (submitting || bookingState.appointmentId) return;

  const name = cleanName($el('name').value);
  const phone = digits($el('phone').value);

  // revalida tudo no envio, mesmo que o botão tenha sido habilitado por outro caminho
  touched.name = touched.phone = touched.privacy = true;
  showErrors(true);
  if (!bookingState.service) { toast('Escolha o serviço.'); return; }
  if (!bookingState.time) { toast('Escolha o horário.'); return; }
  if (bookingState.date < keyDate(new Date())) { toast('Escolha uma data a partir de hoje.'); return; }
  if (isPastSlot(bookingState.date, bookingState.time)) { toast('Esse horário já passou. Escolha outro.'); bookingState.time = null; renderSlots(); updateSummary(); return; }
  if (!validName(name) || !validPhone(phone) || !$el('privacy').checked) { toast('Confira os campos destacados.'); return; }

  const btn = $el('request');
  submitting = true;
  btn.disabled = true;
  btn.textContent = 'Enviando…';

  try {
    if (await isSlotBusy(bookingState.date, bookingState.time) || await isSlotClosed(bookingState.date, bookingState.time)) {
      toast('Esse horário não está mais disponível.');
      bookingState.time = null;
      await renderSlots();
      return;
    }

    // Cadastro da cliente: o id do documento é o telefone. Se ela já existe, a regra do
    // banco recusa a recriação (permission-denied) e seguimos normalmente.
    try {
      await db.collection('clientes').doc(phone).set({
        nome: name, telefone: phone,
        criadoEm: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) {
      if (e.code !== 'permission-denied') throw e;
    }

    // Fidelização e sinal são definidos pela Carol ao aprovar a solicitação.
    const ref = await db.collection('agendamentos').add({
      clienteId: phone, nome: name, telefone: phone,
      servico: bookingState.service.name, servicoId: bookingState.service.id,
      preco: bookingState.service.price,
      data: bookingState.date, horario: bookingState.time,
      status: 'pendente',
      deposito: 'pendente',
      reagendamentos: 0, isLoyal: false,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });

    bookingState.appointmentId = ref.id;
    toast('Solicitação enviada! Agora pague o sinal de R$ 30.');
    $el('pixHint').textContent = 'Pagamento liberado. Envie o comprovante pelo WhatsApp após pagar.';
    $el('paidPix').disabled = false;
    $el('statusNotice').innerHTML = 'Solicitação <b>pendente</b>. Após o sinal, a Carol confirma.';
    renderSlots();
    setStep(4);
  } catch (e) {
    console.error(e);
    toast('Não foi possível enviar a solicitação. Tente novamente.');
  } finally {
    submitting = false;
    btn.textContent = 'Enviar solicitação';
    updateSummary();
  }
}

async function markPixPaid() {
  if (!bookingState.appointmentId) return;
  const btn = $el('paidPix');
  btn.disabled = true;
  try {
    await db.collection('agendamentos').doc(bookingState.appointmentId).update({
      deposito: 'pago', pixStatus: 'pago',
      pixPagoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast('Recebemos seu aviso! A Carol vai confirmar em breve.');
    $el('pixHint').textContent = 'Aviso enviado. Aguarde a confirmação da Carol.';
  } catch (e) {
    console.error(e);
    btn.disabled = false;
    toast('Erro ao registrar pagamento.');
  }
}
