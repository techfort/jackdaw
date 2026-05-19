import { openDB, IDBPDatabase } from 'idb';
import { StorageService, SongData, Presence, Project, Member, Invite, Role } from './types';

const DB_NAME = 'jackdaw-local-db';
const PROJECTS_STORE = 'projects';
const VERSION = 1;

export class LocalStorageService implements StorageService {
  private db: Promise<IDBPDatabase>;
  private listeners: Map<string, Set<(data: SongData) => void>> = new Map();
  private presenceListeners: Map<string, Set<(presences: Presence[]) => void>> = new Map();
  private broadcastChannel: BroadcastChannel | null = null;

  constructor() {
    this.db = openDB(DB_NAME, VERSION, {
      upgrade(db) {
        db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
      },
    });

    if (typeof window !== 'undefined') {
      this.broadcastChannel = new BroadcastChannel('jackdaw-sync');
      this.broadcastChannel.onmessage = (event) => {
        const { type, projectId, data } = event.data;
        if (type === 'project-update' && projectId) {
          this.listeners.get(projectId)?.forEach(cb => cb(data));
        } else if (type === 'presence-update' && projectId) {
          this.presenceListeners.get(projectId)?.forEach(cb => cb(data));
        }
      };
    }
  }

  // Song ops — TODO: Phase C (full implementation)
  async getSong(projectId: string, songId: string): Promise<SongData | null> {
    const db = await this.db;
    const key = `${projectId}/${songId}`;
    return db.get(PROJECTS_STORE, key) ?? null;
  }

  async saveSong(projectId: string, songId: string, data: Partial<SongData>): Promise<void> {
    const db = await this.db;
    const key = `${projectId}/${songId}`;
    const existing = await db.get(PROJECTS_STORE, key);
    const updated = {
      ...existing,
      ...data,
      id: songId,
      projectId,
      updatedAt: Date.now()
    } as SongData;

    await db.put(PROJECTS_STORE, { ...updated, id: key });

    this.broadcastChannel?.postMessage({
      type: 'project-update',
      projectId: key,
      data: updated
    });

    this.listeners.get(key)?.forEach(cb => cb(updated));
  }

  onSongUpdate(projectId: string, songId: string, callback: (data: SongData) => void): () => void {
    const key = `${projectId}/${songId}`;
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)!.add(callback);
    return () => {
      this.listeners.get(key)?.delete(callback);
    };
  }

  async listSongs(projectId: string): Promise<{ id: string; name: string; updatedAt: number }[]> {
    const db = await this.db;
    const all = await db.getAll(PROJECTS_STORE);
    return (all as any[])
      .filter(s => s.projectId === projectId)
      .map(s => ({
        id: typeof s.id === 'string' && s.id.includes('/') ? s.id.split('/')[1] : s.id,
        name: s.name || 'Untitled',
        updatedAt: s.updatedAt || 0
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async deleteSong(projectId: string, songId: string): Promise<void> {
    const db = await this.db;
    const key = `${projectId}/${songId}`;
    await db.delete(PROJECTS_STORE, key);
  }

  // Project ops — TODO: Phase C (full implementation)
  async createProject(name: string): Promise<Project> {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    const project: Project = {
      id,
      name,
      ownerId: JSON.parse(localStorage.getItem('jackdaw-user') || '{}').id || 'anonymous',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    const db = await this.db;
    await db.put('projects', project);
    return project;
  }

  async getProject(id: string): Promise<Project | null> {
    const db = await this.db;
    return db.get(PROJECTS_STORE, id) ?? null;
  }

  async listUserProjects(): Promise<Project[]> {
    const db = await this.db;
    const all = await db.getAll(PROJECTS_STORE);
    // Projects have no '/' in id and no projectId field
    return (all as any[]).filter(r => !String(r.id).includes('/') && !r.projectId) as Project[];
  }

  async deleteProject(id: string): Promise<void> {
    const db = await this.db;
    await db.delete(PROJECTS_STORE, id);
  }

  async updateProject(id: string, data: Partial<Project>): Promise<void> {
    // TODO: Phase C
  }

  // Members — TODO: Phase C
  async getMembers(projectId: string): Promise<Member[]> {
    return [];
  }

  // Invites — TODO: Phase C
  async inviteToProject(projectId: string, email: string, role: Role): Promise<Invite> {
    throw new Error('TODO: Phase C');
  }

  async listInvites(projectId: string): Promise<Invite[]> {
    return [];
  }

  async acceptInvite(inviteId: string, projectId: string): Promise<void> {
    // TODO: Phase C
  }

  async revokeInvite(projectId: string, inviteId: string): Promise<void> {
    // TODO: Phase C
  }

  async updatePresence(projectId: string, songId: string, cursorPosition: number): Promise<void> {
    const user = JSON.parse(localStorage.getItem('jackdaw-user') || '{}');
    if (!user.id) return;

    const presence: Presence = {
      userId: user.id,
      userName: user.name || 'Local User',
      projectId,
      songId,
      cursorPosition,
      lastActive: Date.now()
    };

    const key = `${projectId}/${songId}`;
    this.broadcastChannel?.postMessage({
      type: 'presence-update',
      projectId: key,
      data: [presence]
    });
  }

  onPresenceUpdate(projectId: string, songId: string, callback: (presences: Presence[]) => void): () => void {
    const key = `${projectId}/${songId}`;
    if (!this.presenceListeners.has(key)) this.presenceListeners.set(key, new Set());
    this.presenceListeners.get(key)!.add(callback);
    return () => {
      this.presenceListeners.get(key)?.delete(callback);
    };
  }
}
