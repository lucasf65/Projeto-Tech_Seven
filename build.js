const fs = require('fs');
const path = require('path');

const cfg = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

const faltando = Object.entries(cfg).filter(([, v]) => !v).map(([k]) => k);
if (faltando.length) {
  console.error('Variáveis faltando:', faltando.join(', '));
  process.exit(1);
}

if (process.env.VERCEL_ENV === 'preview'
    && process.env.STUDIO_PREVIEW_FIREBASE_PROJECT_ID !== cfg.projectId) {
  console.error('Configure um projeto Firebase isolado e informe seu ID em STUDIO_PREVIEW_FIREBASE_PROJECT_ID.');
  process.exit(1);
}
if (process.env.VERCEL_ENV === 'production'
    && (!process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT || !process.env.STUDIO_WHATSAPP)) {
  console.error('A publicação exige a credencial protegida da API e o WhatsApp do estúdio.');
  process.exit(1);
}

// A publicação contém só páginas e recursos estáticos. O código da API é empacotado pela Vercel.
const output = path.join(__dirname, 'public');
const usePixQr = process.env.STUDIO_USE_PIX_QR === 'true';
const pixQrSource = path.join(__dirname, 'assets', 'qr-pix.png');
if (usePixQr && !fs.existsSync(pixQrSource)) {
  console.error('Adicione o arquivo do QR Pix antes de habilitar STUDIO_USE_PIX_QR.');
  process.exit(1);
}
fs.mkdirSync(output, { recursive: true });
for (const file of fs.readdirSync(__dirname).filter(name => name.endsWith('.html'))) {
  fs.copyFileSync(path.join(__dirname, file), path.join(output, file));
}
for (const folder of ['assets', 'css', 'js']) {
  fs.cpSync(path.join(__dirname, folder), path.join(output, folder), {
    recursive: true,
    filter: source => !/^(?:firebase-config(?:\.example)?|site-config)\.js$/.test(path.basename(source))
      && (usePixQr || source !== pixQrSource)
  });
}
if (!usePixQr) fs.rmSync(path.join(output, 'assets', 'qr-pix.png'), { force: true });

fs.writeFileSync(path.join(output, 'js/firebase-config.js'),
`const firebaseConfig = ${JSON.stringify(cfg, null, 2)};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
`);
const studio = {
  whatsapp: (process.env.STUDIO_WHATSAPP ?? '').replace(/\D/g, ''),
  pixKey: (process.env.STUDIO_PIX_KEY ?? '').trim(),
  pixName: (process.env.STUDIO_PIX_NAME ?? '').trim(),
  pixCode: (process.env.STUDIO_PIX_CODE ?? '').trim(),
  pixQr: usePixQr ? 'assets/qr-pix.png' : ''
};
if (studio.whatsapp && (!/^55[1-9][0-9]9[0-9]{8}$/.test(studio.whatsapp) || studio.whatsapp === '5511999999999')) {
  console.error('STUDIO_WHATSAPP deve ser o número real do estúdio, com 55 e DDD.');
  process.exit(1);
}
if ((studio.pixCode || studio.pixQr) && !studio.pixKey) {
  console.error('Configure STUDIO_PIX_KEY antes de habilitar o código Pix ou o QR Code.');
  process.exit(1);
}
fs.writeFileSync(path.join(output, 'js/site-config.js'), `const studioConfig = Object.freeze(${JSON.stringify(studio)});\n`);
console.log('Site gerado em public/');
