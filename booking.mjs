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
  return { id, name, description, duration, price, icon, kind, active: service.active !== false };
}

function bookingView(id, appointment) {
  return {
    id, service: appointment.servico, price: appointment.preco, date: appointment.data,
    time: appointment.horario, status: appointment.status, deposit: appointment.deposito,
    signal: appointment.sinalValor ?? SIGNAL, changes: appointment.reagendamentos ?? 0,
    refundPending: appointment.reembolsoStatus === 'pendente'
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
    try { identity = await auth.verifyIdToken(token); }
    catch { fail(401, 'unauthorized', 'Sua sessão expirou. Entre novamente.'); }
    if (!(await collection('admins').doc(identity.uid).get()).exists) {
      fail(403, 'forbidden', 'Seu acesso não permite esta ação.');
    }
    return identity.uid;
  }

  async function serviceList(includeArchived) {
    const snapshot = await catalog.get();
    const services = snapshot.docs.filter(doc => /^\d+$/.test(doc.id)).map(readService)
      .filter(service => includeArchived || service.active !== false).sort((a, b) => a.id - b.id);
    return { services: services.map(publicService) };
  }

  async function availability(query) {
    const date = query.get('date');
    if (!isDate(date)) invalid('Informe uma data válida.');
    const id = serviceId(query.get('serviceId'));
    const context = await schedule(date);
    const service = findService(context.services, id);
    return { slots: freeSlots({ ...context, date, duration: durationMinutes(service.durationMinutes ?? service.duration), now: studioNow(clock()) }) };
  }

  async function requestBooking(input) {
    const { date, time } = input;
    const id = typeof input.requestId === 'string' ? input.requestId.toLowerCase() : '';
    const replaces = input.replaces == null ? null : String(input.replaces).toLowerCase();
    const name = nameOf(input.name);
    const phone = normalizePhone(input.phone);
    const selected = serviceId(input.serviceId);
    if (!validName(name)) invalid('Informe um nome válido, com pelo menos duas letras.');
    if (!phone) invalid('Informe um WhatsApp brasileiro válido com DDD.');
    if (input.consent !== true) invalid('Aceite o aviso de privacidade para solicitar um horário.');
    if (!UUID.test(id) || (replaces && (!UUID.test(replaces) || replaces === id))) invalid('Referência inválida.');
    if (!isDate(date) || !isTime(time)) invalid('Escolha uma data e um horário válidos.');

    return db.runTransaction(async tx => {
      const ref = appointments.doc(id);
      const existing = await tx.get(ref);
      if (existing.exists) {
        const saved = existing.data();
        if (saved.telefone !== phone || saved.nome !== name || saved.data !== date || saved.horario !== time
          || String(saved.servicoId) !== selected || (saved.substitui ?? null) !== replaces) {
          fail(409, 'duplicate_request', 'Essa referência já foi usada em outra solicitação.');
        }
        return { appointment: bookingView(id, saved) };
      }

      const previousRef = replaces ? appointments.doc(replaces) : null;
      // O marcador por data serializa inclusive duas buscas inicialmente vazias.
      await tx.get(guard(date));
      const [context, previous, matches, directClient, history] = await Promise.all([
        schedule(date, tx), previousRef ? tx.get(previousRef) : null,
        tx.get(clients.where('telefone', 'in', phoneVariants(phone))), tx.get(clients.doc(phone)),
        tx.get(appointments.where('telefone', 'in', phoneVariants(phone)))
      ]);
      const old = previous?.data();
      if (replaces && (old?.origem !== 'site-v2' || old.telefone !== phone)) missingAppointment();
      if (old && old.data !== date) await tx.get(guard(old.data));
      const now = studioNow(clock());
      const changes = old?.reagendamentos ?? 0;
      if (old && (!OPEN.includes(old.status) || changes >= 3
        || old.data < now.date || (old.data === now.date && old.horario <= now.time))) {
        fail(409, 'invalid_status', 'O reagendamento deste horário precisa ser tratado com a Carol.');
      }
      if (old && old.data === date && old.horario === time) invalid('Escolha um novo horário para reagendar.');

      const service = findService(context.services, selected);
      const duration = durationMinutes(service.durationMinutes ?? service.duration);
      if (!freeSlots({ ...context, date, duration, now, excludeId: replaces }).includes(time)) unavailable();
      const customer = directClient.exists ? directClient : matches.docs[0];
      const loyal = history.docs.some(doc => doc.id !== replaces && ['confirmado', 'concluido'].includes(doc.data().status));
      const paid = old?.sinalVerificadoEm && old.deposito === 'pago';
      const appointment = {
        clienteId: customer?.id ?? phone, nome: name, telefone: phone,
        servico: service.name, servicoId: Number(selected), preco: service.price, duracaoMinutos: duration,
        data: date, horario: time, status: 'pendente', deposito: paid ? 'pago' : 'pendente',
        sinalValor: paid ? old.sinalValor ?? SIGNAL : loyal ? 0 : SIGNAL,
        reagendamentos: old ? changes + 1 : 0, isLoyal: loyal, criadoEm: serverTimestamp(),
        origem: 'site-v2', consentimentoEm: serverTimestamp()
      };
      if (paid) appointment.sinalVerificadoEm = old.sinalVerificadoEm;
      if (replaces) appointment.substitui = replaces;

      if (!customer) tx.create(clients.doc(phone), { nome: name, nomeBusca: name.toLocaleLowerCase('pt-BR'), telefone: phone, criadoEm: serverTimestamp() });
      if (old) {
        tx.update(previousRef, { status: 'cancelado', canceladoPor: 'reagendamento', substituidoPor: id, atualizadoEm: serverTimestamp() });
        if (old.data !== date) markDay(tx, old.data);
        audit(tx, replaces, 'cliente', old.status, 'cancelado', 'reagendamento');
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

  function checkOwner(doc, phone) {
    const appointment = doc.data();
    if (appointment?.origem !== 'site-v2' || appointment.telefone !== phone) missingAppointment();
    return appointment;
  }

  async function clientAction(input) {
    const { id, phone } = lookupIdentity(input);
    const ref = appointments.doc(id);
    if (input.action === 'lookup') return { appointment: bookingView(id, checkOwner(await ref.get(), phone)) };
    return db.runTransaction(async tx => {
      const appointment = checkOwner(await tx.get(ref), phone);
      if (input.action === 'pix') {
        if (String(input.requestId).toLowerCase() !== id) missingAppointment();
        if (appointment.pixStatus === 'informado' || appointment.sinalVerificadoEm) return { ok: true };
        if (!['pendente', 'aguardando-sinal'].includes(appointment.status)) {
          fail(409, 'invalid_status', 'Este agendamento já não está aguardando aviso de pagamento.');
        }
        tx.update(ref, { deposito: 'pago', pixStatus: 'informado', pixPagoEm: serverTimestamp() });
        audit(tx, id, 'cliente', appointment.status, appointment.status, 'sinal-informado');
        return { ok: true };
      }
      if (appointment.status === 'cancelado' && appointment.canceladoPor === 'cliente') return { appointment: bookingView(id, appointment) };
      const now = studioNow(clock());
      if (!OPEN.includes(appointment.status) || appointment.data < now.date
        || (appointment.data === now.date && appointment.horario <= now.time)) {
        fail(409, 'invalid_status', 'Fale com a Carol para cancelar este agendamento.');
      }
      await tx.get(guard(appointment.data));
      const changes = { status: 'cancelado', canceladoPor: 'cliente', atualizadoEm: serverTimestamp() };
      if (appointment.deposito === 'pago') changes.reembolsoStatus = 'pendente';
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
      const destinations = {
        'pendente': ['aprovar', 'recusado', 'cancelado'],
        'aguardando-sinal': ['confirmado', 'recusado', 'cancelado'],
        'confirmado': ['concluido', 'cancelado']
      };
      if (!destinations[from]?.includes(action)) fail(409, 'invalid_status', 'Esta ação não está disponível para a situação atual. Atualize a lista.');
      await tx.get(guard(appointment.data));
      const changes = { atualizadoPor: uid, atualizadoEm: serverTimestamp() };
      if (['aprovar', 'confirmado'].includes(action)) {
        const context = await schedule(appointment.data, tx);
        const duration = appointmentDuration(appointment, context.services);
        const windows = effectiveWindows(appointment.data, context.weekly, context.exception);
        if (!isFreeAt(appointment.horario, { ...context, date: appointment.data, windows, duration, now: studioNow(clock()), excludeId: id })) unavailable();
      }

      let to = action;
      if (action === 'aprovar') {
        const phone = normalizePhone(appointment.telefone);
        const history = phone ? await tx.get(appointments.where('telefone', 'in', phoneVariants(phone))) : null;
        const loyal = history?.docs.some(doc => doc.id !== id && ['confirmado', 'concluido'].includes(doc.data().status)) ?? false;
        Object.assign(changes, { aprovadoEm: serverTimestamp(), aprovadoPor: uid, isLoyal: loyal });
        to = loyal || appointment.sinalVerificadoEm ? 'confirmado' : 'aguardando-sinal';
        if (loyal && appointment.deposito !== 'pago') changes.deposito = 'nao-aplicavel';
      }
      if (action === 'confirmado') {
        Object.assign(changes, { deposito: 'pago', sinalVerificadoEm: serverTimestamp(), sinalVerificadoPor: uid });
      }
      if (['cancelado', 'recusado'].includes(to) && appointment.deposito === 'pago') changes.reembolsoStatus = 'pendente';
      if (to === 'cancelado') changes.canceladoPor = 'admin';
      changes.status = to;
      tx.update(ref, changes);
      markDay(tx, appointment.data);
      audit(tx, id, uid, from, to, action);
      return { appointment: bookingView(id, { ...appointment, ...changes }) };
    });
  }

  async function manageSchedule(input) {
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
    const price = source.price;
    if (operation !== 'seed' && (name.length < 2 || name.length > 100 || description.length > 500 || icon.length > 16
      || !['servico', 'pacote'].includes(source.kind) || !duration || !Number.isFinite(price) || price < 0 || price > 100000)) {
      invalid('Informe nome, duração, tipo e preço válidos.');
    }
    const fields = { name, description, duration: `${duration} min`, durationMinutes: duration, price, icon, kind: source.kind };
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
        if (action === 'availability') return json(await availability(query));
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
        if (input.action === 'request') return json(await requestBooking(input), 201);
        if (['lookup', 'pix', 'cancel'].includes(input.action)) return json(await clientAction(input));
        if (['status', 'weekly', 'exception', 'service'].includes(input.action)) {
          const uid = await adminUid(request);
          if (input.action === 'status') return json(await manageStatus(input, uid));
          if (input.action === 'service') return json(await manageService(input));
          return json(await manageSchedule(input));
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
