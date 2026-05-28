import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot, 
  collection, 
  query, 
  where,
  deleteDoc,
  serverTimestamp,
  getDocFromServer
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Test connection
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

// ── Dev-mode cost counter ─────────────────────────────────────────────────────
// Tracks Firestore reads/writes in development to catch runaway patterns early.
// Known cost model:
//   • Song doc (inline comments+tracks): 1 read on open, 1 write per save — cheap
//   • listUserProjects: 1 read per mirror + 1 getProject per project (N+1 — bounded)
//   • getMembers: 1 collection read when CollaborationPanel opens — cheap
//   • Presence: max 1 write/sec per user (strict throttle in usePresenceSync)
//   • Real-time listeners: 1 persistent onSnapshot per active song — cheap
// Guard: if reads exceed 200/min in dev, something is looping — investigate.
const _costCounter = import.meta.env.DEV ? (() => {
  let reads = 0, writes = 0, windowStart = Date.now();
  return {
    read(path?: string) {
      reads++;
      const elapsed = Date.now() - windowStart;
      if (elapsed >= 60_000) {
        if (reads > 200) console.warn(`[Firebase Cost] High read rate: ${reads} reads in ${Math.round(elapsed / 1000)}s`);
        reads = 0; writes = 0; windowStart = Date.now();
      }
    },
    write(path?: string) {
      writes++;
    }
  };
})() : null;

export const trackFirestoreRead = (path?: string) => _costCounter?.read(path);
export const trackFirestoreWrite = (path?: string) => _costCounter?.write(path);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
