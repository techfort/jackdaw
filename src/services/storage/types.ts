import { TrackData, Comment } from '../../types';

export interface User {
  id: string;
  name: string;
  email?: string;
  isAnonymous: boolean;
}

export interface ProjectData {
  id: string;
  name: string;
  tracks: TrackData[];
  comments: Comment[];
  tempo: number;
  updatedAt: number;
}

export interface Presence {
  userId: string;
  userName: string;
  projectId: string;
  cursorPosition: number;
  lastActive: number;
}

export interface AuthService {
  getCurrentUser(): User | null;
  onAuthStateChanged(callback: (user: User | null) => void): () => void;
  signInMagicLink(email: string): Promise<void>;
  anonymousSignIn(): Promise<User>;
  signOut(): Promise<void>;
  updateProfile(name: string): Promise<void>;
}

export interface StorageService {
  getProject(id: string): Promise<ProjectData | null>;
  saveProject(id: string, data: Partial<ProjectData>): Promise<void>;
  onProjectUpdate(id: string, callback: (data: ProjectData) => void): () => void;
  
  updatePresence(projectId: string, cursorPosition: number): Promise<void>;
  onPresenceUpdate(projectId: string, callback: (presences: Presence[]) => void): () => void;
  
  listProjects(): Promise<{ id: string; name: string; updatedAt: number }[]>;
  deleteProject(id: string): Promise<void>;
}
