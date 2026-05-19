import { openDB, IDBPDatabase } from 'idb';
import { DAWState, TrackData, Comment } from '../types';

export interface ProjectMetadata {
  id: string;
  name: string;
  updatedAt: number;
  tracksCount: number;
}

export interface ProjectData {
  id: string;
  name: string;
  tempo: number;
  comments: Comment[];
  tracks: Array<Omit<TrackData, 'buffer'> & { audioData?: ArrayBuffer }>;
  updatedAt: number;
}

const DB_NAME = 'jackdaw-projects';
const STORE_NAME = 'projects';

export const storageService = {
  async getDB(): Promise<IDBPDatabase> {
    return openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      },
    });
  },

  async saveProject(project: ProjectData) {
    const db = await this.getDB();
    await db.put(STORE_NAME, project);
  },

  async listProjects(): Promise<ProjectMetadata[]> {
    const db = await this.getDB();
    const projects = await db.getAll(STORE_NAME);
    return projects.map(p => ({
      id: p.id,
      name: p.name,
      updatedAt: p.updatedAt,
      tracksCount: p.tracks.length
    })).sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async getProject(id: string): Promise<ProjectData | undefined> {
    const db = await this.getDB();
    return db.get(STORE_NAME, id);
  },

  async deleteProject(id: string) {
    const db = await this.getDB();
    await db.delete(STORE_NAME, id);
  }
};
