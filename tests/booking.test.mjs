import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { bookingApi, normalizePhone } from '../server/booking.mjs';
import { DEFAULT_WEEKLY } from '../server/agenda.mjs';
import { MemoryFirestore } from './memory-firestore.mjs';

const MODE = process.env.BOOKING_TEST_EMULATOR === '1' ? 'emulador Firestore' : 'Firestore em memória';
const NOW = new Date('2030-01-01T12:00:00Z');
const DATE = '2030-01-07';
const PHONE = '11987654321';
const CAROL = 'carol-fixture';
const BASE_SERVICES = {
  1: { id: 1, name: 'Manicure simples', duration: '40 min', price: 35, kind: 'servico' },
  2: { id: 2, name: 'Alongamento em gel', duration: '1h 30 min', price: 90, kind: 'servico' },
  3: { id: 3, name: 'Pacote legado', duration: '1.5h', price: 70 }
};

function reference(number) {
  return `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
}

function booking(number, overrides = {}) {
  return {
    serviceId: 1, date: DATE, time: '09:00', name: 'Maria do Carmo', phone: PHONE,
    consent: true, requestId: reference(number), ...overrides
  };
}

async function createStore(t, initial) {
  if (MODE === 'Firestore em memória') {
    return { db: new MemoryFirestore(initial), serverTimestamp: () => NOW.toISOString() };
  }
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  assert.match(host ?? '', /^(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/, 'Configure um emulador Firestore em loopback.');
  const [{ initializeApp, deleteApp }, { getFirestore, FieldValue }] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/firestore')
  ]);
  const projectId = `demo-booking-${randomBytes(6).toString('hex')}`;
  const app = initializeApp({ projectId }, projectId);
  const db = getFirestore(app);
  t.after(async () => {
    await fetch(`http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
    await deleteApp(app);
  });
  const batch = db.batch();
  for (const [name, documents] of Object.entries(initial)) {
    for (const [id, data] of Object.entries(documents)) batch.set(db.collection(name).doc(id), data);
  }
  await batch.commit();
  return { db, serverTimestamp: () => FieldValue.serverTimestamp() };
}

async function fixture(t, seed = {}) {
  const { db, serverTimestamp } = await createStore(t, {
    admins: { [CAROL]: {} }, servicos: BASE_SERVICES, ...seed
  });
  const auth = {
    async verifyIdToken(token) {
      if (token === 'admin-fixture') return { uid: CAROL };
      if (token === 'visitor-fixture') return { uid: 'visitor' };
      const match = /^(phone|other):(.+)$/.exec(token);
      if (match) return {
        uid: `uid-${match[2]}${match[1] === 'other' ? '-other' : ''}`,
        phone_number: '+55' + match[2], firebase: { sign_in_provider: 'phone' }
      };
      throw new Error('Invalid fixture token');
    },
    async getUserByPhoneNumber(phone) {
      const canonical = normalizePhone(phone);
      return { uid: 'uid-' + canonical, providerData: [{ providerId: 'phone' }] };
    }
  };
  const api = bookingApi({ db, auth, serverTimestamp, clock: () => NOW });
  async function call(action, { query, payload, token } = {}) {
    const params = new URLSearchParams({ action, ...query });
    if (token === undefined && payload && ['request', 'lookup', 'cancel', 'pix', 'reschedule-availability'].includes(action)) {
      token = 'phone:' + (normalizePhone(payload.phone) || PHONE);
    }
    const headers = new Headers(token ? { authorization: `Bearer ${token}` } : {});
    const options = { headers };
    if (payload) {
      options.method = 'POST';
      options.body = JSON.stringify({ action, ...payload });
      headers.set('content-type', 'application/json');
    }
    const response = await api(new Request(`https://example.test/api/booking?${params}`, options));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return { status: response.status, body: await response.json() };
  }
  return {
    db,
    call,
    admin: (action, options) => call(action, { ...options, token: 'admin-fixture' }),
    request: payload => call('request', { payload }),
    availability: async (serviceId = 1, date = DATE) => {
      const result = await call('availability', { query: { serviceId, date } });
      assert.equal(result.status, 200);
      return result.body.slots;
    },
    stored: async (collection, id) => (await db.collection(collection).doc(id).get()).data()
  };
}

function expectError(result, status, code) {
  assert.equal(result.status, status, JSON.stringify(result.body));
  assert.equal(result.body.error?.code, code);
  assert.ok(result.body.error?.message);
}

test(`Solicitação persistida como pendente, validação, consulta e reenvio idempotente [${MODE}]`, { timeout: 180000 }, async t => {
  const ctx = await fixture(t);
  for (const invalid of [
    { consent: false }, { name: 'Maria 2' }, { phone: '001234' }, { date: '2030-02-30' }, { time: '9h' }
  ]) {
    expectError(await ctx.request(booking(1, invalid)), 400, 'invalid_input');
  }
  const intent = booking(1, { name: '  Maria  do Carmo  ', phone: '+55 (11) 98765-4321', price: 1, status: 'confirmado' });
  const submitted = await ctx.request(intent);
  assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
  assert.deepEqual(submitted.body.appointment, {
    id: reference(1), service: 'Manicure simples', price: 35, date: DATE, time: '09:00',
    status: 'pendente', deposit: 'pendente', signal: 30, changes: 0, pixReported: false,
    refundPending: false, changeReference: null, replacementReview: false
  });
  assert.deepEqual(await ctx.request(intent), submitted);
  expectError(await ctx.request({ ...intent, time: '10:00' }), 409, 'duplicate_request');
  expectError(await ctx.call('lookup', { payload: { id: reference(1), phone: '11987650000' } }), 404, 'not_found');
  assert.deepEqual(await ctx.call('lookup', { payload: { id: reference(1), phone: PHONE } }),
    { status: 200, body: submitted.body });
  const saved = await ctx.stored('agendamentos', reference(1));
  assert.equal(saved.telefone, PHONE);
  assert.equal(saved.clienteId, PHONE);
  assert.equal(saved.nome, 'Maria do Carmo');
  assert.equal(saved.duracaoMinutos, 40);
  assert.ok(saved.consentimentoEm);
  assert.equal((await ctx.db.collection('agendamentos').get()).size, 1);
});

test(`20 solicitações simultâneas para o mesmo horário reservam somente uma vaga [${MODE}]`, { timeout: 180000 }, async t => {
  const ctx = await fixture(t);
  const attempts = Array.from({ length: 20 }, (_, index) => booking(index + 1, {
    phone: `11987${String(index).padStart(6, '0')}`
  }));
  const results = await Promise.all(attempts.map(ctx.request));
  assert.equal(results.filter(result => result.status === 201).length, 1, JSON.stringify(results));
  assert.equal(results.filter(result => result.status === 409 && result.body.error?.code === 'unavailable').length, 19, JSON.stringify(results));
  assert.equal((await ctx.db.collection('agendamentos').get()).size, 1);
  assert.equal((await ctx.db.collection('clientes').get()).size, 1);
  assert.ok(!(await ctx.availability()).includes('09:00'));
});

test(`A duração, os bloqueios e os limites de data definem horários livres por serviço [${MODE}]`, { timeout: 180000 }, async t => {
  const ctx = await fixture(t, { disponibilidades: { [DATE]: { closed: ['15:00'] } } });
  assert.deepEqual(await ctx.availability(1), ['09:00', '10:00', '11:00', '14:00', '16:00']);
  assert.deepEqual(await ctx.availability(2), ['09:00', '10:00', '11:00', '16:00']);
  assert.deepEqual(await ctx.availability(3), await ctx.availability(2), 'A duração fracionária de serviços antigos preserva os horários.');
  assert.deepEqual(await ctx.availability(1, '2029-12-31'), []);
  assert.deepEqual(await ctx.availability(1, '2031-01-08'), []);
  expectError(await ctx.request(booking(1, { time: '09:15' })), 409, 'unavailable');
  expectError(await ctx.request(booking(1, { serviceId: 2, time: '14:00' })), 409, 'unavailable');
  assert.equal((await ctx.request(booking(2, { serviceId: 2 }))).status, 201);
  assert.ok(!(await ctx.availability()).includes('10:00'), '09h–10h30 também ocupa 10h.');
  expectError(await ctx.request(booking(3, { time: '10:00' })), 409, 'unavailable');
  assert.ok((await ctx.availability()).includes('11:00'));
});

test(`A agenda semanal e as exceções recusam alterações conflitantes sem modificar as reservas [${MODE}]`, { timeout: 180000 }, async t => {
  const ctx = await fixture(t);
  const schedule = await ctx.admin('schedule', { query: { date: DATE } });
  assert.equal(schedule.status, 200);
  assert.deepEqual(schedule.body.weekly, DEFAULT_WEEKLY);
  const week = { ...DEFAULT_WEEKLY, 1: [['10:30', '13:00']] };
  assert.equal((await ctx.admin('weekly', { payload: { weekly: week } })).status, 200);
  assert.deepEqual(await ctx.availability(), ['10:30', '11:30']);
  assert.equal((await ctx.request(booking(1, { time: '10:30' }))).status, 201);
  const conflict = await ctx.admin('weekly', { payload: { weekly: { ...week, 1: [] } } });
  expectError(conflict, 409, 'schedule_conflict');
  assert.deepEqual(conflict.body.error.conflicts, [{ date: DATE, time: '10:30', service: 'Manicure simples' }]);
  const blocked = await ctx.admin('exception', { payload: { date: DATE, windows: null, closed: ['10:30'] } });
  expectError(blocked, 409, 'schedule_conflict');
  assert.equal(await ctx.stored('disponibilidades', DATE), undefined);
  const exception = { date: DATE, windows: [['10:30', '12:00'], ['14:15', '16:40']], closed: ['14:15'] };
  assert.equal((await ctx.admin('exception', { payload: exception })).status, 200);
  assert.deepEqual(await ctx.availability(), ['15:15']);
  const nextDate = '2030-01-08';
  assert.equal((await ctx.admin('exception', { payload: { date: nextDate, windows: [], closed: [] } })).status, 200);
  assert.deepEqual(await ctx.availability(1, nextDate), []);
  assert.equal((await ctx.stored('agendamentos', reference(1))).status, 'pendente');
});

test(`Telefone normalizado reaproveita cadastro legado e permite consulta administrativa [${MODE}]`, { timeout: 180000 }, async t => {
  const ctx = await fixture(t, { clientes: {
    'legacy-id': { nome: 'Maria do Carmo', telefone: '(11) 98765-4321', titularUid: 'uid-' + PHONE }
  } });
  assert.equal((await ctx.request(booking(1, { phone: '+55 (11) 98765-4321' }))).status, 201);
  assert.equal((await ctx.request(booking(2, { phone: '1198765-4321', time: '10:00' }))).status, 201);
  assert.equal((await ctx.db.collection('clientes').get()).size, 1);
  assert.equal((await ctx.stored('agendamentos', reference(2))).clienteId, 'legacy-id');
  for (const query of [{ phone: '+55 11 98765-4321' }, { name: 'Maria do Carmo' }]) {
    const found = await ctx.admin('clients', { query });
    assert.equal(found.status, 200);
    assert.deepEqual(found.body.clients, [{ id: 'legacy-id', name: 'Maria do Carmo', phone: PHONE }]);
  }
  expectError(await ctx.call('clients', { query: { phone: PHONE } }), 401, 'unauthorized');
  expectError(await ctx.call('clients', { query: { phone: PHONE }, token: 'visitor-fixture' }), 403, 'forbidden');
  const differentDates = await Promise.all([
    ctx.request(booking(3, { date: '2030-01-08', phone: '21987651234' })),
    ctx.request(booking(4, { date: '2030-01-09', phone: '+55 (21) 98765-1234' }))
  ]);
  assert.deepEqual(differentDates.map(result => result.status), [201, 201]);
  assert.equal((await ctx.db.collection('clientes').get()).size, 2);
  assert.equal((await ctx.stored('agendamentos', reference(3))).clienteId, '21987651234');
  assert.equal((await ctx.stored('agendamentos', reference(4))).clienteId, '21987651234');
});

test(`Catálogo administra pacote, atualiza disponibilidade e mantém o retrato histórico [${MODE}]`, { timeout: 180000 }, async t => {
  const legacyDate = '2030-01-08';
  const ctx = await fixture(t, {
    agendamentos: { antigo: { data: legacyDate, horario: '09:00', status: 'confirmado', servicoId: 2 } }
  });
  const service = { name: 'Pacote da semana', kind: 'pacote', duration: '1h 10 min', price: 81, icon: '🌸' };
  const created = await ctx.admin('service', { payload: { operation: 'create', service } });
  assert.equal(created.status, 200);
  const id = created.body.id;
  assert.equal((await ctx.request(booking(1, { serviceId: id }))).status, 201);
  const edited = { ...service, id, name: 'Pacote renovado', duration: '2h', price: 95 };
  assert.equal((await ctx.admin('service', { payload: { operation: 'update', service: edited } })).status, 200);
  assert.equal((await ctx.admin('service', { payload: { operation: 'archive', id } })).status, 200);
  assert.ok(!(await ctx.call('services')).body.services.some(item => item.id === id));
  const adminList = await ctx.admin('services', { query: { admin: 1 } });
  assert.equal(adminList.body.services.find(item => item.id === id).active, false);
  expectError(await ctx.call('availability', { query: { serviceId: id, date: DATE } }), 409, 'service_unavailable');
  assert.equal((await ctx.admin('service', { payload: { operation: 'restore', id } })).status, 200);
  assert.equal((await ctx.call('services')).body.services.find(item => item.id === id).price, 95);
  const historical = await ctx.stored('agendamentos', reference(1));
  assert.deepEqual([historical.servico, historical.duracaoMinutos, historical.preco], ['Pacote da semana', 70, 81]);
  assert.ok((await ctx.availability()).includes('11:00'));
  const legacyService = { ...BASE_SERVICES[2], duration: '40 min' };
  assert.equal((await ctx.admin('service', { payload: { operation: 'update', service: legacyService } })).status, 200);
  assert.ok(!(await ctx.availability(1, legacyDate)).includes('10:00'), 'Uma edição preserva a duração da reserva antiga.');
});

test(`Aprovação manual, relato de PIX, recusa, conclusão e auditoria [${MODE}]`, { timeout: 180000 }, async t => {
  const ctx = await fixture(t);
  const id = reference(1);
  const status = next => ({ payload: { id, status: next } });
  assert.equal((await ctx.request(booking(1))).status, 201);
  expectError(await ctx.call('pix', { payload: { id, phone: PHONE } }), 409, 'invalid_status');
  assert.equal((await ctx.stored('agendamentos', id)).status, 'pendente');
  expectError(await ctx.call('status', status('aprovar')), 401, 'unauthorized');
  expectError(await ctx.admin('status', status('concluido')), 409, 'invalid_status');
  const transitioned = await ctx.admin('status', status('aprovar'));
  assert.equal(transitioned.body.appointment.status, 'aguardando-sinal');
  assert.equal((await ctx.call('pix', { payload: { id, phone: PHONE } })).status, 200);
  assert.equal((await ctx.stored('agendamentos', id)).deposito, 'pendente');
  assert.ok(!(await ctx.availability()).includes('09:00'));
  assert.equal((await ctx.admin('status', status('confirmado'))).body.appointment.status, 'confirmado');
  const confirmed = await ctx.stored('agendamentos', id);
  assert.equal(confirmed.sinalVerificadoPor, CAROL);
  assert.equal(confirmed.aprovadoPor, CAROL);
  assert.equal((await ctx.admin('status', status('concluido'))).body.appointment.status, 'concluido');
  const second = reference(2);
  assert.equal((await ctx.request(booking(2, { time: '10:00' }))).body.appointment.signal, 0);
  assert.equal((await ctx.admin('status', { payload: { id: second, status: 'recusado' } })).body.appointment.status, 'recusado');
  assert.ok((await ctx.availability()).includes('10:00'));
  const audits = (await ctx.db.collection('agendaAuditoria').get()).docs.map(doc => doc.data());
  assert.ok(audits.some(audit => audit.actor === 'cliente' && audit.action === 'sinal-informado'));
  for (const to of ['aguardando-sinal', 'confirmado', 'concluido', 'recusado']) {
    assert.ok(audits.some(audit => audit.actor === CAROL && audit.to === to && audit.at));
  }

  const legacy = {
    status: 'pendente', telefone: '11987651234', data: '2030-01-08', horario: '09:00',
    servico: 'Manicure simples', servicoId: 1, preco: 35, deposito: 'pendente'
  };
  await ctx.db.collection('agendamentos').doc('legacy-a').set(legacy);
  await ctx.db.collection('agendamentos').doc('legacy-b').set(legacy);
  expectError(await ctx.admin('status', { payload: { id: 'legacy-a', status: 'aprovar' } }), 409, 'unavailable');
  assert.equal((await ctx.stored('agendamentos', 'legacy-a')).status, 'pendente');
  assert.equal((await ctx.admin('status', { payload: { id: 'legacy-b', status: 'recusado' } })).status, 200);
  assert.equal((await ctx.admin('status', { payload: { id: 'legacy-a', status: 'aprovar' } })).status, 200);
});

test(`Reagendamento conserva a reserva se falhar e limita a três alterações [${MODE}]`, { timeout: 180000 }, async t => {
  const ctx = await fixture(t);
  assert.equal((await ctx.request(booking(1))).status, 201);
  const status = (id, next) => ctx.admin('status', { payload: { id, status: next } });
  await status(reference(1), 'aprovar');
  await status(reference(1), 'confirmado');
  assert.equal((await ctx.request(booking(20, { time: '10:00', phone: '11987650000' }))).status, 201);
  expectError(await ctx.request(booking(2, { replaces: reference(1), time: '10:00' })), 409, 'unavailable');
  assert.equal((await ctx.stored('agendamentos', reference(1))).status, 'confirmado');
  assert.equal((await ctx.request(booking(21, { replaces: reference(1), time: '11:00' }))).status, 201);
  assert.equal((await ctx.stored('agendamentos', reference(1))).reagendamentoPendente, reference(21));
  assert.equal((await status(reference(21), 'recusado')).body.appointment.status, 'recusado');
  assert.equal((await ctx.stored('agendamentos', reference(1))).status, 'confirmado');
  assert.equal((await ctx.stored('agendamentos', reference(1))).reagendamentoPendente, null);
  assert.ok((await ctx.availability()).includes('11:00'));
  for (const [index, time] of ['11:00', '14:00', '15:00'].entries()) {
    const replaced = reference(index + 1);
    const result = await ctx.request(booking(index + 2, { replaces: replaced, time }));
    assert.equal(result.status, 201, JSON.stringify(result.body));
    assert.equal(result.body.appointment.changes, index + 1);
    assert.equal((await ctx.stored('agendamentos', replaced)).status, 'confirmado');
    assert.equal((await status(reference(index + 2), 'aprovar')).body.appointment.status, 'confirmado');
    assert.equal((await ctx.stored('agendamentos', replaced)).status, 'cancelado');
  }
  expectError(await ctx.request(booking(5, { replaces: reference(4), time: '16:00' })), 409, 'invalid_status');
  assert.equal((await ctx.stored('agendamentos', reference(4))).status, 'confirmado');
  const cancellation = await ctx.call('cancel', { payload: { id: reference(4), phone: PHONE } });
  assert.equal(cancellation.body.appointment.status, 'cancelado');
  assert.equal(cancellation.body.appointment.refundPending, true);
  assert.equal((await status(reference(4), 'resolver-reembolso')).body.appointment.refundPending, false);
  assert.ok((await ctx.availability()).includes('15:00'));
});

test(`Troca sem sinal verificado mantém a reserva até a conferência do Pix [${MODE}]`, { timeout: 180000 }, async t => {
  const ctx = await fixture(t);
  const original = reference(1);
  const newId = reference(2);
  const status = (id, next) => ctx.admin('status', { payload: { id, status: next } });
  await ctx.request(booking(1));
  assert.equal((await ctx.request(booking(2, { replaces: original, date: '2030-01-08' }))).status, 201);
  assert.equal((await status(newId, 'aprovar')).body.appointment.status, 'aguardando-sinal');
  assert.equal((await ctx.stored('agendamentos', original)).status, 'pendente');
  expectError(await ctx.call('cancel', { payload: { id: original, phone: PHONE } }), 409, 'invalid_status');
  const cancelled = await ctx.call('cancel', { payload: { id: newId, phone: PHONE } });
  assert.equal(cancelled.body.appointment.status, 'cancelado');
  assert.equal((await ctx.stored('agendamentos', original)).reagendamentoPendente, null);
  assert.ok((await ctx.availability(1, '2030-01-08')).includes('09:00'));
});

test(`Cadastro validado é isento, com ou sem fidelidade, e domingo só abre por exceção [${MODE}]`, { timeout: 180000 }, async t => {
  const ctx = await fixture(t, { clientes: { [PHONE]: { nome: 'Maria do Carmo', telefone: PHONE, titularUid: 'uid-' + PHONE, cadastroElegivel: true } } });
  const data = { payload: { phone: PHONE, fixed: true } };
  expectError(await ctx.call('client-eligibility', data), 401, 'unauthorized');
  assert.equal((await ctx.request(booking(1))).body.appointment.signal, 0);
  assert.deepEqual(await ctx.availability(1, '2030-01-06'), []);
  assert.equal((await ctx.admin('exception', { payload: { date: '2030-01-06', windows: [['10:00', '11:00']], closed: [] } })).status, 200);
  assert.deepEqual(await ctx.availability(1, '2030-01-06'), ['10:00']);
});

test(`Consulta e alterações exigem vínculo com a conta autenticada [${MODE}]`, { timeout: 180000 }, async t => {
  const ctx = await fixture(t);
  expectError(await ctx.call('request', { payload: booking(1), token: null }), 401, 'unauthorized');
  expectError(await ctx.call('request', { payload: booking(1), token: 'visitor-fixture' }), 403, 'phone_verification_required');
  assert.equal((await ctx.request(booking(1))).status, 201);
  const payload = { id: reference(1), phone: PHONE };
  for (const action of ['lookup', 'pix', 'cancel', 'reschedule-availability']) {
    expectError(await ctx.call(action, { payload, token: 'other:' + PHONE }), 404, 'not_found');
  }
  const saved = await ctx.stored('agendamentos', reference(1));
  assert.equal(saved.status, 'pendente');
  assert.equal(saved.pixStatus, undefined);
});

test(`Primeiros pedidos pagam sinal até a Carol verificar e confirmar [${MODE}]`, { timeout: 180000 }, async t => {
  const ctx = await fixture(t);
  assert.equal((await ctx.request(booking(1))).body.appointment.signal, 30);
  assert.equal((await ctx.admin('status', { payload: { id: reference(1), status: 'aprovar' } })).body.appointment.status, 'aguardando-sinal');
  assert.equal((await ctx.call('pix', { payload: { id: reference(1), phone: PHONE } })).status, 200);
  assert.equal((await ctx.request(booking(2, { time: '10:00' }))).body.appointment.signal, 30);
  assert.equal((await ctx.admin('status', { payload: { id: reference(1), status: 'confirmado' } })).body.appointment.status, 'confirmado');
  assert.equal((await ctx.request(booking(3, { time: '11:00' }))).body.appointment.signal, 0);
});

test(`Cadastro antigo precisa de validação administrativa; duplicatas exigem revisão [${MODE}]`, { timeout: 180000 }, async t => {
  const ctx = await fixture(t, { clientes: {
    legado: { nome: 'Maria do Carmo', telefone: '(11) 98765-4321' },
    'duplicado-a': { nome: 'Cliente exemplo', telefone: '21987651234' },
    'duplicado-b': { nome: 'Cliente exemplo', telefone: '+5521987651234' }
  } });
  const data = { payload: { id: 'legado', phone: PHONE, reviewed: true } };
  expectError(await ctx.request(booking(1)), 409, 'customer_review_required');
  expectError(await ctx.call('client-link', { ...data, token: 'visitor-fixture' }), 403, 'forbidden');
  expectError(await ctx.admin('client-link', { payload: { id: 'duplicado-a', phone: '21987651234', reviewed: true } }), 409, 'customer_review_required');
  assert.equal((await ctx.admin('client-link', data)).status, 200);
  assert.equal((await ctx.request(booking(1))).body.appointment.signal, 0);
  assert.equal((await ctx.db.collection('clientesAuditoria').get()).size, 1);
  assert.equal((await ctx.db.collection('clientes').get()).size, 3);
});
