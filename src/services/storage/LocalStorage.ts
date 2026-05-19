import { openDB, IDBPDatabase } from 'idb';
import { StorageService, SongData, Presence, Project, Member, Invite, Role } from './types';

const DB_NAME = 'jackdaw-local-db';
const SONGS_STORE = 'songs';
const PROJECTS_STORE = 'projects';
const VERSION = 2;

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 15);

export class LocalStorageService implements StorageService {
  private db: Promise<IDBPDatabase>;
  private listeners: Map<string, Set<(data: SongData) => void>> = new Map();
  private presenceListeners: Map<string, Set<(presences: Presence[]) => void>> = new Map();
  private broadcastChannel: BroadcastChannel | null = null;

  constructor() {
    this.db = openDB(DB_NAME, VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          // Fresh install at v2 — create both stores clean
          db.createObjectStore(SONGS_STORE, { keyPath: 'id' });
          db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
          return;
        }

        if (oldVersion === 1) {
          // v1 had a single 'projects' store holding both song records
          // (keyed projectId/songId) and project metadata (keyed plain id).
          // v2 separates these into 'songs' and 'projects' stores.
          const songsStore = db.createObjectStore(SONGS_STORE, { keyPath: 'id' });
          const oldStore = tx.objectStore(PROJECTS_STORE);
          const all: any[] = await oldStore.getAll();

          // Song records have a '/' in their id (composite key projectId/songId)
          const songRecords = all.filter(r => typeof r.id === 'string' && r.id.includes('/'));
          for (const record of songRecords) {
            await songsStore.put(record);
            await oldStore.delete(record.id);
          }
          // Project metadata records remain in the now-cleaned 'projects' store
        }
      },
    });

    if (typeof window !== 'undefined') {
      this.broadcastChannel = new BroadcastChannel('jackdaw-sync');
      this.broadcastChannel.onmessage = (event) => {
        const { type, key, data } = event.data;
        if (type === 'song-update' && key) {
          this.listeners.get(key)?.forEach(cb => cb(data));
        } else if (type === 'presence-update' && key) {
          this.presenceListeners.get(key)?.forEach(cb => cb(data));
        }
      };
    }
  }

  // ── Song ops ──────────────────────────────────────────────────────────────

  async getSong(projectId: string, songId: string): Promise<SongData | null> {
    const db = await this.db;
    const key = `${projectId}/${songId}`;
    return db.get(SONGS_STORE, key) ?? null;
  }

  async saveSong(projectId: string, songId: string, data: Partial<SongData>): Promise<void> {
    const db = await this.db;
    const key = `${projectId}/${songId}`;
    const existing = await db.get(SONGS_STORE, key);
    const updated = {
      ...existing,
      ...data,
      id: key,
      projectId,
      updatedAt: Date.now()
    } as SongData;

    await db.put(SONGS_STORE, updated);

    this.broadcastChannel?.postMessage({ type: 'song-update', key, data: updated });
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
    const all: any[] = await db.getAll(SONGS_STORE);
    return all
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
    await db.delete(SONGS_STORE, `${projectId}/${songId}`);
  }

  // ── Project ops ───────────────────────────────────────────────────────────

  async createProject(name: string): Promise<Project> {
    const id = generateId();
    const project: Project = {
      id,
      name,
      ownerId: JSON.parse(localStorage.getItem('jackdaw-user') || '{}').id || 'anonymous',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    const db = await this.db;
    await db.put(PROJECTS_STORE, project);
    return project;
  }

  async getProject(id: string): Promise<Project | null> {
    const db = await this.db;
    return db.get(PROJECTS_STORE, id) ?? null;
  }

  async listUserProjects(): Promise<Project[]> {
    const db = await this.db;
    return db.getAll(PROJECTS_STORE);
  }

  async deleteProject(id: string): Promise<void> {
    const db = await this.db;
    await db.delete(PROJECTS_STORE, id);
  }

  async updateProject(id: string, data: Partial<Project>): Promise<void> {
    const db = await this.db;
    const existing = await db.get(PROJECTS_STORE, id);
    if (!existing) return;
    await db.put(PROJECTS_STORE, { ...existing, ...data, updatedAt: Date.now() });
  }

  // ── Members — not supported locally ──────────────────────────────────────

  async getMembers(_projectId: string): Promise<Member[]> {
    return [];
  }

  // ── Invites — not supported locally ──────────────────────────────────────

  async inviteToProject(_projectId: string, _email: string, _role: Role): Promise<Invite> {
    throw new Error('Invites are not supported in local mode');
  }

  async listInvites(_projectId: string): Promise<Invite[]> {
    return [];
  }

  async acceptInvite(_inviteId: string, _projectId: string): Promise<void> {
    throw new Error('Invites are not supported in local mode');
  }

  async revokeInvite(_projectId: string, _inviteId: string): Promise<void> {
    throw new Error('Invites are not supported in local mode');
  }

  // ── Presence ──────────────────────────────────────────────────────────────

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
    this.broadcastChannel?.postMessage({ type: 'presence-update', key, data: [presence] });
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
