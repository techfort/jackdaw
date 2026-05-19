import {
  doc,
  updateDoc,
  onSnapshot,
  setDoc,
  collection,
  query,
  where,
  deleteDoc,
  getDoc
} from 'firebase/firestore';
import { db, auth, OperationType, handleFirestoreError } from '../firebaseService';
import { StorageService, SongData, Presence, Project, Member, Invite, Role } from './types';

export class FirebaseStorageService implements StorageService {
  // Song ops — TODO: Phase C (full implementation)
  async getSong(projectId: string, songId: string): Promise<SongData | null> {
    try {
      const snap = await getDoc(doc(db, 'projects', projectId, 'songs', songId));
      if (!snap.exists()) return null;
      return snap.data() as SongData;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `projects/${projectId}/songs/${songId}`);
      return null;
    }
  }

  async saveSong(projectId: string, songId: string, data: Partial<SongData>): Promise<void> {
    try {
      await updateDoc(doc(db, 'projects', projectId, 'songs', songId), {
        ...data,
        updatedAt: Date.now()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `projects/${projectId}/songs/${songId}`);
    }
  }

  onSongUpdate(projectId: string, songId: string, callback: (data: SongData) => void): () => void {
    return onSnapshot(doc(db, 'projects', projectId, 'songs', songId), (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.data() as SongData);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `projects/${projectId}/songs/${songId}`);
    });
  }

  async listSongs(projectId: string): Promise<{ id: string; name: string; updatedAt: number }[]> {
    // TODO: Phase C
    return [];
  }

  async deleteSong(projectId: string, songId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'projects', projectId, 'songs', songId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `projects/${projectId}/songs/${songId}`);
    }
  }

  // Project ops — TODO: Phase C (full implementation)
  async createProject(name: string): Promise<Project> {
    // TODO: Phase C
    throw new Error('TODO: Phase C');
  }

  async getProject(id: string): Promise<Project | null> {
    // TODO: Phase C
    return null;
  }

  async listUserProjects(): Promise<Project[]> {
    // TODO: Phase C
    return [];
  }

  async deleteProject(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'projects', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `projects/${id}`);
    }
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
    if (!auth.currentUser) return;
    const presenceId = auth.currentUser.uid;
    try {
      await setDoc(doc(db, 'presence', presenceId), {
        userId: presenceId,
        userName: auth.currentUser.displayName || `Collaborator ${presenceId.slice(0, 4)}`,
        projectId,
        songId,
        cursorPosition,
        lastActive: Date.now()
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `presence/${presenceId}`);
    }
  }

  onPresenceUpdate(projectId: string, songId: string, callback: (presences: Presence[]) => void): () => void {
    return onSnapshot(
      query(collection(db, 'presence'), where('projectId', '==', projectId), where('songId', '==', songId)),
      (snapshot) => {
        const presences = snapshot.docs.map(d => d.data() as Presence);
        callback(presences);
      }
    );
  }
}
