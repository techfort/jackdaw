import { AuthService, User } from './types';

export class LocalAuthService implements AuthService {
  private user: User | null = null;
  private listeners: Set<(user: User | null) => void> = new Set();

  constructor() {
    const saved = localStorage.getItem('jackdaw-user');
    if (saved) {
      try {
        this.user = JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved user", e);
      }
    }
  }

  getCurrentUser(): User | null {
    return this.user;
  }

  onAuthStateChanged(callback: (user: User | null) => void): () => void {
    this.listeners.add(callback);
    callback(this.user);
    return () => this.listeners.delete(callback);
  }

  async signInMagicLink(email: string, displayName?: string): Promise<void> {
    // In local mode, magic link just "works" instantly for mocking
    // or we could say "local mode doesn't support cloud auth"
    console.log(`Local mode: simulating sign in for ${email}`);
    const newUser: User = {
      id: email,
      name: displayName?.trim() || email.split('@')[0],
      email,
      isAnonymous: false
    };
    this.setUser(newUser);
  }

  async anonymousSignIn(): Promise<User> {
    if (this.user) return this.user;
    
    const id = 'local-' + Math.random().toString(36).substring(2, 9);
    const newUser: User = {
      id,
      name: `Collaborator ${id.slice(-4)}`,
      isAnonymous: true
    };
    this.setUser(newUser);
    return newUser;
  }

  async signOut(): Promise<void> {
    this.setUser(null);
    localStorage.removeItem('jackdaw-user');
  }

  async updateProfile(name: string): Promise<void> {
    if (!this.user) return;
    const updated = { ...this.user, name };
    this.setUser(updated);
  }

  private setUser(user: User | null) {
    this.user = user;
    if (user) {
      localStorage.setItem('jackdaw-user', JSON.stringify(user));
    } else {
      localStorage.removeItem('jackdaw-user');
    }
    this.listeners.forEach(cb => cb(user));
  }
}
