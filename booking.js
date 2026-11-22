'use strict';

const salonDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
});
function salonDate() {
  const parts = salonDateFormat.formatToParts();
  const { year, month, day } = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${year}-${month}-${day}`;
}

const bookingState = {
  service: null, date: salonDate(), time: null, appointment: null,
  submitting: false, intent: null, replacement: null
};
const $el = id => document.getElementById(id);
let bookingCalendar;
let availabilityRequest;

document.addEventListener('DOMContentLoaded', () => {
  const dateLimit = new Date(`${salonDate()}T00:00:00Z`);
  dateLimit.setUTCDate(dateLimit.getUTCDate() + 366);
  bookingCalendar = createCalendar({
    gridEl: $el('calendarGrid'),
    monthSelectEl: $el('calMonth'),
    yearSelectEl: $el('calYear'),
    prevBtn: $el('prevMonth'),
    nextBtn: $el('nextMonth'),
    disablePast: true,
    today: salonDate,
    maxDate: dateLimit.toISOString().slice(0, 10),
    selectedDate: bookingState.date,
    onSelect(date) {
      if (date === bookingState.date) return;
      bookingState.date = date;
      loadAvailability();
    }
  });

  $el('bookingForm').addEventListener('submit', submitAppointment);
  $el('retryServices').addEventListener('click', () => {
    $el('serviceTitle').focus();
    loadBookingServices();
  });
  $el('retrySlots').addEventListener('click', () => {
    $el('slotsTitle').focus();
    loadAvailability();
  });
  $el('name').addEventListener('input', () => setFieldError($el('name'), '', 'nameErr'));
  $el('phone').addEventListener('input', () => setFieldError($el('phone'), '', 'phoneErr'));
  $el('phone').addEventListener('blur', () => {
    const phone = $el('phone').value;
    if (validPhone(phone)) $el('phone').value = formatPhoneDisplay(normalizeBrazilianPhone(phone));
  });
  $el('privacy').addEventListener('change', () => setFieldError($el('privacy'), '', 'privacyErr'));
  $el('copyReference').addEventListener('click', () => copyBookingText(bookingState.appointment.id, 'Código copiado.'));
  $el('copyPix').addEventListener('click', () => copyBookingText(PIX_KEY, 'Chave Pix copiada.'));
  $el('paidPix').addEventListener('click', markPixPaid);
  $el('leaveReschedule').addEventListener('click', () => {
    clearReplacement();
    $el('serviceTitle').focus();
  });

  resumeReplacement();
  updateSummary();
  loadAvailability();
  loadBookingServices();
});

async function bookingApi(params, { body, signal } = {}) {
  const query = params ? `?${new URLSearchParams(params)}` : '';
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 12000);
  try {
    const response = await fetch(`/api/booking${query}`, {
      ...(body && { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      signal: controller.signal
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error?.message || 'Confira seus dados e o horário selecionado antes de tentar novamente.');
      error.code = data.error?.code;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

function resumeReplacement() {
  try {
    const context = JSON.parse(sessionStorage.getItem('booking-reschedule'));
    if (!context || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(context.reference)
        || typeof context.phone !== 'string' || !validPhone(context.phone)) return;
    bookingState.replacement = context;
    $el('rescheduleNotice').hidden = false;
    $el('phone').readOnly = true;
    $el('phone').value = formatPhoneDisplay(context.phone);
  } catch {
    // O agendamento ainda pode ser preenchido com armazenamento indisponível.
  }
}

function clearReplacement() {
  bookingState.replacement = null;
  $el('phone').readOnly = false;
  $el('rescheduleNotice').hidden = true;
  try {
    sessionStorage.removeItem('booking-reschedule');
  } catch {
    // O estado desta página já foi atualizado.
  }
}

function setStep(step) {
  const bar = $el('stepsPills');
  if (bar.dataset.activeStep === String(step)) return;
  bar.dataset.activeStep = step;
  for (const pill of bar.querySelectorAll('.step-pill')) {
    const index = Number(pill.dataset.step);
    pill.classList.toggle('active', index === step);
    pill.classList.toggle('done', index < step);
    if (index === step) pill.setAttribute('aria-current', 'step');
    else pill.removeAttribute('aria-current');
  }
}

function updateSummary() {
  const { service, date, time, appointment, submitting } = bookingState;
  $el('sService').textContent = appointment?.service ?? service?.name ?? '—';
  $el('sDate').textContent = br(appointment?.date ?? date);
  $el('sTime').textContent = appointment?.time ?? time ?? '—';
  $el('sPrice').textContent = service ? money(appointment?.price ?? service.price) : '—';
  $el('sSinal').textContent = appointment?.signal === 0 ? 'Sem sinal' : money(appointment?.signal ?? SINAL);
  $el('request').disabled = submitting || Boolean(appointment);
  $el('request').textContent = submitting ? 'Enviando…' : 'Enviar solicitação';
  setStep(appointment ? 4 : time ? 3 : service ? 2 : 1);
}

async function loadBookingServices() {
  const list = $el('services');
  const status = $el('servicesStatus');
  $el('retryServices').hidden = true;
  list.setAttribute('aria-busy', 'true');
  list.replaceChildren();
  status.textContent = 'Carregando os serviços…';
  try {
    const { services } = await bookingApi({ action: 'services' });
    status.textContent = services.length ? '' : 'Nenhum serviço está disponível no momento.';
    for (const service of services) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'service';
      button.dataset.id = service.id;
      button.setAttribute('aria-pressed', 'false');
      const icon = document.createElement('span');
      icon.className = 'icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = service.icon || '💅';
      const details = document.createElement('span');
      const name = document.createElement('strong');
      name.textContent = service.name;
      const description = document.createElement('small');
      description.textContent = [service.description, service.duration].filter(Boolean).join(' · ');
      details.append(name, description);
      const price = document.createElement('span');
      price.className = 'price';
      price.textContent = money(service.price);
      button.append(icon, details, price);
      button.addEventListener('click', () => {
        if (bookingState.service?.id === service.id) return;
        bookingState.service = service;
        updateChoice(list, String(service.id), 'id');
        loadAvailability();
      });
      list.append(button);
    }
  } catch {
    status.textContent = 'Não conseguimos carregar os serviços agora.';
    $el('retryServices').hidden = false;
  } finally {
    list.setAttribute('aria-busy', 'false');
  }
}

function updateChoice(container, value, attribute) {
  for (const button of container.querySelectorAll('button')) {
    const selected = button.dataset[attribute] === value;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
}

async function loadAvailability() {
  availabilityRequest?.abort();
  availabilityRequest = new AbortController();
  const { signal } = availabilityRequest;
  const { date, service } = bookingState;
  const list = $el('slots');
  const status = $el('slotsStatus');
  bookingState.time = null;
  list.replaceChildren();
  $el('retrySlots').hidden = true;
  $el('chosenDate').textContent = `Horários para ${br(date, true)}`;
  updateSummary();
  if (!service) {
    status.textContent = 'Escolha um serviço para ver os horários disponíveis.';
    return;
  }
  status.textContent = 'Consultando os horários…';
  list.setAttribute('aria-busy', 'true');
  try {
    const { slots } = await bookingApi({ action: 'availability', serviceId: service.id, date }, { signal });
    if (signal.aborted) return;
    status.textContent = slots.length ? `${slots.length} ${slots.length === 1 ? 'horário disponível' : 'horários disponíveis'}.` : 'Não há horários livres para este serviço nesta data. Escolha outro dia.';
    for (const time of slots) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'slot';
      button.dataset.time = time;
      button.textContent = time;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        bookingState.time = time;
        updateChoice(list, time, 'time');
        updateSummary();
      });
      list.append(button);
    }
  } catch (error) {
    if (signal.aborted) return;
    status.textContent = error.code === 'service_unavailable'
      ? 'Este serviço ficou indisponível. Escolha outro serviço.'
      : 'Não conseguimos consultar os horários agora.';
    $el('retrySlots').hidden = error.code === 'service_unavailable';
  } finally {
    if (!signal.aborted) list.setAttribute('aria-busy', 'false');
  }
}

function validateCustomer(name, phone) {
  const errors = [
    ['name', validName(name) ? '' : 'Informe seu nome com pelo menos duas letras.'],
    ['phone', validPhone(phone) ? '' : 'Informe um WhatsApp válido com DDD.'],
    ['privacy', $el('privacy').checked ? '' : 'Autorize o uso dos dados para solicitar o horário.']
  ];
  for (const [id, message] of errors) setFieldError($el(id), message, `${id}Err`);
  const invalid = errors.find(([, message]) => message);
  if (invalid) $el(invalid[0]).focus();
  return !invalid;
}

function lockBooking(locked) {
  bookingCalendar.setDisabled(locked);
  for (const input of document.querySelectorAll('.b-service button, .b-date button:not(.cal-nav):not(.cal-day), .b-data input')) {
    input.disabled = locked;
  }
  $el('leaveReschedule').disabled = locked;
}

function bookingRequestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

async function submitAppointment(event) {
  event.preventDefault();
  if (bookingState.submitting || bookingState.appointment) return;
  const errorMessage = $el('requestError');
  errorMessage.textContent = '';
  const { service, date, time, replacement } = bookingState;
  if (!service || !time) {
    errorMessage.textContent = service ? 'Escolha um horário disponível.' : 'Escolha o serviço que deseja solicitar.';
    $el(service ? 'slotsTitle' : 'serviceTitle').focus();
    return;
  }

  const name = cleanName($el('name').value.normalize('NFC'));
  const phoneInput = $el('phone').value;
  if (!validateCustomer(name, phoneInput)) {
    errorMessage.textContent = 'Confira os campos indicados em Seus dados.';
    return;
  }
  const phone = normalizeBrazilianPhone(phoneInput);

  const request = { action: 'request', serviceId: service.id, date, time, name, phone, consent: true };
  if (replacement) request.replaces = replacement.reference;
  const signature = JSON.stringify(request);
  if (bookingState.intent?.signature !== signature) {
    bookingState.intent = { signature, id: bookingRequestId() };
  }
  const requestId = bookingState.intent.id;
  bookingState.submitting = true;
  lockBooking(true);
  updateSummary();
  $el('statusNotice').textContent = 'Enviando sua solicitação…';
  let failureFocus;
  try {
    const { appointment } = await bookingApi(null, { body: { ...request, requestId } });
    bookingState.appointment = appointment;
    bookingState.appointmentContact = { phone, requestId };
    clearReplacement();
    $el('request').hidden = true;
    $el('bookingReference').hidden = false;
    $el('referenceCode').textContent = appointment.id;
    $el('slotsStatus').textContent = 'Horário solicitado.';
    $el('statusNotice').textContent = appointment.status === 'pendente'
      ? 'Solicitação enviada. Status: pendente. Aguarde a confirmação da Carol.'
      : 'Solicitação registrada. Consulte a situação atual em Meus horários.';
    configurePix();
    $el('statusNotice').focus();
  } catch (error) {
    const unavailable = ['unavailable', 'service_unavailable'].includes(error.code);
    errorMessage.textContent = unavailable
      ? 'Esse horário ficou indisponível. Escolha outro horário.'
      : ['invalid_input', 'invalid_status', 'not_found'].includes(error.code)
        ? error.message
        : 'Não conseguimos concluir o envio agora. Tente novamente.';
    $el('statusNotice').textContent = 'A Carol vai analisar a solicitação antes de confirmar seu horário.';
    bookingState.submitting = false;
    lockBooking(false);
    if (unavailable) {
      if (error.code === 'service_unavailable') {
        bookingState.service = null;
        loadBookingServices();
      }
      loadAvailability();
      failureFocus = bookingState.service ? 'slotsTitle' : 'serviceTitle';
    } else {
      failureFocus = 'request';
    }
  } finally {
    bookingState.submitting = false;
    updateSummary();
    if (failureFocus) $el(failureFocus).focus();
  }
}

function configurePix() {
  const { signal = SINAL, deposit, status } = bookingState.appointment;
  if (signal === 0 || !['pendente', 'aguardando-sinal'].includes(status)) return;
  $el('pixCard').hidden = false;
  if (deposit === 'pago') {
    $el('pixHint').textContent = 'O sinal já foi verificado para este horário.';
    return;
  }
  const configured = Boolean(PIX_KEY.trim()) && !/(?:@exemplo\.com|COLE_|SEU_)/i.test(PIX_KEY);
  $el('pixDetails').hidden = !configured;
  $el('paidPix').hidden = !configured;
  $el('pixKey').textContent = configured ? PIX_KEY : '';
  $el('pixHint').textContent = configured
    ? `Se a Carol já orientou você a pagar o sinal de ${money(signal)}, use a chave abaixo e informe o pagamento. A solicitação segue pendente até a análise.`
    : 'Aguarde a orientação da Carol sobre o sinal pelo WhatsApp.';
}

async function copyBookingText(value, message) {
  try {
    await navigator.clipboard.writeText(value);
    toast(message);
  } catch {
    toast('Selecione o texto para copiar manualmente.');
  }
}

async function markPixPaid() {
  const btn = $el('paidPix');
  const { appointment, appointmentContact } = bookingState;
  if (btn.disabled || !appointment) return;
  btn.disabled = true;
  $el('pixError').textContent = '';
  $el('pixHint').textContent = 'Enviando seu aviso de pagamento…';
  try {
    await bookingApi(null, { body: { action: 'pix', id: appointment.id, ...appointmentContact } });
    $el('pixHint').textContent = 'Aviso recebido. Aguarde a Carol verificar o pagamento e confirmar o horário.';
  } catch {
    btn.disabled = false;
    $el('pixHint').textContent = '';
    $el('pixError').textContent = 'Não conseguimos registrar o aviso de pagamento. Tente novamente.';
  }
}
