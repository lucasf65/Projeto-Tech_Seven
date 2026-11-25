'use strict';

const lookupLabels = {
  pendente: 'Pendente de análise', 'aguardando-sinal': 'Aguardando sinal',
  confirmado: 'Confirmado', recusado: 'Recusado', cancelado: 'Cancelado', concluido: 'Concluído'
};

document.getElementById('lookupForm').addEventListener('submit', async event => {
  event.preventDefault();
  const phoneField = document.getElementById('lookup');
  const referenceField = document.getElementById('lookupReference');
  const results = document.getElementById('myAppointments');
  const button = document.getElementById('findAppointments');
  const reference = referenceField.value.trim();
  const hasPhone = validPhone(phoneField.value);
  const hasReference = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reference);
  results.replaceChildren();
  lookupStatus('');
  setFieldError(phoneField, hasPhone ? '' : 'Informe seu WhatsApp com DDD, por exemplo (11) 99999-9999.', 'lookupErr');
  setFieldError(referenceField, hasReference ? '' : 'Cole a referência completa que recebeu no site.', 'lookupReferenceErr');
  if (!hasPhone || !hasReference) {
    (hasPhone ? referenceField : phoneField).focus();
    return;
  }

  button.disabled = true;
  lookupStatus('Consultando seu horário…');
  const identity = { id: reference, phone: normalizeBrazilianPhone(phoneField.value) };
  try {
    const { appointment } = await lookupRequest('lookup', identity);
    renderLookup(appointment, identity);
    lookupStatus('Horário encontrado.');
  } catch (error) {
    lookupStatus(error.message);
  } finally {
    button.disabled = false;
  }
});

async function lookupRequest(action, identity) {
  const token = await bookingIdentity.tokenForPhone(identity.phone, true);
  let response;
  let body;
  try {
    response = await fetch('/api/booking', {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...identity })
    });
    body = await response.json();
  } catch {
    throw new Error('Não foi possível consultar o sistema agora. Tente novamente.');
  }
  if (!response.ok) throw new Error(body.error?.message ?? 'Não foi possível consultar seu horário.');
  return body;
}

function lookupStatus(message) {
  document.getElementById('lookupStatus').textContent = message;
}

function renderLookup(appointment, identity) {
  const card = document.createElement('article');
  card.className = 'my-appt-card';
  const info = document.createElement('div');
  info.className = 'my-appt-info';
  const title = document.createElement('h2');
  title.textContent = appointment.service;
  const date = document.createElement('p');
  date.textContent = `${br(appointment.date)} às ${appointment.time} · ${money(appointment.price)}`;
  const badge = document.createElement('span');
  if (Object.hasOwn(lookupLabels, appointment.status)) badge.classList.add(appointment.status);
  badge.classList.add('badge');
  badge.textContent = lookupLabels[appointment.status] ?? 'Em análise';
  info.append(title, date, badge);
  if (appointment.refundPending) {
    const refund = document.createElement('p');
    refund.textContent = 'Eventual reembolso aguardando análise da Carol.';
    info.append(refund);
  }
  if (appointment.changeReference) {
    const notice = document.createElement('p');
    notice.textContent = 'A reserva original continua válida enquanto a Carol analisa o novo horário.';
    const openChange = document.createElement('button');
    openChange.type = 'button';
    openChange.className = 'tiny';
    openChange.textContent = 'Consultar a solicitação de troca';
    openChange.addEventListener('click', () => {
      document.getElementById('lookupReference').value = appointment.changeReference;
      document.getElementById('lookupForm').requestSubmit();
    });
    info.append(notice, openChange);
  }
  if (appointment.replacementReview) {
    const notice = document.createElement('p');
    notice.textContent = 'Sua reserva anterior continua válida até a confirmação deste novo horário.';
    info.append(notice);
  }
  if (appointment.status === 'aguardando-sinal' && !appointment.changeReference) {
    renderPayment(info, appointment, identity);
  }
  card.append(info);
  document.getElementById('myAppointments').replaceChildren(card);

  if (!['pendente', 'aguardando-sinal', 'confirmado'].includes(appointment.status)) return;
  if (appointment.changeReference) return;
  const actions = document.createElement('div');
  actions.className = 'my-appt-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'tiny danger';
  cancel.textContent = 'Cancelar horário';
  const rebook = document.createElement('button');
  rebook.type = 'button';
  rebook.className = 'tiny';
  rebook.textContent = 'Reagendar';
  rebook.disabled = appointment.changes >= 3 || appointment.replacementReview;
  actions.append(cancel, rebook);
  info.append(actions);
  if (appointment.changes >= 3 && !appointment.replacementReview) {
    const limit = document.createElement('p');
    limit.textContent = 'Limite de três reagendamentos atingido. Fale com a Carol.';
    info.append(limit);
  }

  cancel.addEventListener('click', async () => {
    if (!window.confirm(appointment.replacementReview ? 'Cancelar a troca e manter a reserva original?' : 'Você quer cancelar este horário?')) return;
    cancel.disabled = true;
    rebook.disabled = true;
    lookupStatus('Cancelando seu horário…');
    try {
      const { appointment: updated } = await lookupRequest('cancel', identity);
      renderLookup(updated, identity);
      lookupStatus('Horário cancelado.');
    } catch (error) {
      lookupStatus(error.message);
      cancel.disabled = false;
      rebook.disabled = appointment.changes >= 3 || appointment.replacementReview;
    }
  });
  rebook.addEventListener('click', () => {
    try {
      sessionStorage.setItem('booking-reschedule', JSON.stringify({ reference: appointment.id, phone: identity.phone }));
      window.location.href = 'agendamento.html';
    } catch {
      lookupStatus('Seu navegador não conseguiu abrir o reagendamento. Fale com a Carol.');
    }
  });
}

function renderPayment(info, appointment, identity) {
  const payment = document.getElementById('lookupPayment').content.cloneNode(true);
  const message = payment.querySelector('[data-payment-info]');
  const key = payment.querySelector('[data-payment-key]');
  const copy = payment.querySelector('[data-copy-key]');
  const receipt = payment.querySelector('[data-send-receipt]');
  const report = payment.querySelector('[data-report-pix]');
  const { pixKey, pixName, pixCode, pixQr, whatsapp } = studioConfig;
  message.textContent = appointment.pixReported
    ? 'Pagamento informado. A Carol vai conferir o comprovante e confirmar o horário.'
    : `Sinal de ${money(appointment.signal)}. Envie o comprovante pelo WhatsApp da Carol para ela conferir.`;
  if (pixKey && !appointment.pixReported) {
    key.hidden = copy.hidden = false;
    key.textContent = pixName ? `Chave Pix de ${pixName}: ${pixKey}` : `Chave Pix: ${pixKey}`;
    copy.addEventListener('click', () => copyPayment(pixKey, 'Chave Pix copiada.'));
    if (pixQr) {
      const qrImage = payment.querySelector('[data-payment-qr]');
      qrImage.src = pixQr;
      qrImage.hidden = false;
    }
    if (pixCode) {
      const copyCode = payment.querySelector('[data-copy-pix]');
      copyCode.hidden = false;
      copyCode.addEventListener('click', () => copyPayment(pixCode, 'Código Pix copiado.'));
    }
  } else if (!pixKey && !appointment.pixReported) {
    message.textContent += ' Peça a chave Pix diretamente à Carol.';
  }
  if (whatsapp) {
    receipt.href = waLink(whatsapp, `Olá, Carol! Vou enviar o comprovante do sinal do horário de ${br(appointment.date)} às ${appointment.time}.`);
    receipt.hidden = false;
  }
  report.hidden = appointment.pixReported;
  report.addEventListener('click', async () => {
    report.disabled = true;
    try {
      await lookupRequest('pix', identity);
      renderLookup({ ...appointment, pixReported: true }, identity);
      lookupStatus('Aviso enviado. Aguarde a Carol conferir o comprovante.');
    } catch (error) {
      lookupStatus(error.message);
      report.disabled = false;
    }
  });
  info.append(payment);
}

async function copyPayment(value, success) {
  try {
    await navigator.clipboard.writeText(value);
    lookupStatus(success);
  } catch {
    lookupStatus('Não foi possível copiar. Você pode selecionar e copiar o texto da chave Pix.');
  }
}
