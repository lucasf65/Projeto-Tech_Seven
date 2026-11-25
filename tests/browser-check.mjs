import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
import { bookingApi } from '../server/booking.mjs';
import { MemoryFirestore } from './memory-firestore.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TECH_SEVEN_PLAYWRIGHT ?? 'playwright');
const root = resolve('public');
const phone = '11987650000';
const uid = 'client-demo';
const firstId = '7218a246-3972-4fac-bda6-3a4ef29f1629';
const testDate = '2030-01-07';
const db = new MemoryFirestore({
  servicos: { 1: { name: 'Manicure exemplo', duration: '40 min', price: 50 } },
  clientes: { [phone]: { nome: 'Maria Exemplo', telefone: phone, titularUid: uid } },
  agendamentos: { [firstId]: { origem: 'site-v2', titularUid: uid, telefone: phone, clienteId: phone,
    status: 'aguardando-sinal', deposito: 'pendente', data: testDate, horario: '09:00',
    servicoId: 1, servico: 'Manicure exemplo', preco: 50, sinalValor: 30 } }
});
const api = bookingApi({
  db, auth: { async verifyIdToken(token) {
    assert.equal(token, 'demo-browser-session');
    return { uid, phone_number: '+55' + phone, firebase: { sign_in_provider: 'phone' } };
  } },
  clock: () => new Date('2030-01-01T12:00:00Z'), serverTimestamp: () => '2030-01-01T12:00:00Z'
});
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/api/booking') {
      const response = await api(new Request(url, {
        method: req.method, headers: req.headers, ...(req.method === 'POST' && { body: req, duplex: 'half' })
      }));
      res.writeHead(response.status, Object.fromEntries(response.headers)).end(await response.text());
      return;
    }
    const file = resolve(root, '.' + url.pathname);
    if (!file.startsWith(root + sep)) throw new Error('Invalid fixture path');
    const buffer = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }).end(buffer);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.TECH_SEVEN_EDGE, headless: true,
    args: ['--no-first-run', '--disable-background-networking', '--disable-extensions'] });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const context = await browser.newContext({ viewport: { width: 360, height: 780 }, reducedMotion: 'reduce' });
  await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
  await context.addInitScript(() => {
    const user = {
      phoneNumber: '+5511987650000',
      async getIdToken() { return 'demo-browser-session'; },
      async getIdTokenResult() { return { signInProvider: 'phone', token: await this.getIdToken() }; }
    };
    const apps = [];
    function initializeApp(options, name = '[DEFAULT]') {
      const clientAuth = {
        get currentUser() { return sessionStorage.getItem('browser-fixture-owner') ? user : null; },
        async setPersistence() {},
        onAuthStateChanged(listener) { queueMicrotask(listener); return () => {}; },
        async signInWithPhoneNumber(phone) {
          if (phone !== user.phoneNumber) throw new Error('Unexpected fixture number');
          return { async confirm(code) {
            if (code !== '000111') throw new Error('Invalid fixture code');
            sessionStorage.setItem('browser-fixture-owner', 'yes');
            return { user };
          } };
        }
      };
      const app = { options, name, auth: () => clientAuth };
      apps.push(app);
      return app;
    }
    const auth = Object.assign(() => apps[0].auth(), {
      Auth: { Persistence: { SESSION: 'session' } },
      RecaptchaVerifier: class { async render() {} clear() {} }
    });
    window.firebase = { auth, apps, initializeApp, app: () => apps[0],
      firestore: () => ({ collection: () => ({ orderBy: () => ({ async get() { throw new Error('offline fixture'); } }) }) })
    };
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2030-01-01T12:00:00Z'));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  await page.goto(origin + '/meus-horarios.html');
  await page.locator('#lookup').fill(phone);
  await page.locator('#lookupReference').fill(firstId);
  await page.locator('#findAppointments').click();
  await page.getByRole('dialog', { name: 'Confirme seu telefone' }).waitFor();
  await page.getByRole('button', { name: 'Enviar SMS' }).click();
  await page.getByLabel('Código de seis dígitos').fill('123123');
  await page.getByRole('button', { name: 'Confirmar código' }).click();
  await page.getByText('O código não foi aceito.', { exact: false }).waitFor();
  await page.getByLabel('Código de seis dígitos').fill('000111');
  await page.getByRole('button', { name: 'Confirmar código' }).click();
  await page.getByText('Horário encontrado.').waitFor();
  assert.match(await page.getByRole('link', { name: 'Enviar comprovante por WhatsApp' }).getAttribute('href'), /^https:\/\/wa\.me\//);
  await page.getByRole('button', { name: 'Informar pagamento' }).click();
  await page.getByText('Aviso enviado.', { exact: false }).waitFor();
  assert(await noOverflow());
  await page.getByRole('button', { name: 'Reagendar', exact: true }).click();
  await page.waitForURL('**/agendamento.html');
  await page.getByText('A reserva original continua válida', { exact: false }).waitFor();
  await page.getByRole('button', { name: /Manicure exemplo/ }).click();
  await page.getByRole('button', { name: '7 de janeiro de 2030', exact: true }).click();
  await page.getByRole('button', { name: '10:00', exact: true }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Maria Exemplo');
  await page.locator('#privacy').check();
  await page.getByRole('button', { name: 'Enviar solicitação' }).click();
  await page.getByText('Solicitação enviada.', { exact: false }).waitFor();
  assert.equal((await db.collection('agendamentos').doc(firstId).get()).data().status, 'aguardando-sinal');
  assert(await noOverflow());
  console.log('Meus Horários e reagendamento no celular: verificação simulada, código inválido e válido, consulta, aviso Pix e reserva preservada.');
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 780 });
    await page.goto(origin + '/galeria.html');
    const photos = page.getByRole('button', { name: /^Ampliar foto/ });
    await photos.last().waitFor();
    assert.equal(await photos.count(), 8);
    assert(await page.locator('#fullGallery img').evaluateAll(images => images.every(image => image.alt.trim())));
    assert(await noOverflow());
    await photos.first().focus();
    await page.keyboard.press('Enter');
    await page.locator('.lb.open').waitFor();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('.lb-count').textContent(), '2 / 8');
    await page.keyboard.press('Escape');
    assert(await photos.first().evaluate(button => document.activeElement === button));
  }
  assert.deepEqual(errors, []);
  console.log('Galeria a 360 e 1280 px: 8 imagens locais, texto alternativo, teclado, Escape, retorno do foco e sem rolagem horizontal.');
} finally {
  await browser?.close();
  server.close();
}
