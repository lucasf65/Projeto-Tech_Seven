import {
  DEFAULT_WEEKLY, appointmentDuration, dayStarts, durationMinutes, effectiveWindows,
  fitsSchedule, freeSlots, isDate, isFreeAt, isTime, normalizeWindows, occupies, studioNow
} from './agenda.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DDD = /^(1[1-9]|2[12478]|3[1-578]|4[1-9]|5[1345]|6[1-9]|7[134579]|8[1-9]|9[1-9])/;
const SIGNAL = 30;
const OPEN = ['pendente', 'aguardando-sinal', 'confirmado'];
const DEFAULT_SERVICES = [
  { name: 'Manicure simples', description: 'Cutilagem e esmaltação', duration: '40 min', price: 35, icon: '💅', kind: 'servico' },
  { name: 'Alongamento em gel', description: 'Aplicação e finalização', duration: '1h 30 min', price: 90, icon: '✨', kind: 'servico' },
  { name: 'Pacote mãos + pés', description: 'Cuidado completo', duration: '1h 10 min', price: 70, icon: '🌸', kind: 'pacote' }
];

class BookingError extends Error {
  constructor(status, code, message, details) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}

function fail(status, code, message, details) {
  throw new BookingError(status, code, message, details);
}

function invalid(message) { fail(400, 'invalid_input', message); }
function unavailable() { fail(409, 'unavailable', 'Esse horário não está mais disponível. Escolha outro horário.'); }
function missingAppointment() { fail(404, 'not_found', 'Não encontramos uma solicitação com esse WhatsApp e essa referência.'); }

function nameOf(value) {
  return typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/gu, ' ') : '';
}

export function normalizePhone(value) {
  if (typeof value !== 'string' || value.length > 32 || !/^\+?[\d()\- .]+$/.test(value.trim())) return '';
  let digits = value.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) digits = digits.slice(2);
  return /^[1-9]\d9\d{8}$/.test(digits) && DDD.test(digits) ? digits : '';
}

function phoneVariants(phone) {
  const formatted = `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}`;
  return [phone, `55${phone}`, `+55${phone}`, formatted, `+55 ${formatted}`];
}

function validName(name) {
  return name.length >= 2 && name.length <= 80 && /^\p{L}[\p{L} '’.\-]*$/u.test(name)
    && (name.match(/\p{L}/gu) || []).length >= 2;
}

function serviceId(value) {
  if (!['string', 'number'].includes(typeof value) || !/^\d{1,15}$/.test(String(value))
    || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
    invalid('Selecione um serviço válido.');
  }
  return String(Number(value));
}

function documentId(value) {
  if (typeof value !== 'string' || !/^[\w-]{1,128}$/.test(value)) invalid('Identificador inválido.');
  return value;
}

function readService(doc) {
  const service = doc.data();
  return { ...service, id: Number(doc.id), kind: service.kind ?? (/^pacote\b/i.test(service.name) ? 'pacote' : 'servico') };
}

function publicService(service) {
  const { id, name, description, duration, price, icon, kind } = service;
  return { id, name, description, duration, price, icon, kind, image: service.image ?? '', active: service.active !== false };
}

function verifiedDeposit(appointment) {
  return appointment.deposito === 'pago'
    && (appointment.sinalVerificadoEm || (appointment.origem !== 'site-v2' && appointment.status === 'confirmado'));
}

function bookingView(id, appointment) {
  return {
    id, service: appointment.servico, price: appointment.preco, date: appointment.data,
    time: appointment.horario, status: appointment.status, deposit: appointment.deposito,
    signal: appointment.sinalValor ?? SIGNAL, changes: appointment.reagendamentos ?? 0,
    pixReported: ['informado', 'pago'].includes(appointment.pixStatus),
    refundPending: appointment.reembolsoStatus === 'pendente',
    changeReference: appointment.reagendamentoPendente ?? null,
    replacementReview: appointment.trocaEmAnalise === true
  };
}

function scheduleConflict(appointments) {
  const conflicts = appointments.slice(0, 12).map(a => ({ date: a.data, time: a.horario, service: a.servico }));
  const times = conflicts.slice(0, 4).map(a => `${a.date} às ${a.time}`).join(', ');
  fail(409, 'schedule_conflict', `A mudança afeta ${appointments.length} agendamento(s): ${times}. Revise a agenda antes de salvar.`, { conflicts });
}

function asAppointments(snapshot) {
  return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
}

// Firestore permite mapas dentro de arrays, mas não arrays aninhados.
const packWindows = windows => windows?.map(([start, end]) => ({ start, end })) ?? null;
const unpackWindows = windows => windows?.map(({ start, end }) => [start, end]) ?? null;

export function bookingApi({ db, auth, serverTimestamp, clock = () => new Date() }) {
  const collection = name => db.collection(name);
  const appointments = collection('agendamentos');
  const clients = collection('clientes');
  const catalog = collection('servicos');
  const exceptions = collection('disponibilidades');
  const weeklyRef = collection('configuracoes').doc('agenda');
  const catalogCounter = collection('configuracoes').doc('catalogo');
  const guard = date => collection('agendaLocks').doc(date);
  const byDate = date => appointments.where('data', '==', date);

  function markDay(tx, date) {
    tx.set(guard(date), { updatedAt: serverTimestamp() });
  }

  function audit(tx, id, actor, from, to, action) {
    tx.create(collection('agendaAuditoria').doc(), { agendamentoId: id, actor, from, to, action, at: serverTimestamp() });
  }

  function weeklyData(doc) {
    const weekly = doc.data()?.weekly;
    return weekly ? Object.fromEntries(Object.entries(weekly).map(([day, windows]) => [day, unpackWindows(windows)])) : DEFAULT_WEEKLY;
  }
  function exceptionData(doc) {
    return doc.exists ? { windows: unpackWindows(doc.data().windows), closed: doc.data().closed ?? [] } : null;
  }

  async function schedule(date, tx) {
    const read = target => tx ? tx.get(target) : target.get();
    const [weekly, exception, day, services] = await Promise.all([
      read(weeklyRef), read(exceptions.doc(date)), read(byDate(date)), read(catalog)
    ]);
    return {
      weekly: weeklyData(weekly), exception: exceptionData(exception), appointments: asAppointments(day),
      services: new Map(services.docs.map(doc => [doc.id, readService(doc)]))
    };
  }

  function findService(services, id) {
    const service = services.get(id);
    if (!service || service.active === false || !durationMinutes(service.durationMinutes ?? service.duration)) {
      fail(409, 'service_unavailable', 'Esse serviço está indisponível. Atualize a lista e escolha outro.');
    }
    return service;
  }

  async function adminUid(request) {
    const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) fail(401, 'unauthorized', 'Entre na área da Carol para continuar.');
    let identity;
    try { identity = await auth.verifyIdToken(token, true); }
    catch { fail(401, 'unauthorized', 'Sua sessão expirou. Entre novamente.'); }
    if (!(await collection('admins').doc(identity.uid).get()).exists) {
      fail(403, 'forbidden', 'Seu acesso não permite esta ação.');
    }
    return identity.uid;
  }

  async function verifiedCustomer(request) {
    const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) fail(401, 'unauthorized', 'Confirme seu telefone para continuar.');
    let identity;
    try { identity = await auth.verifyIdToken(token, true); }
    catch { fail(401, 'unauthorized', 'Sua sessão expirou. Confirme seu telefone novamente.'); }
    const phone = normalizePhone(identity.phone_number);
    if (!phone || identity.firebase?.sign_in_provider !== 'phone') {
      fail(403, 'phone_verification_required', 'Entre com um telefone verificado.');
    }
    return { uid: identity.uid, phone };
  }

  async function serviceList(includeArchived) {
    const snapshot = await catalog.get();
    const services = snapshot.docs.filter(doc => /^\d+$/.test(doc.id)).map(readService)
      .filter(service => includeArchived || service.active !== false).sort((a, b) => a.id - b.id);
    return { services: services.map(publicService) };
  }

  async function availability(date, selected, excludeIds) {
    if (!isDate(date)) invalid('Informe uma data válida.');
    const id = serviceId(selected);
    const context = await schedule(date);
    const service = findService(context.services, id);
    return { slots: freeSlots({ ...context, date, duration: durationMinutes(service.durationMinutes ?? service.duration), now: studioNow(clock()), excludeIds }) };
  }

  async function requestBooking(input, identity) {
    const { date, time } = input;
    const id = typeof input.requestId === 'string' ? input.requestId.toLowerCase() : '';
    const replaces = input.replaces == null ? null : String(input.replaces).toLowerCase();
    const name = nameOf(input.name);
    const phone = normalizePhone(input.phone);
    const selected = serviceId(input.serviceId);
    if (!validName(name)) invalid('Informe um nome válido, com pelo menos duas letras.');
    if (!phone) invalid('Informe um WhatsApp brasileiro válido com DDD.');
    if (phone !== identity.phone) fail(403, 'phone_verification_required', 'Use o telefone verificado nesta sessão.');
    if (input.consent !== true) invalid('Aceite o aviso de privacidade para solicitar um horário.');
    if (!UUID.test(id) || (replaces && (!UUID.test(replaces) || replaces === id))) invalid('Referência inválida.');
    if (!isDate(date) || !isTime(time)) invalid('Escolha uma data e um horário válidos.');

    return db.runTransaction(async tx => {
      const ref = appointments.doc(id);
      const existing = await tx.get(ref);
      if (existing.exists) {
        const saved = existing.data();
        if (saved.titularUid !== identity.uid || saved.telefone !== phone || saved.nome !== name || saved.data !== date || saved.horario !== time
          || String(saved.servicoId) !== selected || (saved.substitui ?? null) !== replaces) {
          fail(409, 'duplicate_request', 'Essa referência já foi usada em outra solicitação.');
        }
        return { appointment: bookingView(id, saved) };
      }

      const previousRef = replaces ? appointments.doc(replaces) : null;
      // O marcador por data serializa inclusive duas buscas inicialmente vazias.
      await tx.get(guard(date));
      const [context, previous, matches, directClient] = await Promise.all([
        schedule(date, tx), previousRef ? tx.get(previousRef) : null,
        tx.get(clients.where('telefone', 'in', phoneVariants(phone))), tx.get(clients.doc(phone))
      ]);
      const old = previous?.data();
      if (replaces) checkOwner(previous, identity);
      if (old && old.data !== date) await tx.get(guard(old.data));
      const now = studioNow(clock());
      const changes = old?.reagendamentos ?? 0;
      if (old && (!OPEN.includes(old.status) || changes >= 3 || old.trocaEmAnalise || old.reagendamentoPendente
        || old.data < now.date || (old.data === now.date && old.horario <= now.time))) {
        fail(409, 'invalid_status', 'O reagendamento deste horário precisa ser tratado com a Carol.');
      }
      if (old && old.data === date && old.horario === time) invalid('Escolha um novo horário para reagendar.');

      const service = findService(context.services, selected);
      const duration = durationMinutes(service.durationMinutes ?? service.duration);
      if (!freeSlots({ ...context, date, duration, now, excludeIds: replaces ? [replaces] : [] }).includes(time)) unavailable();
      const candidates = new Map(matches.docs.map(doc => [doc.id, doc]));
      if (directClient.exists) candidates.set(directClient.id, directClient);
      const customer = [...candidates.values()][0];
      if (candidates.size > 1 || (customer && customer.data().titularUid !== identity.uid)) {
        fail(409, 'customer_review_required', 'A Carol precisa conferir seu cadastro antes de liberar o agendamento. Fale com o estúdio.');
      }
      const exempt = old ? old.sinalValor === 0 && old.deposito === 'nao-aplicavel' : customer?.data().cadastroElegivel === true;
      const paid = old && verifiedDeposit(old);
      const appointment = {
        clienteId: customer?.id ?? phone, titularUid: identity.uid, nome: name, telefone: phone,
        servico: service.name, servicoId: Number(selected), preco: service.price, duracaoMinutos: duration,
        data: date, horario: time, status: 'pendente', deposito: paid ? 'pago' : exempt ? 'nao-aplicavel' : 'pendente',
        sinalValor: paid ? old.sinalValor ?? SIGNAL : exempt ? 0 : SIGNAL,
        reagendamentos: old ? changes + 1 : 0, criadoEm: serverTimestamp(),
        origem: 'site-v2', consentimentoEm: serverTimestamp()
      };
      if (paid) appointment.sinalVerificadoEm = old.sinalVerificadoEm ?? serverTimestamp();
      if (replaces) Object.assign(appointment, { substitui: replaces, trocaEmAnalise: true });

      if (!customer) tx.create(clients.doc(phone), { nome: name, nomeBusca: name.toLocaleLowerCase('pt-BR'), telefone: phone, titularUid: identity.uid, criadoEm: serverTimestamp() });
      if (old) {
        tx.update(previousRef, { reagendamentoPendente: id, atualizadoEm: serverTimestamp() });
        if (old.data !== date) markDay(tx, old.data);
        audit(tx, replaces, 'cliente', old.status, old.status, 'reagendamento-solicitado');
      }
      tx.create(ref, appointment);
      markDay(tx, date);
      return { appointment: bookingView(id, appointment) };
    });
  }

  function lookupIdentity(input) {
    const id = typeof (input.id ?? input.reference) === 'string' ? (input.id ?? input.reference).trim().toLowerCase() : '';
    const phone = normalizePhone(input.phone);
    if (!UUID.test(id) || !phone) invalid('Informe o WhatsApp e a referência da solicitação.');
    return { id, phone };
  }

  function checkOwner(doc, identity) {
    const appointment = doc?.data();
    if (!appointment || appointment.titularUid !== identity.uid || normalizePhone(appointment.telefone) !== identity.phone) missingAppointment();
    return appointment;
  }

  async function previousBooking(tx, id, appointment) {
    if (!appointment.trocaEmAnalise) return null;
    const ref = appointments.doc(appointment.substitui);
    const previous = (await tx.get(ref)).data();
    if (previous?.reagendamentoPendente !== id || !OPEN.includes(previous.status)) {
      fail(409, 'invalid_status', 'A reserva original mudou. Fale com a Carol para revisar a troca.');
    }
    if (previous.data !== appointment.data) await tx.get(guard(previous.data));
    return { ref, appointment: previous };
  }

  function closeReplacement(tx, previous, id, appointment, to, actor, changes) {
    if (!previous || !['confirmado', 'cancelado', 'recusado'].includes(to)) return;
    const { ref, appointment: original } = previous;
    const originalChanges = { reagendamentoPendente: null, atualizadoEm: serverTimestamp() };
    if (to === 'confirmado') Object.assign(originalChanges, {
      status: 'cancelado', canceladoPor: 'reagendamento', substituidoPor: id
    });
    if (to !== 'confirmado') changes.reagendamentos = original.reagendamentos ?? 0;
    changes.trocaEmAnalise = false;
    tx.update(ref, originalChanges);
    if (original.data !== appointment.data) markDay(tx, original.data);
    audit(tx, ref.id, actor, original.status, originalChanges.status ?? original.status,
      to === 'confirmado' ? 'reagendamento-confirmado' : 'reagendamento-encerrado');
  }

  async function clientAction(input, identity) {
    const { id, phone } = lookupIdentity(input);
    if (phone !== identity.phone) missingAppointment();
    const ref = appointments.doc(id);
    if (input.action === 'lookup') return { appointment: bookingView(id, checkOwner(await ref.get(), identity)) };
    return db.runTransaction(async tx => {
      const appointment = checkOwner(await tx.get(ref), identity);
      if (input.action === 'pix') {
        if (appointment.pixStatus === 'informado' || appointment.sinalVerificadoEm) return { ok: true };
        if (appointment.status !== 'aguardando-sinal' || appointment.deposito === 'nao-aplicavel' || appointment.reagendamentoPendente) {
          fail(409, 'invalid_status', 'Este agendamento já não está aguardando aviso de pagamento.');
        }
        tx.update(ref, { pixStatus: 'informado', pixInformadoEm: serverTimestamp() });
        audit(tx, id, 'cliente', appointment.status, appointment.status, 'sinal-informado');
        return { ok: true };
      }
      if (appointment.status === 'cancelado' && appointment.canceladoPor === 'cliente') return { appointment: bookingView(id, appointment) };
      const now = studioNow(clock());
      if (appointment.reagendamentoPendente) {
        fail(409, 'invalid_status', 'Cancele primeiro a solicitação de troca em análise.');
      }
      if (!OPEN.includes(appointment.status) || appointment.data < now.date
        || (appointment.data === now.date && appointment.horario <= now.time)) {
        fail(409, 'invalid_status', 'Fale com a Carol para cancelar este agendamento.');
      }
      await tx.get(guard(appointment.data));
      const previous = await previousBooking(tx, id, appointment);
      const changes = { status: 'cancelado', canceladoPor: 'cliente', atualizadoEm: serverTimestamp() };
      if (!previous && verifiedDeposit(appointment)) changes.reembolsoStatus = 'pendente';
      closeReplacement(tx, previous, id, appointment, changes.status, 'cliente', changes);
      tx.update(ref, changes);
      markDay(tx, appointment.data);
      audit(tx, id, 'cliente', appointment.status, 'cancelado', 'cancelamento');
      return { appointment: bookingView(id, { ...appointment, ...changes }) };
    });
  }

  async function manageStatus(input, uid) {
    const id = documentId(input.id);
    const action = input.status;
    return db.runTransaction(async tx => {
      const ref = appointments.doc(id);
      const appointment = (await tx.get(ref)).data();
      if (!appointment) fail(404, 'not_found', 'Solicitação não encontrada.');
      const from = appointment.status;
      if (action === 'resolver-reembolso') {
        if (appointment.reembolsoStatus !== 'pendente') fail(409, 'invalid_status', 'Este agendamento não tem reembolso pendente.');
        tx.update(ref, { reembolsoStatus: 'resolvido', reembolsoResolvidoEm: serverTimestamp(), reembolsoResolvidoPor: uid });
        audit(tx, id, uid, from, from, action);
        return { appointment: bookingView(id, { ...appointment, reembolsoStatus: 'resolvido' }) };
      }
      const destinations = {
        'pendente': ['aprovar', 'recusado', 'cancelado'],
        'aguardando-sinal': ['confirmado', 'recusado', 'cancelado'],
        'confirmado': ['concluido', 'cancelado']
      };
      if (!destinations[from]?.includes(action)) fail(409, 'invalid_status', 'Esta ação não está disponível para a situação atual. Atualize a lista.');
      if (appointment.reagendamentoPendente) {
        fail(409, 'invalid_status', 'Resolva a solicitação de troca antes de alterar o horário original.');
      }
      await tx.get(guard(appointment.data));
      const previous = await previousBooking(tx, id, appointment);
      const changes = { atualizadoPor: uid, atualizadoEm: serverTimestamp() };
      if (['aprovar', 'confirmado'].includes(action)) {
        const context = await schedule(appointment.data, tx);
        const duration = appointmentDuration(appointment, context.services);
        const windows = effectiveWindows(appointment.data, context.weekly, context.exception);
        const excludeIds = previous ? [id, previous.ref.id] : [id];
        if (!isFreeAt(appointment.horario, { ...context, date: appointment.data, windows, duration, now: studioNow(clock()), excludeIds })) unavailable();
      }

      let to = action;
      if (action === 'aprovar') {
        const exempt = appointment.sinalValor === 0 && appointment.deposito === 'nao-aplicavel';
        Object.assign(changes, { aprovadoEm: serverTimestamp(), aprovadoPor: uid });
        to = exempt || verifiedDeposit(appointment) ? 'confirmado' : 'aguardando-sinal';
      }
      if (action === 'confirmado') {
        Object.assign(changes, { deposito: 'pago', sinalVerificadoEm: serverTimestamp(), sinalVerificadoPor: uid });
      }
      if (['cancelado', 'recusado'].includes(to) && verifiedDeposit(appointment) && !previous) changes.reembolsoStatus = 'pendente';
      if (to === 'confirmado' && appointment.titularUid && appointment.clienteId) {
        const customerRef = clients.doc(appointment.clienteId);
        const customer = await tx.get(customerRef);
        if (customer.data()?.titularUid === appointment.titularUid && customer.data().cadastroElegivel !== true) {
          tx.update(customerRef, { cadastroElegivel: true, cadastroValidadoEm: serverTimestamp() });
        }
      }
      if (to === 'cancelado') changes.canceladoPor = 'admin';
      changes.status = to;
      closeReplacement(tx, previous, id, appointment, to, uid, changes);
      tx.update(ref, changes);
      markDay(tx, appointment.data);
      audit(tx, id, uid, from, to, action);
      return { appointment: bookingView(id, { ...appointment, ...changes }) };
    });
  }

  async function manageSchedule(input, uid) {
    const today = studioNow(clock()).date;
    if (input.action === 'weekly') {
      const source = input.weekly;
      if (!source || typeof source !== 'object' || Array.isArray(source) || Object.keys(source).length !== 7) invalid('Informe os sete dias da semana.');
      const weekly = Object.fromEntries(Object.keys(DEFAULT_WEEKLY).map(day => [day, normalizeWindows(source[day])]));
      if (Object.values(weekly).includes(null)) invalid('Revise as faixas de horário. Elas não podem se sobrepor.');
      return db.runTransaction(async tx => {
        await tx.get(weeklyRef);
        const [active, overrides, catalogSnapshot] = await Promise.all([
          tx.get(appointments.where('data', '>=', today)), tx.get(exceptions), tx.get(catalog)
        ]);
        const exceptionsByDate = new Map(overrides.docs.map(doc => [doc.id, exceptionData(doc)]));
        const services = new Map(catalogSnapshot.docs.map(doc => [doc.id, readService(doc)]));
        const conflicts = asAppointments(active).filter(appointment => occupies(appointment) && isDate(appointment.data) && !fitsSchedule(
          appointment.horario, appointmentDuration(appointment, services),
          effectiveWindows(appointment.data, weekly, exceptionsByDate.get(appointment.data)), exceptionsByDate.get(appointment.data)?.closed
        ));
        if (conflicts.length) scheduleConflict(conflicts);
        const storedWeekly = Object.fromEntries(Object.entries(weekly).map(([day, windows]) => [day, packWindows(windows)]));
        tx.set(weeklyRef, { weekly: storedWeekly, atualizadoEm: serverTimestamp() });
        audit(tx, 'agenda-semanal', uid, null, null, 'agenda-semanal-atualizada');
        return { ok: true };
      });
    }

    const { date } = input;
    const windows = input.windows === null ? null : normalizeWindows(input.windows);
    const closed = input.closed;
    if (!isDate(date) || date < today) invalid('Escolha uma data a partir de hoje.');
    if (input.windows !== null && windows === null) invalid('Revise as faixas de horário da data.');
    if (!Array.isArray(closed) || closed.length > 24 || !closed.every(isTime)) invalid('Revise os horários bloqueados.');
    const exception = { windows, closed: [...new Set(closed)].sort() };
    return db.runTransaction(async tx => {
      await tx.get(guard(date));
      const context = await schedule(date, tx);
      const effective = effectiveWindows(date, context.weekly, exception);
      const conflicts = context.appointments.filter(appointment => occupies(appointment) && !fitsSchedule(
        appointment.horario, appointmentDuration(appointment, context.services), effective, exception.closed
      ));
      if (conflicts.length) scheduleConflict(conflicts);
      tx.set(exceptions.doc(date), { ...exception, windows: packWindows(windows), atualizadoEm: serverTimestamp() });
      markDay(tx, date);
      audit(tx, date, uid, null, null, 'excecao-de-agenda-atualizada');
      return { ok: true };
    });
  }

  async function scheduleView(date) {
    if (!isDate(date)) invalid('Escolha uma data válida.');
    const data = await schedule(date);
    const windows = effectiveWindows(date, data.weekly, data.exception);
    return {
      weekly: data.weekly, defaultWeekly: DEFAULT_WEEKLY, exception: data.exception,
      starts: dayStarts(windows), conflicts: [], appointments: data.appointments.filter(occupies)
        .map(a => ({ date, time: a.horario, service: a.servico, status: a.status }))
    };
  }

  async function manageService(input) {
    const { operation } = input;
    if (!['create', 'update', 'archive', 'restore', 'seed'].includes(operation)) invalid('Ação de catálogo inválida.');
    if (['archive', 'restore'].includes(operation)) {
      const ref = catalog.doc(serviceId(input.id));
      return db.runTransaction(async tx => {
        if (!(await tx.get(ref)).exists) fail(404, 'not_found', 'Serviço não encontrado.');
        tx.update(ref, { active: operation === 'restore' });
        return { ok: true };
      });
    }
    const source = input.service ?? {};
    const duration = durationMinutes(source.duration);
    const name = nameOf(source.name);
    const description = typeof source.description === 'string' ? source.description.trim() : '';
    const icon = typeof source.icon === 'string' ? source.icon.trim() : '';
    const image = typeof source.image === 'string' ? source.image.trim() : '';
    const price = source.price;
    if (operation !== 'seed' && (name.length < 2 || name.length > 100 || description.length > 500 || icon.length > 16
      || !['servico', 'pacote'].includes(source.kind) || !duration || !Number.isFinite(price) || price < 0 || price > 100000)) {
      invalid('Informe nome, duração, tipo e preço válidos.');
    }
    if (image && (image.length > 500 || !/^https:\/\/[^\s<>]+$/.test(image))) invalid('Informe uma URL HTTPS válida para a foto.');
    const fields = { name, description, duration: `${duration} min`, durationMinutes: duration, price, icon, image, kind: source.kind };
    if (operation === 'update') {
      const ref = catalog.doc(serviceId(source.id));
      return db.runTransaction(async tx => {
        const original = (await tx.get(ref)).data();
        if (!original) fail(404, 'not_found', 'Serviço não encontrado.');
        const legacyDurationMinutes = original.legacyDurationMinutes ?? durationMinutes(original.duration) ?? 60;
        tx.update(ref, { ...fields, legacyDurationMinutes });
        return { ok: true };
      });
    }
    return db.runTransaction(async tx => {
      const [sequence, list] = await Promise.all([tx.get(catalogCounter), tx.get(catalog)]);
      if (operation === 'seed') {
        if (!list.empty) return { ok: true };
        DEFAULT_SERVICES.forEach((service, index) => {
          const id = index + 1;
          tx.create(catalog.doc(String(id)), { ...service, id, active: true });
        });
        tx.set(catalogCounter, { lastId: Math.max(3, sequence.data()?.lastId ?? 0) });
        return { ok: true };
      }
      const last = list.docs.reduce((max, doc) => /^\d{1,15}$/.test(doc.id) ? Math.max(max, Number(doc.id)) : max, sequence.data()?.lastId ?? 0);
      const id = last + 1;
      tx.create(catalog.doc(String(id)), { ...fields, id, active: true });
      tx.set(catalogCounter, { lastId: id });
      return { ok: true, id };
    });
  }

  async function searchClients(query) {
    const phone = normalizePhone(query.get('phone'));
    const name = nameOf(query.get('name'));
    if (!phone && !validName(name)) invalid('Informe um nome completo ou WhatsApp válido.');
    const snapshots = phone
      ? [await clients.where('telefone', 'in', phoneVariants(phone)).get()]
      : await Promise.all([clients.where('nomeBusca', '==', name.toLocaleLowerCase('pt-BR')).get(), clients.where('nome', '==', name).get()]);
    const unique = new Map();
    for (const doc of snapshots.flatMap(snapshot => snapshot.docs)) {
      const data = doc.data();
      const canonical = normalizePhone(data.telefone) || data.telefone;
      if (!name || nameOf(data.nome).toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR')) {
        unique.set(canonical, { id: doc.id, name: data.nome, phone: canonical });
      }
    }
    return { clients: [...unique.values()] };
  }

  async function updateClientEligibility(input, uid) {
    const phone = normalizePhone(input.phone);
    if (!phone || typeof input.fixed !== 'boolean') invalid('Informe a cliente e a situação do cadastro.');
    return db.runTransaction(async tx => {
      const [direct, matches] = await Promise.all([
        tx.get(clients.doc(phone)), tx.get(clients.where('telefone', 'in', phoneVariants(phone)))
      ]);
      const ids = new Set(matches.docs.map(doc => doc.id));
      if (direct.exists) ids.add(direct.id);
      if (!ids.size) fail(404, 'not_found', 'Cadastro não encontrado.');
      for (const id of ids) tx.update(clients.doc(id), { clienteFixa: input.fixed });
      audit(tx, direct.exists ? direct.id : matches.docs[0].id, uid, null, null,
        input.fixed ? 'cliente-fixa-marcada' : 'cliente-fixa-desmarcada');
      return { ok: true };
    });
  }

  async function linkLegacyClient(input, uid) {
    const ref = clients.doc(documentId(input.id));
    const phone = normalizePhone(input.phone);
    if (!phone || input.reviewed !== true) invalid('Confirme que você conferiu o cadastro anterior com a cliente.');
    let account;
    try { account = await auth.getUserByPhoneNumber('+55' + phone); }
    catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
      fail(409, 'phone_verification_required', 'Peça que a cliente confirme este telefone por SMS no site.');
    }
    if (account.disabled || !account.providerData?.some(provider => provider.providerId === 'phone')) {
      fail(409, 'phone_verification_required', 'Não existe uma conta por telefone habilitada para esta cliente.');
    }
    return db.runTransaction(async tx => {
      const [customer, matches, direct, existingOwner] = await Promise.all([
        tx.get(ref), tx.get(clients.where('telefone', 'in', phoneVariants(phone))),
        tx.get(clients.doc(phone)), tx.get(clients.where('titularUid', '==', account.uid))
      ]);
      if (!customer.exists || normalizePhone(customer.data().telefone) !== phone) {
        fail(404, 'not_found', 'Cadastro e telefone não correspondem.');
      }
      if (matches.docs.some(doc => doc.id !== ref.id) || (direct.exists && direct.id !== ref.id)
        || existingOwner.docs.some(doc => doc.id !== ref.id) || customer.data().titularUid) {
        fail(409, 'customer_review_required', 'Este cadastro já foi vinculado ou tem duplicidades que precisam de revisão.');
      }
      tx.update(ref, {
        telefone: phone, titularUid: account.uid, cadastroElegivel: true,
        cadastroValidadoEm: serverTimestamp(), cadastroValidadoPor: uid
      });
      tx.create(collection('clientesAuditoria').doc(), {
        clienteId: ref.id, actor: uid, action: 'vinculo-legado-conferido', at: serverTimestamp()
      });
      return { ok: true };
    });
  }

  return async request => {
    try {
      const { searchParams: query } = new URL(request.url);
      if (request.method === 'GET') {
        const action = query.get('action');
        if (action === 'services') {
          const admin = query.get('admin') === '1';
          if (admin) await adminUid(request);
          return json(await serviceList(admin));
        }
        if (action === 'availability') return json(await availability(query.get('date'), query.get('serviceId')));
        if (action === 'schedule' || action === 'clients') {
          await adminUid(request);
          return json(action === 'schedule' ? await scheduleView(query.get('date')) : await searchClients(query));
        }
      } else if (request.method === 'POST' || request.method === 'PUT') {
        if (!request.headers.get('content-type')?.startsWith('application/json')) invalid('Envie os dados no formato JSON.');
        const body = await request.text();
        if (body.length > 16384) fail(413, 'invalid_input', 'Os dados enviados excedem o tamanho permitido.');
        let input;
        try { input = JSON.parse(body); } catch { invalid('Os dados enviados são inválidos.'); }
        if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Os dados enviados são inválidos.');
        if (input.action === 'request') return json(await requestBooking(input, await verifiedCustomer(request)), 201);
        if (input.action === 'reschedule-availability') {
          const { id, phone } = lookupIdentity(input);
          const identity = await verifiedCustomer(request);
          if (phone !== identity.phone) missingAppointment();
          checkOwner(await appointments.doc(id).get(), identity);
          return json(await availability(input.date, input.serviceId, [id]));
        }
        if (['lookup', 'pix', 'cancel'].includes(input.action)) return json(await clientAction(input, await verifiedCustomer(request)));
        if (['status', 'weekly', 'exception', 'service', 'client-eligibility', 'client-link'].includes(input.action)) {
          const uid = await adminUid(request);
          if (input.action === 'status') return json(await manageStatus(input, uid));
          if (input.action === 'service') return json(await manageService(input));
          if (input.action === 'client-eligibility') return json(await updateClientEligibility(input, uid));
          if (input.action === 'client-link') return json(await linkLegacyClient(input, uid));
          return json(await manageSchedule(input, uid));
        }
      } else {
        return json({ error: { code: 'method_not_allowed', message: 'Método não permitido.' } }, 405, { Allow: 'GET, POST, PUT' });
      }
      fail(404, 'not_found', 'Ação não encontrada.');
    } catch (error) {
      if (error instanceof BookingError) {
        return json({ error: { code: error.code, message: error.message, ...error.details } }, error.status);
      }
      console.error('Falha na API de agenda:', error.code ?? error.name);
      return json({ error: { code: 'unavailable_backend', message: 'O sistema está indisponível agora. Tente novamente em instantes.' } }, 503);
    }
  };
}

export function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}
