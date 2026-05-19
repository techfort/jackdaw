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
import { StorageService, ProjectData, Presence } from './types';

export class FirebaseStorageService implements StorageService {
  async getProject(id: string): Promise<ProjectData | null> {
    try {
      const snap = await getDoc(doc(db, 'projects', id));
      if (!snap.exists()) return null;
      return snap.data() as ProjectData;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `projects/${id}`);
      return null;
    }
  }

  async saveProject(id: string, data: Partial<ProjectData>): Promise<void> {
    try {
      await updateDoc(doc(db, 'projects', id), {
        ...data,
        updatedAt: Date.now()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `projects/${id}`);
    }
  }

  onProjectUpdate(id: string, callback: (data: ProjectData) => void): () => void {
    return onSnapshot(doc(db, 'projects', id), (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.data() as ProjectData);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `projects/${id}`);
    });
  }

  async updatePresence(projectId: string, cursorPosition: number): Promise<void> {
    if (!auth.currentUser) return;
    const presenceId = auth.currentUser.uid;
    try {
      await setDoc(doc(db, 'presence', presenceId), {
        userId: presenceId,
        userName: auth.currentUser.displayName || `Collaborator ${presenceId.slice(0, 4)}`,
        projectId,
        cursorPosition,
        lastActive: Date.now()
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `presence/${presenceId}`);
    }
  }

  onPresenceUpdate(projectId: string, callback: (presences: Presence[]) => void): () => void {
    return onSnapshot(
      query(collection(db, 'presence'), where('projectId', '==', projectId)),
      (snapshot) => {
        const presences = snapshot.docs.map(d => d.data() as Presence);
        callback(presences);
      }
    );
  }

  async listProjects(): Promise<{ id: string; name: string; updatedAt: number }[]> {
    // In a real app, this would query a user_projects collection
    // For now, we'll return empty or mock until the user needs a dashboard
    return [];
  }

  async deleteProject(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'projects', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `projects/${id}`);
    }
  }
}
