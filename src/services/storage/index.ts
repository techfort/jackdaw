import { StorageService, AuthService } from './types';
import { LocalStorageService } from './LocalStorage';
import { LocalAuthService } from './LocalAuth';

const storageMode = import.meta.env.VITE_STORAGE_MODE || 'local';

let storageService: StorageService;
let authService: AuthService;

if (storageMode === 'firebase') {
  // Dynamic import to avoid loading Firebase in local mode
  const { FirebaseStorageService } = await import('./FirebaseStorage');
  const { FirebaseAuthService } = await import('./FirebaseAuth');
  storageService = new FirebaseStorageService();
  authService = new FirebaseAuthService();
  console.log('JackDAW: Using Firebase Storage');
} else {
  storageService = new LocalStorageService();
  authService = new LocalAuthService();
  console.log('JackDAW: Using Local Storage (IndexedDB)');
}

export { storageService, authService, storageMode };
export * from './types';
