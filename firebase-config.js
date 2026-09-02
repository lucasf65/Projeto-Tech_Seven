// firebase-config.js

const firebaseConfig = {
  apiKey: "AIzaSyDRPs6BG2CydVQJubRTe9Bqlhty96wVOAk",
  authDomain: "nails-by-nascimento.firebaseapp.com",
  projectId: "nails-by-nascimento",
  storageBucket: "nails-by-nascimento.firebasestorage.app",
  messagingSenderId: "1057721995095",
  appId: "1:1057721995095:web:96019413577dec240af812"
};

// Inicializa o Firebase
firebase.initializeApp(firebaseConfig);

// Serviços
const auth = firebase.auth();
const db = firebase.firestore();
