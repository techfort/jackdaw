import { create } from 'zustand';
import React, { useMemo } from 'react';
import { getSharedAudioContext } from './lib/sharedAudioContext';
import { startCapture, RecordingSession } from './lib/recordingEngine';
import audioBufferToWav from 'audiobuffer-to-wav';
import { DAWState, TrackData, TimelineMode, Comment, Clip, CommentStatus, ActivityEvent, ActivityEventKind, Reply, TempoEvent } from './types';
import { serializeClip } from './lib/clipAudioUtils';
import { ConcurrentUpdateError } from './services/storage/types';
import { storageService, authService } from './services/storage';
import { parseMentions, parseTags } from './lib/mentionUtils';
import { logTelemetryEvent } from './lib/telemetry';
import { clamp } from './lib/clamp';
import { getTracksMaxTime } from './lib/clipUtils';
import { canManageFrozenTrack, FREEZE_EXEMPT_KEYS } from './lib/freezeGuard';
import { getActorInfo } from './lib/actorInfo';


interface HistoryState {
  tracks: TrackData[];
  comments: Comment[];
  tempo: number;
}

const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

let _recordSession: RecordingSession | null = null;
let _recordStartTime = 0;

export const useStore = create<DAWState>((set, get) => {
  const past: HistoryState[] = [];
  const future: HistoryState[] = [];

  const snapshotState = (): HistoryState => {
    const { tracks, comments, tempo } = get();
    return {
      tracks: tracks.map(t => ({ ...t, clips: (t.clips || []).map(c => ({ ...c })) })),
      comments: comments.map(c => ({ ...c })),
      tempo,
    };
  };

  const pushToHistory = () => {
    past.push(snapshotState());
    if (past.length > 50) past.shift();
    future.length = 0;
  };

  return {
    tracks: [],
    comments: [],
    tempo: 120,
    isPlaying: false,
    currentTime: 0,
    timelineMode: 'beats',
    snapEnabled: true,
    zoom: 100,
    followPlayhead: true,
    activeTool: 'select',
    canUndo: false,
    canRedo: false,
    commentDraft: null,
    currentSongId: null,
    currentSongName: 'Untitled Song',
    currentProjectId: null,
    currentProjectName: '',
    currentUserRole: null,
    isSyncing: false,
    remotePresences: [],
    markers: { 1: null, 2: null },
    markerLabels: { 1: '', 2: '' },
    selectedTrackId: null,
    showMixer: false,
    isSpectrumOpen: false,
    isClickEnabled: false,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    pendingWriteCount: 0,
    availableInputDevices: [],
    selectedInputDeviceId: null,
    isRecording: false,
    isMonitoring: false,
    tempoEvents: [],
    showTempoSheet: false,
    currentUser: null,
    activityEvents: [],
    seenCommentIds: [],

    addActivityEvent: (event) => {
      const id = generateId();
      const full: ActivityEvent = { id, ...event };
      logTelemetryEvent({ kind: event.kind, actor: event.actor, payload: event.payload });
      set((state) => ({
        activityEvents: [...state.activityEvents.slice(-499), full],
      }));
    },

    markCommentsSeen: (ids) => {
      set((state) => ({
        seenCommentIds: [...new Set([...state.seenCommentIds, ...ids])],
      }));
    },

    addReply: (commentId, text) => {
      const actor = getActorInfo(get().currentUser);
      const id = generateId();
      const reply: Reply = { id, commentId, text, userId: actor.userId, userName: actor.userName, createdAt: Date.now(), mentions: parseMentions(text) };
      pushToHistory();
      set((state) => ({
        comments: state.comments.map(c => c.id === commentId ? { ...c, replies: [...(c.replies || []), reply] } : c),
        canUndo: true,
      }));
      get().addActivityEvent({ kind: 'comment_added', actor, timestamp: Date.now(), payload: { commentId, replyId: id, text: text.slice(0, 100), isReply: true } });
      get().pushUpdate().catch(err => console.error('Update failed', err));
      return id;
    },

    setCurrentUser: (user) => set({ currentUser: user }),
    setSpectrumOpen: (open) => set({ isSpectrumOpen: open }),
    setClickEnabled: (enabled) => set({ isClickEnabled: enabled }),
    setOnline: (online) => set({ isOnline: online }),
    setAvailableInputDevices: (devices) => set({ availableInputDevices: devices }),
    setSelectedInputDeviceId: (deviceId) => set({ selectedInputDeviceId: deviceId }),
    toggleMonitoring: () => set((state) => ({ isMonitoring: !state.isMonitoring })),

    addTempoEvent: (event) => {
      const id = generateId();
      const full: TempoEvent = { id, ...event };
      set((state) => ({ tempoEvents: [...state.tempoEvents, full].sort((a, b) => a.time - b.time) }));
      get().pushUpdate().catch(err => console.error('Update failed', err));
    },
    updateTempoEvent: (id, updates) => {
      set((state) => ({
        tempoEvents: state.tempoEvents
          .map(e => e.id === id ? { ...e, ...updates } : e)
          .sort((a, b) => a.time - b.time),
      }));
      get().pushUpdate().catch(err => console.error('Update failed', err));
    },
    removeTempoEvent: (id) => {
      set((state) => ({ tempoEvents: state.tempoEvents.filter(e => e.id !== id) }));
      get().pushUpdate().catch(err => console.error('Update failed', err));
    },
    setShowTempoSheet: (show) => set({ showTempoSheet: show }),

    setSelectedTrackId: (id) => set({ selectedTrackId: id }),

    armTrack: (trackId, armed) => {
      set((state) => ({
        tracks: state.tracks.map(t => t.id === trackId ? { ...t, isArmed: armed } : t),
      }));
    },

    startRecording: async () => {
      const { selectedInputDeviceId, tracks, isRecording } = get();
      if (isRecording || _recordSession) return;
      if (!tracks.some(t => t.isArmed)) return;
      try {
        _recordSession = await startCapture(selectedInputDeviceId);
        _recordStartTime = get().currentTime;
        set({ isRecording: true });
      } catch (err) {
        console.error('Failed to start recording:', err);
        throw err;
      }
    },

    stopRecording: async () => {
      if (!_recordSession) return;
      const session = _recordSession;
      _recordSession = null;
      // Set isRecording false AFTER the stream fully closes so the input monitor
      // doesn't race to open a new getUserMedia while the recording stream is still
      // holding the device (which can cause two concurrent streams on one device).
      try {
        const buffer = await session.stop();
        set({ isRecording: false });
        if (buffer.duration < 0.05) return;
        const wav: ArrayBuffer = audioBufferToWav(buffer);
        const armedTracks = get().tracks.filter(t => t.isArmed);
        for (const track of armedTracks) {
          get().addRecordedClip(track.id, buffer, wav, _recordStartTime);
        }
      } catch (err) {
        set({ isRecording: false });
        console.error('Failed to stop recording:', err);
      }
    },

    addRecordedClip: (trackId, buffer, audioData, offset) => {
      pushToHistory();
      set((state) => ({
        tracks: state.tracks.map(t => {
          if (t.id !== trackId) return t;
          return {
            ...t,
            clips: [
              ...(t.clips || []),
              {
                id: generateId(),
                offset,
                duration: buffer.duration,
                audioStart: 0,
                isMuted: false,
                buffer,
                audioData,
              },
            ],
          };
        }),
        canUndo: true,
      }));
      get().pushUpdate().catch(err => console.error('Update failed', err));
    },
    clearSong: () => {
      set({ currentSongId: null, currentSongName: 'Untitled Song', tracks: [], comments: [], isPlaying: false, isSyncing: false });
    },
    setShowMixer: (show) => set({ showMixer: show }),
    setFollowPlayhead: (followPlayhead) => set({ followPlayhead }),
    setTool: (activeTool) => set({ activeTool }),
    setCommentDraft: (commentDraft) => set({ commentDraft }),

    setMarker: (index, time) => {
      set((state) => ({
        markers: { ...state.markers, [index]: time }
      }));
    },

    setMarkerLabel: (index, label) => {
      set((state) => ({
        markerLabels: { ...state.markerLabels, [index]: label }
      }));
    },

    goToMarker: (index) => {
      const time = get().markers[index];
      if (time !== null) set({ currentTime: time });
    },

    seek: (delta) => {
      set((state) => ({ currentTime: Math.max(0, state.currentTime + delta) }));
    },

    goToStart: () => set({ currentTime: 0 }),

    goToEnd: () => {
      set({ currentTime: getTracksMaxTime(get().tracks) });
    },

    loadSong: (projectState) => {
      // Migrate old data if necessary
      const tracks = (projectState.tracks || []).map((t: any) => {
        if (!t.clips || !Array.isArray(t.clips)) {
          // It's an old track format
          const offset = t.offset ?? 0;
          const duration = t.duration ?? (t.buffer?.duration || 0);
          const audioStart = t.audioStart ?? 0;
          return {
            ...t,
            clips: [{
              id: generateId(),
              offset,
              duration,
              audioStart,
              isMuted: false
            }]
          };
        }
        return t;
      });

      set((state) => ({
        ...state,
        ...projectState,
        tracks,
        currentSongId: projectState.currentSongId !== undefined ? projectState.currentSongId : state.currentSongId,
        currentSongName: projectState.currentSongName !== undefined ? projectState.currentSongName : state.currentSongName,
        currentProjectId: projectState.currentProjectId !== undefined ? projectState.currentProjectId : state.currentProjectId,
        currentProjectName: projectState.currentProjectName !== undefined ? projectState.currentProjectName : state.currentProjectName,
        currentUserRole: null,
        isPlaying: false,
        currentTime: 0,
        canUndo: false,
        canRedo: false,
      }));
      past.length = 0;
      future.length = 0;
    },

    loadProject: (...args) => get().loadSong(...args),

    syncSong: (projectId, songId) => {
      set({ isSyncing: true, currentProjectId: projectId, currentSongId: songId });

      const unsubscribeProject = (storageService as any).onSongUpdate(projectId, songId, (data: any) => {
        if (data.updatedAt > (get().lastRemoteUpdate || 0)) {
          set({
            lastRemoteUpdate: data.updatedAt,
            tempo: data.tempo,
            tempoEvents: data.tempoEvents || [],
            comments: data.comments || [],
            // Merge remote metadata while preserving per-clip buffers from local state
            tracks: get().tracks.map(localTrack => {
              const remoteTrack = data.tracks.find((t: any) => t.id === localTrack.id);
              if (!remoteTrack) return localTrack;
              const localClipsById = new Map((localTrack.clips || []).map(c => [c.id, c]));
              const mergedClips = (remoteTrack.clips || []).map((remoteClip: any) => {
                const localClip = localClipsById.get(remoteClip.id);
                return localClip
                  ? { ...remoteClip, buffer: localClip.buffer, audioData: localClip.audioData }
                  : remoteClip;
              });
              return { ...localTrack, ...remoteTrack, clips: mergedClips };
            })
          });
        }
      });

      const unsubscribePresence = (storageService as any).onPresenceUpdate(projectId, songId, (presences: any[]) => {
        const currentUser = get().currentUser;
        set({ remotePresences: presences.filter(p => p.userId !== currentUser?.id) });
      });

      return () => {
        unsubscribeProject();
        unsubscribePresence();
        set({ isSyncing: false });
      };
    },

    syncProject: (id) => get().syncSong(id, id),

    updatePresence: (cursorPosition) => {
      const { currentProjectId, currentSongId, isSyncing } = get();
      if (!isSyncing || !currentProjectId || !currentSongId) return;
      (storageService as any).updatePresence(currentProjectId, currentSongId, cursorPosition);
    },

    pushUpdate: async () => {
      const { isSyncing, currentProjectId, currentSongId, tracks, comments, tempo, tempoEvents, lastRemoteUpdate, isOnline } = get();
      if (!isSyncing || !currentProjectId || !currentSongId) return;

      if (!isOnline) {
        set(state => ({ pendingWriteCount: state.pendingWriteCount + 1 }));
        return;
      }

      const now = Date.now();
      const baseUpdatedAt = lastRemoteUpdate;
      set({ lastRemoteUpdate: now });

      try {
        await (storageService as any).saveSong(currentProjectId, currentSongId, {
          tempo,
          tempoEvents,
          comments,
          // Strip non-serialisable AudioBuffer from each clip before persisting.
          // audioData (raw bytes) is kept so FirebaseStorage can upload it.
          tracks: tracks.map((track) => ({
            ...track,
            clips: (track.clips || []).map(serializeClip),
          })),
          updatedAt: now,
          baseUpdatedAt
        });
      } catch (err) {
        if (err instanceof ConcurrentUpdateError) {
          // Another client wrote since our last sync — revert our timestamp and let syncSong pull
          set({ lastRemoteUpdate: baseUpdatedAt ?? 0 });
          console.warn('Sync conflict detected — refreshing from server');
        } else {
          console.error("Failed to push update", err);
        }
      }
    },

    punchIn: async (file) => {
      const { currentTime, tracks, pushUpdate } = get();
      
      try {
        // 1. Load the buffer
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await getSharedAudioContext().decodeAudioData(arrayBuffer);

        // 2. Create a new track for the punch-in
        const trackId = generateId();
        const newClip: Clip = {
          id: generateId(),
          offset: currentTime,
          duration: audioBuffer.duration,
          audioStart: 0,
          isMuted: false,
          buffer: audioBuffer,
          audioData: arrayBuffer,
        };

        const newTrack: TrackData = {
          id: trackId,
          name: `Punch: ${file.name.split('.')[0]}`,
          volume: 1,
          isMuted: false,
          isSoloed: false,
          createdAt: Date.now(),
          clips: [newClip]
        };

        set({ 
          tracks: [...tracks, newTrack],
          canUndo: true
        });
        
        await pushUpdate();
      } catch (error) {
        console.error("Failed to punch in audio:", error);
      }
    },

    undo: () => {
      if (past.length === 0) return;
      future.push(snapshotState());
      const previous = past.pop()!;
      set({ ...previous, canUndo: past.length > 0, canRedo: true });
    },

    redo: () => {
      if (future.length === 0) return;
      past.push(snapshotState());
      const next = future.pop()!;
      set({ ...next, canUndo: true, canRedo: future.length > 0 });
    },

    addTrack: (buffer, name, audioData, offset = 0) => {
      const ownerId = get().currentUser?.id || 'anonymous';
      pushToHistory();
      set((state) => ({
        tracks: [...state.tracks, {
          id: generateId(),
          name,
          volume: 0.8,
          isMuted: false,
          isSoloed: false,
          isFrozen: false,
          ownerId,
          createdAt: Date.now(),
          clips: [{
            id: generateId(),
            offset,
            duration: buffer.duration,
            audioStart: 0,
            isMuted: false,
            buffer,
            audioData,
          }],
        }],
        canUndo: true
      }));
      const u = get().currentUser;
      get().addActivityEvent({ kind: 'track_added', actor: getActorInfo(u), timestamp: Date.now(), payload: { trackName: name } });
      get().pushUpdate().catch(err => console.error("Update failed", err));
    },

    addEmptyTrack: (name) => {
      const trimmedName = (name || '').trim() || `Track ${get().tracks.length + 1}`;
      const newTrackId = generateId();
      const ownerId = get().currentUser?.id || 'anonymous';
      pushToHistory();
      set((state) => ({
        tracks: [...state.tracks, {
          id: newTrackId,
          name: trimmedName,
          volume: 0.8,
          isMuted: false,
          isSoloed: false,
          isFrozen: false,
          ownerId,
          createdAt: Date.now(),
          clips: [],
        }],
        canUndo: true
      }));
      const u = get().currentUser;
      get().addActivityEvent({ kind: 'track_added', actor: getActorInfo(u), timestamp: Date.now(), payload: { trackName: trimmedName } });
      get().pushUpdate().catch(err => console.error("Update failed", err));
      return newTrackId;
    },

    splitTrack: (trackId, timelineTime) => {
      const { currentUser, currentUserRole } = get();
      const frozen = get().tracks.find(t => t.id === trackId);
      if (frozen?.isFrozen && !canManageFrozenTrack(frozen, currentUser, currentUserRole)) return;
      pushToHistory();
      set((state) => {
        const track = state.tracks.find(t => t.id === trackId);
        if (!track) return { tracks: state.tracks };

        // Find which clip contains the split point
        const clipIndex = (track.clips || []).findIndex(c => 
          timelineTime > c.offset && timelineTime < c.offset + c.duration
        );

        if (clipIndex === -1 || !track.clips) return { tracks: state.tracks };

        const clip = track.clips[clipIndex];
        const relativeSplitTime = timelineTime - clip.offset;

        const firstHalf = {
          ...clip,
          duration: relativeSplitTime,
        };

        const secondHalf = {
          ...clip,
          id: generateId(),
          offset: clip.offset + relativeSplitTime,
          audioStart: clip.audioStart + relativeSplitTime,
          duration: clip.duration - relativeSplitTime,
        };

        const newClips = [...track.clips];
        newClips.splice(clipIndex, 1, firstHalf, secondHalf);

        return {
          tracks: state.tracks.map(t => t.id === trackId ? { ...t, clips: newClips } : t),
          canUndo: true
        };
      });
      get().pushUpdate().catch(err => console.error("Update failed", err));
    },

    toggleFreezeTrack: (id) => {
      const { currentUser, currentUserRole } = get();
      const track = get().tracks.find(t => t.id === id);
      if (!track) return;
      if (!canManageFrozenTrack(track, currentUser, currentUserRole)) return;
      const nowFrozen = !track.isFrozen;
      get().updateTrack(id, { isFrozen: nowFrozen });
      const u = currentUser;
      get().addActivityEvent({
        kind: nowFrozen ? 'track_frozen' : 'track_unfrozen',
        actor: getActorInfo(u),
        timestamp: Date.now(),
        payload: { trackId: id, trackName: track.name },
      });
    },

    removeTrack: (id) => {
      const { currentUser, currentUserRole } = get();
      const track = get().tracks.find(t => t.id === id);
      if (track?.isFrozen && !canManageFrozenTrack(track, currentUser, currentUserRole)) return;
      const trackName = track?.name;
      pushToHistory();
      set((state) => ({
        tracks: state.tracks.filter(t => t.id !== id),
        comments: state.comments.filter(c => c.trackId !== id),
        canUndo: true
      }));
      const u = get().currentUser;
      get().addActivityEvent({ kind: 'track_removed', actor: getActorInfo(u), timestamp: Date.now(), payload: { trackId: id, trackName: trackName || '' } });
      get().pushUpdate().catch(err => console.error("Update failed", err));
    },

    saveTake: (trackId) => {
      pushToHistory();
      set((state) => ({
        tracks: state.tracks.map(t => {
          if (t.id !== trackId) return t;
          const snapshot = (t.clips || []).map(c => ({ ...c }));
          return { ...t, takes: [...(t.takes || []), snapshot], canUndo: true };
        }),
        canUndo: true,
      }));
      get().pushUpdate().catch(err => console.error('Update failed', err));
    },

    restoreTake: (trackId, takeIndex) => {
      const track = get().tracks.find(t => t.id === trackId);
      if (!track || !track.takes?.[takeIndex]) return;
      pushToHistory();
      const restoredClips = track.takes[takeIndex].map(c => ({ ...c }));
      set((state) => ({
        tracks: state.tracks.map(t => t.id === trackId ? { ...t, clips: restoredClips } : t),
        canUndo: true,
      }));
      get().pushUpdate().catch(err => console.error('Update failed', err));
    },

    deleteTake: (trackId, takeIndex) => {
      pushToHistory();
      set((state) => ({
        tracks: state.tracks.map(t => {
          if (t.id !== trackId) return t;
          const next = (t.takes || []).filter((_, i) => i !== takeIndex);
          return { ...t, takes: next };
        }),
        canUndo: true,
      }));
      get().pushUpdate().catch(err => console.error('Update failed', err));
    },

    updateTrack: (id, updates, silent = false) => {
      const { currentUser, currentUserRole } = get();
      const track = get().tracks.find(t => t.id === id);
      if (track?.isFrozen) {
        const hasRestrictedKeys = Object.keys(updates).some(k => !FREEZE_EXEMPT_KEYS.has(k));
        if (hasRestrictedKeys && !canManageFrozenTrack(track, currentUser, currentUserRole)) return;
      }
      if (!silent) pushToHistory();
      set((state) => ({
        tracks: state.tracks.map(t => t.id === id ? { ...t, ...updates } : t),
        canUndo: !silent || state.canUndo
      }));
      if (!silent) get().pushUpdate().catch(err => console.error("Update failed", err));
    },

    updateClip: (trackId, clipId, updates, silent = false) => {
      const { currentUser, currentUserRole } = get();
      const track = get().tracks.find(t => t.id === trackId);
      if (track?.isFrozen && !canManageFrozenTrack(track, currentUser, currentUserRole)) return;
      if (!silent) pushToHistory();
      set((state) => ({
        tracks: state.tracks.map(t => {
          if (t.id !== trackId) return t;
          return {
            ...t,
            clips: (t.clips || []).map(c => c.id === clipId ? { ...c, ...updates } : c)
          };
        }),
        canUndo: !silent || state.canUndo
      }));
      if (!silent) get().pushUpdate().catch(err => console.error("Update failed", err));
    },

    removeClip: (trackId, clipId) => {
      const { currentUser, currentUserRole } = get();
      const track = get().tracks.find(t => t.id === trackId);
      if (track?.isFrozen && !canManageFrozenTrack(track, currentUser, currentUserRole)) return;
      pushToHistory();
      set((state) => ({
        tracks: state.tracks.map(t => {
          if (t.id !== trackId) return t;
          return {
            ...t,
            clips: (t.clips || []).filter(c => c.id !== clipId)
          };
        }),
        canUndo: true
      }));
      get().pushUpdate().catch(err => console.error("Update failed", err));
    },

    addComment: (trackId, timestamp, text) => {
      pushToHistory();
      const actor = getActorInfo(get().currentUser);
      const existingIds = get().comments.map(c => c.id);
      const maxNumericId = existingIds.reduce((max, id) => {
        const parsed = Number(id);
        return Number.isInteger(parsed) ? Math.max(max, parsed) : max;
      }, 0);
      let nextCommentId = String(maxNumericId + 1);
      while (existingIds.includes(nextCommentId)) {
        nextCommentId = String(Number(nextCommentId) + 1);
      }

      set((state) => ({
        comments: [...state.comments, {
          id: nextCommentId,
          trackId,
          timestamp,
          text,
          userId: actor.userId,
          userName: actor.userName,
          status: 'open' as const,
          createdAt: Date.now(),
          mentions: parseMentions(text),
          tags: parseTags(text)
        }],
        canUndo: true
      }));
      get().addActivityEvent({ kind: 'comment_added', actor, timestamp: Date.now(), payload: { commentId: nextCommentId, trackId, text: text.slice(0, 100), mentions: parseMentions(text), tags: parseTags(text) } });
      get().pushUpdate().catch(err => console.error("Update failed", err));
      return nextCommentId;
    },

    toggleResolveComment: (id) => {
      const prevStatus = get().comments.find(c => c.id === id)?.status;
      pushToHistory();
      set((state) => ({
        comments: state.comments.map(c => c.id === id ? { ...c, status: c.status === 'approved' ? 'open' : 'approved' } : c),
        canUndo: true
      }));
      const newStatus = get().comments.find(c => c.id === id)?.status;
      const u = get().currentUser;
      const kind: ActivityEventKind = newStatus === 'approved' ? 'comment_resolved' : 'comment_reopened';
      get().addActivityEvent({ kind, actor: getActorInfo(u), timestamp: Date.now(), payload: { commentId: id, from: prevStatus, to: newStatus } });
      get().pushUpdate().catch(err => console.error("Update failed", err));
    },

    setCommentStatus: (id, status) => {
      const prevStatus = get().comments.find(c => c.id === id)?.status;
      pushToHistory();
      set((state) => ({
        comments: state.comments.map(c => c.id === id ? { ...c, status } : c),
        canUndo: true
      }));
      const u = get().currentUser;
      const kind: ActivityEventKind = status === 'approved' ? 'comment_resolved' : prevStatus === 'approved' ? 'comment_reopened' : 'comment_status_changed';
      get().addActivityEvent({ kind, actor: getActorInfo(u), timestamp: Date.now(), payload: { commentId: id, from: prevStatus, to: status } });
      get().pushUpdate().catch(err => console.error("Update failed", err));
    },

    resolveComments: (ids) => {
      pushToHistory();
      const idSet = new Set(ids);
      set((state) => ({
        comments: state.comments.map(c => idSet.has(c.id) ? { ...c, status: 'approved' as const } : c),
        canUndo: true
      }));
      const u = get().currentUser;
      get().addActivityEvent({ kind: 'comment_resolved', actor: getActorInfo(u), timestamp: Date.now(), payload: { commentIds: ids, count: ids.length } });
      get().pushUpdate().catch(err => console.error("Update failed", err));
    },

    removeComment: (id) => {
      pushToHistory();
      set((state) => ({
        comments: state.comments.filter(c => c.id !== id),
        canUndo: true
      }));
      get().pushUpdate().catch(err => console.error("Update failed", err));
    },

    setZoom: (zoom) => set({ zoom: isNaN(zoom) ? 100 : clamp(zoom, 0.5, 500) }),
    setTempo: (tempo) => {
      const val = Number(tempo);
      if (isNaN(val)) return;
      pushToHistory();
      const safeTempo = clamp(val, 20, 300);
      set({ tempo: safeTempo, canUndo: true });
      get().pushUpdate().catch(err => console.error("Update failed", err));
    },
    setTimelineMode: (mode) => set({ timelineMode: mode }),
    setSnapEnabled: (enabled) => set({ snapEnabled: enabled }),
    setCurrentTime: (time) => set({ currentTime: isNaN(time) ? 0 : Math.max(0, time) }),
    setIsPlaying: (playing) => set({ isPlaying: playing }),
  };
});

export const useProjectDuration = () => {
  const tracks = useStore(state => state.tracks);
  const currentTime = useStore(state => state.currentTime);
  return useMemo(() => {
    const max = getTracksMaxTime(tracks);
    const safeCurrentTime = Number(currentTime) || 0;
    return Math.max(max + 10, safeCurrentTime + 10, 60);
  }, [tracks, currentTime]);
};
