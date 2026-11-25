import assert from 'node:assert/strict';
import { test } from 'node:test';

const host = process.env.FIRESTORE_EMULATOR_HOST;
const project = 'demo-tech-seven-rules';
const local = /^(127\.0\.0\.1|localhost):\d+$/.test(host ?? '');

test('Regras do emulador separam dados de cliente da galeria pública', { skip: !local }, async () => {
  const base = `http://${host}/v1/projects/${project}/databases/(default)/documents`;
  const path = 'agendamentos/exemplo';
  const fields = { status: { stringValue: 'confirmado' } };
  const adminId = 'admin-demo';
  const token = uid => [
    { alg: 'none', typ: 'JWT' },
    { sub: uid, user_id: uid, aud: project, iss: `https://securetoken.google.com/${project}`,
      iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600, firebase: { sign_in_provider: 'custom' } }
  ].map(part => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.') + '.';

  async function probe(document, { identity, method = 'GET', body } = {}) {
    const res = await fetch(`${base}/${document}`, {
      method,
      headers: { ...(identity && { Authorization: `Bearer ${identity}` }), ...(body && { 'Content-Type': 'application/json' }) },
      ...(body && { body: JSON.stringify(body) })
    });
    await res.text();
    return res.status;
  }

  assert.equal(await probe(`admins/${adminId}`, { identity: 'owner', method: 'PATCH', body: { fields: {} } }), 200);
  assert.equal(await probe(path, { identity: 'owner', method: 'PATCH', body: { fields } }), 200);
  assert.equal(await probe(path), 403);
  assert.equal(await probe(path, { identity: token('client-demo') }), 403);
  assert.equal(await probe('clientes'), 403);
  assert.equal(await probe('galeria'), 200);
  assert.equal(await probe(path, { identity: token(adminId) }), 200);
  assert.equal(await probe(path, { identity: token(adminId), method: 'PATCH', body: { fields } }), 403);
});
