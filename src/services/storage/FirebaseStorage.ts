import {
  doc,
  updateDoc,
  onSnapshot,
  setDoc,
  collection,
  query,
  where,
  deleteDoc,
  getDoc,
  getDocs
} from 'firebase/firestore';
import { sendSignInLinkToEmail } from 'firebase/auth';
import { db, auth, OperationType, handleFirestoreError } from '../firebaseService';
import { StorageService, SongData, Presence, Project, Member, Invite, Role } from './types';
import { createAudioStorage } from '../audioStorage';

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 15);

export class FirebaseStorageService implements StorageService {
  // ── Song ops ──────────────────────────────────────────────────────────────

  async getSong(projectId: string, songId: string): Promise<SongData | null> {
    try {
      const snap = await getDoc(doc(db, 'projects', projectId, 'songs', songId));
      if (!snap.exists()) return null;
      const song = snap.data() as SongData;

      // Fetch audio for any track that has a storagePath but no local audioData
      const { LocalStorageService } = await import('./LocalStorage');
      const localCache = new LocalStorageService();

      const tracksWithAudio = await Promise.all(
        (song.tracks || []).map(async (track: any) => {
          if (track.storagePath && !track.audioData) {
            const cached = await localCache.getCachedAudio(track.id);
            if (cached) {
              return { ...track, audioData: cached };
            }
            try {
              const response = await fetch(track.storagePath);
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const audioData = await response.arrayBuffer();
              await localCache.cacheAudio(track.id, audioData);
              return { ...track, audioData };
            } catch (fetchErr) {
              console.warn(`Failed to fetch audio for track ${track.id}:`, fetchErr);
            }
          }
          return track;
        })
      );

      return { ...song, tracks: tracksWithAudio };
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `projects/${projectId}/songs/${songId}`);
      return null;
    }
  }

  async saveSong(projectId: string, songId: string, data: Partial<SongData>): Promise<void> {
    try {
      const audioStorage = createAudioStorage(async () => {
        const token = await auth.currentUser?.getIdToken();
        return token ?? '';
      });
      const tracks = (data.tracks || []) as any[];

      // Upload audio for any track that has audioData but no storagePath yet
      const tracksWithPaths = await Promise.all(
        tracks.map(async (track) => {
          if (track.audioData && !track.storagePath) {
            try {
              const key = `projects/${projectId}/songs/${songId}/tracks/${track.id}.mp3`;
              const url = await audioStorage.upload(key, track.audioData, 'audio/mpeg');
              if (url) return { ...track, storagePath: url };
            } catch (uploadErr) {
              console.warn(`Failed to upload audio for track ${track.id}:`, uploadErr);
            }
            return track;
          }
          return track;
        })
      );

      // Strip non-serialisable fields before writing to Firestore
      const firestoreTracks = tracksWithPaths.map(({ buffer, audioData, ...rest }: any) => rest);

      await setDoc(doc(db, 'projects', projectId, 'songs', songId), {
        ...data,
        tracks: firestoreTracks,
        updatedAt: Date.now()
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `projects/${projectId}/songs/${songId}`);
    }
  }

  onSongUpdate(projectId: string, songId: string, callback: (data: SongData) => void): () => void {
    return onSnapshot(
      doc(db, 'projects', projectId, 'songs', songId),
      (snapshot) => {
        if (snapshot.exists()) callback(snapshot.data() as SongData);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `projects/${projectId}/songs/${songId}`);
      }
    );
  }

  async listSongs(projectId: string): Promise<{ id: string; name: string; updatedAt: number }[]> {
    try {
      const snap = await getDocs(collection(db, 'projects', projectId, 'songs'));
      return snap.docs
        .map(d => ({
          id: d.id,
          name: (d.data().name as string) || 'Untitled',
          updatedAt: (d.data().updatedAt as number) || 0
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `projects/${projectId}/songs`);
      return [];
    }
  }

  async deleteSong(projectId: string, songId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'projects', projectId, 'songs', songId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `projects/${projectId}/songs/${songId}`);
    }
  }

  // ── Project ops ───────────────────────────────────────────────────────────

  async createProject(name: string): Promise<Project> {
    if (!auth.currentUser) throw new Error('Must be signed in to create a project');
    const id = generateId();
    const userId = auth.currentUser.uid;
    const now = Date.now();

    const project: Project = { id, name, ownerId: userId, createdAt: now, updatedAt: now };

    await setDoc(doc(db, 'projects', id), project);

    await setDoc(doc(db, 'projects', id, 'members', userId), {
      userId,
      role: 'owner',
      name: auth.currentUser.displayName || `User ${userId.slice(0, 4)}`,
      joinedAt: now
    } as Member);

    await setDoc(doc(db, 'userProjects', userId, 'projects', id), {
      projectId: id,
      name,
      role: 'owner',
      joinedAt: now
    });

    return project;
  }

  async getProject(id: string): Promise<Project | null> {
    try {
      const snap = await getDoc(doc(db, 'projects', id));
      if (!snap.exists()) return null;
      return snap.data() as Project;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `projects/${id}`);
      return null;
    }
  }

  async listUserProjects(): Promise<Project[]> {
    if (!auth.currentUser) return [];
    try {
      const userId = auth.currentUser.uid;
      const mirrors = await getDocs(collection(db, 'userProjects', userId, 'projects'));
      const projects = await Promise.all(
        mirrors.docs.map(m => this.getProject(m.data().projectId as string))
      );
      return projects.filter((p): p is Project => p !== null);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'userProjects');
      return [];
    }
  }

  async deleteProject(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'projects', id));
      if (auth.currentUser) {
        await deleteDoc(doc(db, 'userProjects', auth.currentUser.uid, 'projects', id));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `projects/${id}`);
    }
  }

  async updateProject(id: string, data: Partial<Project>): Promise<void> {
    try {
      await updateDoc(doc(db, 'projects', id), { ...data, updatedAt: Date.now() });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `projects/${id}`);
    }
  }

  // ── Members ───────────────────────────────────────────────────────────────

  async getMembers(projectId: string): Promise<Member[]> {
    try {
      const snap = await getDocs(collection(db, 'projects', projectId, 'members'));
      return snap.docs.map(d => d.data() as Member);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `projects/${projectId}/members`);
      return [];
    }
  }

  // ── Invites ───────────────────────────────────────────────────────────────

  async inviteToProject(projectId: string, email: string, role: Role): Promise<Invite> {
    if (!auth.currentUser) throw new Error('Must be signed in to invite');
    const inviteId = generateId();
    const now = Date.now();

    const invite: Invite = {
      id: inviteId,
      email,
      role,
      createdBy: auth.currentUser.uid,
      createdAt: now,
      expiresAt: now + 7 * 24 * 60 * 60 * 1000, // 7 days
      status: 'pending'
    };

    await setDoc(doc(db, 'projects', projectId, 'invites', inviteId), invite);

    const callbackUrl = `${window.location.origin}?invite=${inviteId}&project=${projectId}`;
    await sendSignInLinkToEmail(auth, email, {
      url: callbackUrl,
      handleCodeInApp: true
    });

    return invite;
  }

  async listInvites(projectId: string): Promise<Invite[]> {
    try {
      const snap = await getDocs(collection(db, 'projects', projectId, 'invites'));
      return snap.docs.map(d => d.data() as Invite);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `projects/${projectId}/invites`);
      return [];
    }
  }

  async acceptInvite(inviteId: string, projectId: string): Promise<void> {
    if (!auth.currentUser) throw new Error('Must be signed in to accept invite');
    const userId = auth.currentUser.uid;
    const userEmail = auth.currentUser.email;

    const inviteSnap = await getDoc(doc(db, 'projects', projectId, 'invites', inviteId));
    if (!inviteSnap.exists()) throw new Error('Invite not found');
    const invite = inviteSnap.data() as Invite;

    if (invite.status !== 'pending') throw new Error('Invite is no longer pending');
    if (Date.now() > invite.expiresAt) throw new Error('Invite has expired');
    if (userEmail && invite.email.toLowerCase() !== userEmail.toLowerCase()) {
      throw new Error('Invite email does not match your account');
    }

    const now = Date.now();

    await setDoc(doc(db, 'projects', projectId, 'members', userId), {
      userId,
      role: invite.role,
      name: auth.currentUser.displayName || `User ${userId.slice(0, 4)}`,
      joinedAt: now
    } as Member);

    const projSnap = await getDoc(doc(db, 'projects', projectId));
    const projName = projSnap.exists() ? (projSnap.data().name as string) : '';
    await setDoc(doc(db, 'userProjects', userId, 'projects', projectId), {
      projectId,
      name: projName,
      role: invite.role,
      joinedAt: now
    });

    await updateDoc(doc(db, 'projects', projectId, 'invites', inviteId), { status: 'accepted' });
  }

  async revokeInvite(projectId: string, inviteId: string): Promise<void> {
    try {
      await updateDoc(doc(db, 'projects', projectId, 'invites', inviteId), { status: 'expired' });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `projects/${projectId}/invites/${inviteId}`);
    }
  }

  // ── Presence ──────────────────────────────────────────────────────────────

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
      } as Presence, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `presence/${presenceId}`);
    }
  }

  onPresenceUpdate(projectId: string, songId: string, callback: (presences: Presence[]) => void): () => void {
    return onSnapshot(
      query(
        collection(db, 'presence'),
        where('projectId', '==', projectId),
        where('songId', '==', songId)
      ),
      (snapshot) => {
        callback(snapshot.docs.map(d => d.data() as Presence));
      }
    );
  }
}
