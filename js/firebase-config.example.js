// ISSO AQUI É SÓ UM EXEMPLO DE COMO FUNCIONA O ACESSO DO SITE A API

const firebaseConfig = {
  apiKey: "COLE_SUA_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.firebasestorage.app",
  messagingSenderId: "000000000000",
  appId: "0:000000000000:web:0000000000000000"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();