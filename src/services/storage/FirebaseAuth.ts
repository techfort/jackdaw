import { 
  signInAnonymously, 
  signOut, 
  onAuthStateChanged,
  updateProfile,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink
} from 'firebase/auth';
import { auth } from '../firebaseService';
import { AuthService, User } from './types';

export class FirebaseAuthService implements AuthService {
  getCurrentUser(): User | null {
    if (!auth.currentUser) return null;
    return {
      id: auth.currentUser.uid,
      name: auth.currentUser.displayName || `Collaborator ${auth.currentUser.uid.slice(0, 4)}`,
      email: auth.currentUser.email || undefined,
      isAnonymous: auth.currentUser.isAnonymous
    };
  }

  onAuthStateChanged(callback: (user: User | null) => void): () => void {
    return onAuthStateChanged(auth, (fbUser) => {
      if (!fbUser) {
        callback(null);
      } else {
        callback({
          id: fbUser.uid,
          name: fbUser.displayName || `Collaborator ${fbUser.uid.slice(0, 4)}`,
          email: fbUser.email || undefined,
          isAnonymous: fbUser.isAnonymous
        });
      }
    });
  }

  async signInMagicLink(email: string): Promise<void> {
    const actionCodeSettings = {
      url: window.location.href, // Or a specific dashboard URL
      handleCodeInApp: true,
    };
    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    window.localStorage.setItem('emailForSignIn', email);
  }

  // Handle magic link completion
  async completeMagicLinkSignIn(): Promise<User | null> {
    if (isSignInWithEmailLink(auth, window.location.href)) {
      let email = window.localStorage.getItem('emailForSignIn');
      if (!email) {
        email = window.prompt('Please provide your email for confirmation');
      }
      if (email) {
        const result = await signInWithEmailLink(auth, email, window.location.href);
        window.localStorage.removeItem('emailForSignIn');
        if (result.user) {
          return {
            id: result.user.uid,
            name: result.user.displayName || email.split('@')[0],
            email: result.user.email || undefined,
            isAnonymous: result.user.isAnonymous
          };
        }
      }
    }
    return null;
  }

  async anonymousSignIn(): Promise<User> {
    const result = await signInAnonymously(auth);
    return {
      id: result.user.uid,
      name: `Collaborator ${result.user.uid.slice(0, 4)}`,
      isAnonymous: true
    };
  }

  async signOut(): Promise<void> {
    await signOut(auth);
  }

  async updateProfile(name: string): Promise<void> {
    if (!auth.currentUser) return;
    await updateProfile(auth.currentUser, { displayName: name });
  }
}
