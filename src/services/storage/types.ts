import { TrackData, Comment } from '../../types';

export interface User {
  id: string;
  name: string;
  email?: string;
  isAnonymous: boolean;
}

export interface SongData {
  id: string;
  projectId: string;
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
  songId: string;
  cursorPosition: number;
  lastActive: number;
}

export type Role = 'owner' | 'editor' | 'viewer';

export interface Member {
  userId: string;
  role: Role;
  name: string;
  joinedAt: number;
}

export interface Invite {
  id: string;
  email: string;
  role: Role;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'accepted' | 'expired';
}

export interface Project {
  id: string;
  name: string;
  ownerId: string;
  ownerName?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AuthService {
  getCurrentUser(): User | null;
  onAuthStateChanged(callback: (user: User | null) => void): () => void;
  signInMagicLink(email: string, displayName?: string): Promise<void>;
  anonymousSignIn(): Promise<User>;
  signOut(): Promise<void>;
  updateProfile(name: string): Promise<void>;
}

export interface StorageService {
  // Song ops (renamed from project ops — keyed by projectId + songId)
  getSong(projectId: string, songId: string): Promise<SongData | null>;
  saveSong(projectId: string, songId: string, data: Partial<SongData>): Promise<void>;
  onSongUpdate(projectId: string, songId: string, callback: (data: SongData) => void): () => void;
  listSongs(projectId: string): Promise<{ id: string; name: string; updatedAt: number }[]>;
  deleteSong(projectId: string, songId: string): Promise<void>;

  // Project (top-level container) ops
  createProject(name: string): Promise<Project>;
  getProject(id: string): Promise<Project | null>;
  listUserProjects(): Promise<Project[]>;
  deleteProject(id: string): Promise<void>;
  updateProject(id: string, data: Partial<Project>): Promise<void>;

  // Members
  getMembers(projectId: string): Promise<Member[]>;

  // Invites
  inviteToProject(projectId: string, email: string, role: Role): Promise<Invite>;
  listInvites(projectId: string): Promise<Invite[]>;
  acceptInvite(inviteId: string, projectId: string): Promise<void>;
  revokeInvite(projectId: string, inviteId: string): Promise<void>;

  // Presence
  updatePresence(projectId: string, songId: string, cursorPosition: number): Promise<void>;
  onPresenceUpdate(projectId: string, songId: string, callback: (presences: Presence[]) => void): () => void;
}
