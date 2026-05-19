import { openDB, IDBPDatabase } from 'idb';
import { StorageService, ProjectData, Presence } from './types';

const DB_NAME = 'jackdaw-local-db';
const PROJECTS_STORE = 'projects';
const VERSION = 1;

export class LocalStorageService implements StorageService {
  private db: Promise<IDBPDatabase>;
  private listeners: Map<string, Set<(data: ProjectData) => void>> = new Map();
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
          // In local mode, presence is a bit of a placeholder since it's same-browser
          // but BroadcastChannel allows multi-tab presence
          this.presenceListeners.get(projectId)?.forEach(cb => cb(data));
        }
      };
    }
  }

  async getProject(id: string): Promise<ProjectData | null> {
    const db = await this.db;
    return db.get(PROJECTS_STORE, id);
  }

  async saveProject(id: string, data: Partial<ProjectData>): Promise<void> {
    const db = await this.db;
    const existing = await db.get(PROJECTS_STORE, id);
    const updated = {
      ...existing,
      ...data,
      id,
      updatedAt: Date.now()
    } as ProjectData;
    
    await db.put(PROJECTS_STORE, updated);
    
    this.broadcastChannel?.postMessage({
      type: 'project-update',
      projectId: id,
      data: updated
    });
    
    this.listeners.get(id)?.forEach(cb => cb(updated));
  }

  onProjectUpdate(id: string, callback: (data: ProjectData) => void): () => void {
    if (!this.listeners.has(id)) this.listeners.set(id, new Set());
    this.listeners.get(id)!.add(callback);
    return () => {
      this.listeners.get(id)?.delete(callback);
    };
  }

  async updatePresence(projectId: string, cursorPosition: number): Promise<void> {
    // Local presence is mostly for multi-tab testing in this context
    // We'll just broadcast it
    const user = JSON.parse(localStorage.getItem('jackdaw-user') || '{}');
    if (!user.id) return;

    const presence: Presence = {
      userId: user.id,
      userName: user.name || 'Local User',
      projectId,
      cursorPosition,
      lastActive: Date.now()
    };

    this.broadcastChannel?.postMessage({
      type: 'presence-update',
      projectId,
      data: [presence] // Simplified: just send self for now
    });
  }

  onPresenceUpdate(projectId: string, callback: (presences: Presence[]) => void): () => void {
    if (!this.presenceListeners.has(projectId)) this.presenceListeners.set(projectId, new Set());
    this.presenceListeners.get(projectId)!.add(callback);
    return () => {
      this.presenceListeners.get(projectId)?.delete(callback);
    };
  }

  async listProjects(): Promise<{ id: string; name: string; updatedAt: number }[] | any[]> {
    const db = await this.db;
    const projects = await db.getAll(PROJECTS_STORE);
    return projects.map(p => ({
      id: p.id,
      name: p.name,
      updatedAt: p.updatedAt
    }));
  }

  async deleteProject(id: string): Promise<void> {
    const db = await this.db;
    await db.delete(PROJECTS_STORE, id);
  }
}
