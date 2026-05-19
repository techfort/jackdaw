import { StorageService, AuthService } from './types';
import { LocalStorageService } from './LocalStorage';
import { LocalAuthService } from './LocalAuth';
import { FirebaseStorageService } from './FirebaseStorage';
import { FirebaseAuthService } from './FirebaseAuth';
import firebaseConfig from '../../../firebase-applet-config.json';

const isFirebaseConfigured = () => {
  return firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey !== 'YOUR_API_KEY';
};

// Check if we should force local mode
const storageMode = (import.meta as any).env?.VITE_STORAGE_MODE || (isFirebaseConfigured() ? 'firebase' : 'local');

let storageService: StorageService;
let authService: AuthService;

if (storageMode === 'firebase') {
  console.log('JackDAW: Using Firebase Storage');
  storageService = new FirebaseStorageService();
  authService = new FirebaseAuthService();
} else {
  console.log('JackDAW: Using Local Storage (IndexedDB)');
  storageService = new LocalStorageService();
  authService = new LocalAuthService();
}

export { storageService, authService, storageMode };
export * from './types';
