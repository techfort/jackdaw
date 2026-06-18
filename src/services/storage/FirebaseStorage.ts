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
  getDocs,
  runTransaction
} from 'firebase/firestore';
import { sendSignInLinkToEmail } from 'firebase/auth';
import { db, auth, OperationType, handleFirestoreError, trackFirestoreRead, trackFirestoreWrite } from '../firebaseService';
import { StorageService, SongData, Presence, Project, Member, Invite, Role, ConcurrentUpdateError } from './types';
import { createAudioStorage } from '../audioStorage';

const generateId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 15);

export class FirebaseStorageService implements StorageService {
  private getUserKey(): string | null {
    return auth.currentUser?.email || auth.currentUser?.uid || null;
  }

  private async hydrateProjectOwnerName(project: Project): Promise<Project> {
    if (project.ownerName) return project;

    try {
      const ownerSnap = await getDoc(doc(db, 'users', project.ownerId));
      if (ownerSnap.exists()) {
        const ownerData = ownerSnap.data() as { name?: string; email?: string };
        return {
          ...project,
          ownerName: ownerData.name || ownerData.email?.split('@')[0] || project.ownerId
        };
      }
    } catch {
      // Ignore owner enrichment failures and fall back to project data.
    }

    if (auth.currentUser && project.ownerId === (auth.currentUser.email || auth.currentUser.uid)) {
      return {
        ...project,
        ownerName: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || project.ownerId
      };
    }

    return project;
  }

  // ── Song ops ──────────────────────────────────────────────────────────────

  async getSong(projectId: string, songId: string): Promise<SongData | null> {
    try {
      trackFirestoreRead(`projects/${projectId}/songs/${songId}`);
      const snap = await getDoc(doc(db, 'projects', projectId, 'songs', songId));
      if (!snap.exists()) return null;
      const song = snap.data() as SongData;

      // Restore per-clip audio: IDB cache (by clipId) → Firebase Storage URL.
      // Falls back to track-level cache/storagePath for legacy songs.
      const { LocalStorageService } = await import('./LocalStorage');
      const localCache = new LocalStorageService();

      const fetchAudio = async (url: string): Promise<ArrayBuffer | null> => {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.arrayBuffer();
        } catch (e) {
          console.warn(`Failed to fetch audio from ${url}:`, e);
          return null;
        }
      };

      const tracksWithAudio = await Promise.all(
        (song.tracks || []).map(async (track: any) => {
          // Legacy: if track still carries audioData directly, leave it for loadSong migration
          const legacyAudio: ArrayBuffer | null =
            track.audioData ??
            (await localCache.getCachedAudio(track.id)) ??
            (track.storagePath ? await fetchAudio(track.storagePath) : null);

          const clipsWithAudio = await Promise.all(
            (track.clips || []).map(async (clip: any) => {
              if (clip.audioData) return clip;
              const cached = await localCache.getCachedAudio(clip.id);
              if (cached) return { ...clip, audioData: cached };
              if (clip.storagePath) {
                const audioData = await fetchAudio(clip.storagePath);
                if (audioData) {
                  await localCache.cacheAudio(clip.id, audioData);
                  return { ...clip, audioData };
                }
              }
              // Fall back to legacy track-level audio for old songs
              if (legacyAudio) return { ...clip, audioData: legacyAudio };
              if (clip.id) console.warn(`No audio found for clip ${clip.id} (no IDB cache, no storagePath). Clip will render without waveform.`);
              return clip;
            })
          );

          const { audioData: _legacyAudioData, storagePath: _legacyPath, ...trackRest } = track;
          return { ...trackRest, clips: clipsWithAudio };
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

      // Upload per-clip audio and cache locally.
      const { LocalStorageService } = await import('./LocalStorage');
      const localCache = new LocalStorageService();

      const tracksWithPaths = await Promise.all(
        tracks.map(async (track: any) => {
          const clipsWithPaths = await Promise.all(
            (track.clips || []).map(async (clip: any) => {
              if (clip.audioData) {
                await localCache.cacheAudio(clip.id, clip.audioData).catch(() => {});
                if (!clip.storagePath) {
                  try {
                    const key = `projects/${projectId}/songs/${songId}/clips/${clip.id}.mp3`;
                    const url = await audioStorage.upload(key, clip.audioData, 'audio/mpeg');
                    if (url) return { ...clip, storagePath: url };
                    console.error(`Audio upload returned empty URL for clip ${clip.id} — storage may not be configured. Audio will only be available from local IDB cache.`);
                  } catch (uploadErr) {
                    console.error(`Failed to upload audio for clip ${clip.id}:`, uploadErr);
                  }
                }
              }
              return clip;
            })
          );
          return { ...track, clips: clipsWithPaths };
        })
      );

      // Strip non-serialisable fields before writing to Firestore
      const { baseUpdatedAt, ...dataWithoutBase } = data as any;
      const firestoreTracks = tracksWithPaths.map(({ ...track }: any) => ({
        ...track,
        clips: (track.clips || []).map(({ buffer: _buf, audioData: _ad, ...clip }: any) => clip),
      }));
      const songRef = doc(db, 'projects', projectId, 'songs', songId);
      // Use the updatedAt already computed by pushUpdate (which also set lastRemoteUpdate to
      // the same value). Re-calling Date.now() here produces a timestamp AFTER the audio
      // upload delay, making the Firestore doc newer than lastRemoteUpdate and causing every
      // subsequent onSongUpdate to trigger a false "Sync conflict".
      const updatedAt = (dataWithoutBase as any).updatedAt ?? Date.now();
      const payload = { ...dataWithoutBase, tracks: firestoreTracks, updatedAt };
      trackFirestoreWrite(`projects/${projectId}/songs/${songId}`);

      if (typeof baseUpdatedAt === 'number') {
        // Optimistic concurrency: reject if server has been updated since our last sync
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(songRef);
          if (snap.exists()) {
            const serverUpdatedAt: number = snap.data().updatedAt ?? 0;
            if (serverUpdatedAt > baseUpdatedAt) {
              throw new ConcurrentUpdateError(serverUpdatedAt);
            }
          }
          tx.set(songRef, payload, { merge: true });
        });
      } else {
        await setDoc(songRef, payload, { merge: true });
      }
    } catch (err) {
      if (err instanceof ConcurrentUpdateError) throw err;
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
    const userId = this.getUserKey() || auth.currentUser.uid;
    const now = Date.now();

    const project: Project = {
      id,
      name,
      ownerId: userId,
      ownerName: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || `User ${userId.slice(0, 4)}`,
      createdAt: now,
      updatedAt: now
    };

    await setDoc(doc(db, 'projects', id), project);

    await setDoc(doc(db, 'projects', id, 'members', userId), {
      userId,
      role: 'owner',
      name: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || `User ${userId.slice(0, 4)}`,
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
      return this.hydrateProjectOwnerName(snap.data() as Project);
    } catch (err: any) {
      if (err?.code === 'permission-denied') return null;
      handleFirestoreError(err, OperationType.GET, `projects/${id}`);
      return null;
    }
  }

  async listUserProjects(): Promise<Project[]> {
    if (!auth.currentUser) return [];
    try {
      const primaryUserId = this.getUserKey() || auth.currentUser.uid;
      const fallbackUserId = auth.currentUser.uid;
      const userIds = primaryUserId === fallbackUserId ? [primaryUserId] : [primaryUserId, fallbackUserId];

      const mirrors = await Promise.all(
        userIds.map(userId => getDocs(collection(db, 'userProjects', userId, 'projects')))
      );

      const mirrorProjectIds = new Set<string>();
      mirrors.flatMap(snap => snap.docs).forEach(docSnap => {
        const projectId = docSnap.data().projectId as string;
        if (projectId) mirrorProjectIds.add(projectId);
      });

      if (mirrorProjectIds.size > 0) {
        const projects = await Promise.all(Array.from(mirrorProjectIds).map(projectId => this.getProject(projectId)));
        return projects.filter((p): p is Project => p !== null);
      }

      // Fallback for legacy data: list owned projects directly when mirrors are missing.
      const ownedQuery = userIds.length > 1
        ? query(collection(db, 'projects'), where('ownerId', 'in', userIds))
        : query(collection(db, 'projects'), where('ownerId', '==', userIds[0]));
      const ownedSnap = await getDocs(ownedQuery);
      const ownedProjects = await Promise.all(ownedSnap.docs.map(async d => this.hydrateProjectOwnerName(d.data() as Project)));

      // Backfill userProjects mirrors so future reads are fast and consistent.
      await Promise.all(
        ownedProjects.map(project => setDoc(
          doc(db, 'userProjects', primaryUserId, 'projects', project.id),
          {
            projectId: project.id,
            name: project.name,
            role: 'owner',
            joinedAt: project.createdAt || Date.now()
          },
          { merge: true }
        ))
      );

      return ownedProjects;
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
    const userId = this.getUserKey() || auth.currentUser.uid;
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
      name: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || `User ${userId.slice(0, 4)}`,
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
    const userId = auth.currentUser.email || presenceId;
    try {
      await setDoc(doc(db, 'presence', presenceId), {
        userId,
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
