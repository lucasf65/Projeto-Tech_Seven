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

// A publicação contém só páginas e recursos estáticos. O código da API é empacotado pela Vercel.
const output = path.join(__dirname, 'public');
fs.mkdirSync(output, { recursive: true });
for (const file of fs.readdirSync(__dirname).filter(name => name.endsWith('.html'))) {
  fs.copyFileSync(path.join(__dirname, file), path.join(output, file));
}
for (const folder of ['assets', 'css', 'js']) {
  fs.cpSync(path.join(__dirname, folder), path.join(output, folder), {
    recursive: true,
    filter: source => !/^firebase-config(?:\.example)?\.js$/.test(path.basename(source))
  });
}

fs.writeFileSync(path.join(output, 'js/firebase-config.js'),
`const firebaseConfig = ${JSON.stringify(cfg, null, 2)};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
`);
console.log('Site gerado em public/');
