import {
  signOut,
  onAuthStateChanged,
  updateProfile as firebaseUpdateProfile,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseService';
import { AuthService, User } from './types';

async function ensureUserProfile(firebaseUser: { uid: string; displayName: string | null; email: string | null; isAnonymous: boolean }) {
  if (firebaseUser.isAnonymous) return;
  const userId = firebaseUser.email || firebaseUser.uid;
  try {
    await setDoc(doc(db, 'users', userId), {
      id: userId,
      name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || `User ${firebaseUser.uid.slice(0, 4)}`,
      email: firebaseUser.email || null,
      updatedAt: Date.now()
    }, { merge: true });
  } catch (err) {
    console.warn('Failed to write user profile:', err);
  }
}

export class FirebaseAuthService implements AuthService {
  getCurrentUser(): User | null {
    if (!auth.currentUser) return null;
    const userId = auth.currentUser.email || auth.currentUser.uid;
    return {
      id: userId,
      name: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || `Collaborator ${auth.currentUser.uid.slice(0, 4)}`,
      email: auth.currentUser.email || undefined,
      isAnonymous: auth.currentUser.isAnonymous
    };
  }

  onAuthStateChanged(callback: (user: User | null) => void): () => void {
    return onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        callback(null);
      } else {
        await ensureUserProfile(fbUser);
        const userId = fbUser.email || fbUser.uid;
        callback({
          id: userId,
          name: fbUser.displayName || fbUser.email?.split('@')[0] || `Collaborator ${fbUser.uid.slice(0, 4)}`,
          email: fbUser.email || undefined,
          isAnonymous: fbUser.isAnonymous
        });
      }
    });
  }

  async signInMagicLink(email: string, displayName?: string): Promise<void> {
    // Preserve any invite params so they survive the magic link round-trip
    const params = new URLSearchParams(window.location.search);
    const inviteId = params.get('invite');
    const projectId = params.get('project');
    let callbackUrl = window.location.origin + window.location.pathname;
    if (inviteId && projectId) {
      callbackUrl += `?invite=${encodeURIComponent(inviteId)}&project=${encodeURIComponent(projectId)}`;
    }
    await sendSignInLinkToEmail(auth, email, {
      url: callbackUrl,
      handleCodeInApp: true
    });
    window.localStorage.setItem('emailForSignIn', email);
    if (displayName?.trim()) {
      window.localStorage.setItem('displayNameForSignIn', displayName.trim());
    } else {
      window.localStorage.removeItem('displayNameForSignIn');
    }
  }

  async completeMagicLinkSignIn(): Promise<User | null> {
    if (!isSignInWithEmailLink(auth, window.location.href)) return null;

    // Capture invite params BEFORE cleaning URL — save to localStorage so App can read them
    const params = new URLSearchParams(window.location.search);
    const inviteId = params.get('invite');
    const projectId = params.get('project');
    if (inviteId) window.localStorage.setItem('pendingInviteId', inviteId);
    if (projectId) window.localStorage.setItem('pendingProjectId', projectId);

    const email = window.localStorage.getItem('emailForSignIn');
    if (!email) {
      // Signal to App.tsx that we need email confirmation before we can complete
      throw new Error('EMAIL_REQUIRED');
    }

    const result = await signInWithEmailLink(auth, email, window.location.href);
    window.localStorage.removeItem('emailForSignIn');
    const pendingDisplayName = window.localStorage.getItem('displayNameForSignIn');
    window.localStorage.removeItem('displayNameForSignIn');

    // Clean magic link from URL (invite params already saved to localStorage above)
    window.history.replaceState({}, '', window.location.pathname);

    if (result.user) {
      if (pendingDisplayName) {
        await firebaseUpdateProfile(result.user, { displayName: pendingDisplayName });
      }
      await ensureUserProfile(result.user);
      return {
        id: result.user.email || result.user.uid,
        name: result.user.displayName || pendingDisplayName || email.split('@')[0],
        email: result.user.email || undefined,
        isAnonymous: result.user.isAnonymous
      };
    }
    return null;
  }

  async signOut(): Promise<void> {
    await signOut(auth);
  }

  async updateProfile(name: string): Promise<void> {
    if (!auth.currentUser) return;
    await firebaseUpdateProfile(auth.currentUser, { displayName: name });
    await ensureUserProfile({ ...auth.currentUser, displayName: name });
  }
}
