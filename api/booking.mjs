import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { bookingApi, json } from '../server/booking.mjs';

let handler;

function createHandler() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const emulator = !process.env.VERCEL && process.env.FIRESTORE_EMULATOR_HOST && projectId?.startsWith('demo-');
  const options = { projectId };
  if (!projectId) throw new Error('Missing Firebase project');
  if (process.env.VERCEL_ENV === 'preview' && process.env.STUDIO_PREVIEW_FIREBASE_PROJECT_ID !== projectId) {
    throw new Error('Vercel preview requires an explicit Firebase project');
  }
  if (!emulator) {
    if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      throw new Error('Emulator configuration is only supported in local demo projects');
    }
    const account = JSON.parse(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT ?? 'null');
    if (account?.project_id !== projectId) throw new Error('Firebase credential does not match project');
    options.credential = cert(account);
  }
  const app = initializeApp(options);
  return bookingApi({ db: getFirestore(app), auth: getAuth(app), serverTimestamp: () => FieldValue.serverTimestamp() });
}

export default {
  async fetch(request) {
    if (!handler) {
      try {
        handler = createHandler();
      } catch {
        console.error('Configuração da API de agenda indisponível.');
        return json({ error: { code: 'unavailable_backend', message: 'O sistema está indisponível agora. Tente novamente em instantes.' } }, 503);
      }
    }
    return handler(request);
  }
};
