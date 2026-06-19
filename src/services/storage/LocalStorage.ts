import { openDB, IDBPDatabase } from 'idb';
import { StorageService, SongData, Presence, Project, Member, Invite, Role, UserConfig } from './types';

const DB_NAME = 'jackdaw-local-db';
const SONGS_STORE = 'songs';
const PROJECTS_STORE = 'projects';
const AUDIO_CACHE_STORE = 'audio-cache';
const CONFIG_STORE = 'config';
const VERSION = 4;

/** Local user identity is per-browser; key config by user id with a stable fallback. */
const localUserKey = (): string =>
  JSON.parse(localStorage.getItem('jackdaw-user') || '{}').id || 'local';

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
          // Fresh install — create all stores clean
          db.createObjectStore(SONGS_STORE, { keyPath: 'id' });
          db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
          db.createObjectStore(AUDIO_CACHE_STORE, { keyPath: 'trackId' });
          db.createObjectStore(CONFIG_STORE, { keyPath: 'userId' });
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

        if (oldVersion < 3) {
          // v3 adds the audio-cache store for downloaded Firebase Storage files
          db.createObjectStore(AUDIO_CACHE_STORE, { keyPath: 'trackId' });
        }

        if (oldVersion < 4) {
          // v4 adds the config store for per-user terminal aliases + history
          db.createObjectStore(CONFIG_STORE, { keyPath: 'userId' });
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

    // Evict cached audio for clips removed in this save (local economy). Guarded
    // so a partial save without tracks never wipes the cache; undo-safe since a
    // restored clip is present in data.tracks.
    if (Array.isArray(data.tracks)) {
      const prevClips: any[] = ((existing as any)?.tracks || []).flatMap((t: any) => t.clips || []);
      const newClipIds = new Set(data.tracks.flatMap((t: any) => (t.clips || []).map((c: any) => c.id)));
      const orphanIds = prevClips.filter(c => c && c.id && !newClipIds.has(c.id)).map(c => c.id);
      if (orphanIds.length > 0) await this.deleteCachedAudio(orphanIds).catch(() => {});
    }

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
    const key = `${projectId}/${songId}`;
    const existing: any = await db.get(SONGS_STORE, key);
    const clipIds: string[] = ((existing?.tracks || []) as any[])
      .flatMap((t: any) => t.clips || [])
      .filter((c: any) => c && c.id)
      .map((c: any) => c.id);
    await db.delete(SONGS_STORE, key);
    if (clipIds.length > 0) await this.deleteCachedAudio(clipIds).catch(() => {});
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

  // ── Audio cache (keyed by clipId since per-clip audio model) ─────────────

  async cacheAudio(id: string, audioData: ArrayBuffer): Promise<void> {
    const db = await this.db;
    // IDB keyPath is 'trackId' (legacy field name); value is now a clip ID
    await db.put(AUDIO_CACHE_STORE, { trackId: id, audioData });
  }

  async getCachedAudio(id: string): Promise<ArrayBuffer | null> {
    const db = await this.db;
    const record = await db.get(AUDIO_CACHE_STORE, id);
    return record?.audioData ?? null;
  }

  /** Evict cached audio for removed clips so the local cache doesn't leak. */
  async deleteCachedAudio(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const db = await this.db;
    await Promise.all(ids.map(id => db.delete(AUDIO_CACHE_STORE, id)));
  }

  // ── Per-user config (aliases, terminal history) ──────────────────────────

  async getUserConfig(): Promise<UserConfig | null> {
    const db = await this.db;
    const record = await db.get(CONFIG_STORE, localUserKey());
    if (!record) return null;
    return { rc: record.rc ?? '', history: record.history ?? [] };
  }

  async saveUserConfig(config: UserConfig): Promise<void> {
    const db = await this.db;
    await db.put(CONFIG_STORE, { userId: localUserKey(), ...config });
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
