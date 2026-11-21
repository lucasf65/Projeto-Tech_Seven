// Gera js/firebase-config.js a partir das variáveis de ambiente (rodado pela Vercel)
const fs = require('fs');

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

fs.writeFileSync('js/firebase-config.js',
`const firebaseConfig = ${JSON.stringify(cfg, null, 2)};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
`);
console.log('firebase-config.js gerado');