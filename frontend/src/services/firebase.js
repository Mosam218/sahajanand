// Firebase Authentication (email + password + Google). The backend verifies the ID
// token on every request; nothing here is a secret (web API keys identify the
// project, they do not grant access).
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, GoogleAuthProvider } from 'firebase/auth';

const env = import.meta.env;
const emulatorUrl = env.VITE_FIREBASE_AUTH_EMULATOR_URL || '';

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY || (emulatorUrl ? 'emulator-key' : ''),
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: env.VITE_FIREBASE_PROJECT_ID || '',
  appId: env.VITE_FIREBASE_APP_ID || '',
};

// Without a project the site still works for browsing and quote requests;
// sign-in explains that accounts are not available.
export const authConfigured = Boolean(config.apiKey && config.projectId);

export const auth = authConfigured ? getAuth(initializeApp(config)) : null;

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Local development only (never set in a production build)
if (auth && emulatorUrl) {
  connectAuthEmulator(auth, emulatorUrl, { disableWarnings: true });
}
