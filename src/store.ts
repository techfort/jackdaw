import { create } from 'zustand';
import React, { useMemo } from 'react';
import { getSharedAudioContext } from './lib/sharedAudioContext';
import { DAWState, TrackData, TimelineMode, Comment, Clip, CommentStatus } from './types';
import { ConcurrentUpdateError } from './services/storage/types';
import { storageService, authService } from './services/storage';
import { parseMentions, parseTags } from './lib/mentionUtils';


interface HistoryState {
  tracks: TrackData[];
  comments: Comment[];
  tempo: number;
}

const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

export const useStore = create<DAWState>((set, get) => {
  const past: HistoryState[] = [];
  const future: HistoryState[] = [];

  const pushToHistory = () => {
    const { tracks, comments, tempo } = get();
    past.push({ 
      // Deep clone where necessary (tracks and comments are arrays of objects)
      tracks: tracks.map(t => ({ 
        ...t, 
        clips: (t.clips || []).map(c => ({ ...c })) 
      })),
      comments: comments.map(c => ({ ...c })),
      tempo 
    });
    // Cap history
    if (past.length > 50) past.shift();
    future.length = 0; // Clear redo stack on new action
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
    currentUser: null,

    setCurrentUser: (user) => set({ currentUser: user }),
    setSpectrumOpen: (open) => set({ isSpectrumOpen: open }),
    setClickEnabled: (enabled) => set({ isClickEnabled: enabled }),
    setSelectedTrackId: (id) => set({ selectedTrackId: id }),
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
      const { tracks } = get();
      let maxTime = 0;
      tracks.forEach(track => {
        (track.clips || []).forEach(clip => {
          const off = Number(clip.offset) || 0;
          const dur = Number(clip.duration) || 0;
          if (!isNaN(off) && !isNaN(dur)) {
            maxTime = Math.max(maxTime, off + dur);
          }
        });
      });
      set({ currentTime: Math.max(0, maxTime) });
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
            comments: data.comments || [],
            // Only update track metadata, keep buffers
            tracks: get().tracks.map(localTrack => {
              const remoteTrack = data.tracks.find((t: any) => t.id === localTrack.id);
              if (remoteTrack) {
                return { ...localTrack, ...remoteTrack };
              }
              return localTrack;
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
      const { isSyncing, currentProjectId, currentSongId, tracks, comments, tempo, lastRemoteUpdate } = get();
      if (!isSyncing || !currentProjectId || !currentSongId) return;

      const now = Date.now();
      const baseUpdatedAt = lastRemoteUpdate;
      set({ lastRemoteUpdate: now });

      try {
        await (storageService as any).saveSong(currentProjectId, currentSongId, {
          tempo,
          comments,
          // Pass audioData so FirebaseStorage can upload it; saveSong strips it before Firestore write.
          // LocalStorage handles audioData separately via its own IDB store.
          tracks: tracks.map(({ buffer, ...rest }) => rest),
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
          isMuted: false
        };

        const newTrack: TrackData = {
          id: trackId,
          name: `Punch: ${file.name.split('.')[0]}`,
          buffer: audioBuffer,
          audioData: arrayBuffer,
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
      const current = {
        tracks: get().tracks.map(t => ({ 
          ...t, 
          clips: (t.clips || []).map(c => ({ ...c })) 
        })),
        comments: get().comments.map(c => ({ ...c })),
        tempo: get().tempo
      };
      future.push(current);
      const previous = past.pop()!;
      set({ ...previous, canUndo: past.length > 0, canRedo: true });
    },

    redo: () => {
      if (future.length === 0) return;
      const current = {
        tracks: get().tracks.map(t => ({ 
          ...t, 
          clips: (t.clips || []).map(c => ({ ...c })) 
        })),
        comments: get().comments.map(c => ({ ...c })),
        tempo: get().tempo
      };
      past.push(current);
      const next = future.pop()!;
      set({ ...next, canUndo: true, canRedo: future.length > 0 });
    },

    addTrack: (buffer, name, audioData, offset = 0) => {
      pushToHistory();
      set((state) => ({
        tracks: [...state.tracks, {
          id: generateId(),
          name,
          buffer,
          audioData,
          volume: 0.8,
          isMuted: false,
          isSoloed: false,
          createdAt: Date.now(),
          clips: [{
            id: generateId(),
            offset: offset,
            duration: buffer.duration,
            audioStart: 0,
            isMuted: false,
          }],
        }],
        canUndo: true
      }));
      get().pushUpdate().catch(err => console.error("Update failed", err));
    },

    addEmptyTrack: (name) => {
      const trimmedName = (name || '').trim() || `Track ${get().tracks.length + 1}`;
      const newTrackId = generateId();
      pushToHistory();
      set((state) => ({
        tracks: [...state.tracks, {
          id: newTrackId,
          name: trimmedName,
          volume: 0.8,
          isMuted: false,
          isSoloed: false,
          createdAt: Date.now(),
          clips: [{
            id: generateId(),
            offset: 0,
            duration: 4,
            audioStart: 0,
            isMuted: false,
          }],
        }],
        canUndo: true
      }));
      get().pushUpdate().catch(err => console.error("Update failed", err));
      return newTrackId;
    },

    splitTrack: (trackId, timelineTime) => {
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

    removeTrack: (id) => {
      pushToHistory();
      set((state) => ({
        tracks: state.tracks.filter(t => t.id !== id),
        comments: state.comments.filter(c => c.trackId !== id),
        canUndo: true
      }));
      get().pushUpdate().catch(err => console.error("Update failed", err));
    },

    updateTrack: (id, updates, silent = false) => {
      if (!silent) pushToHistory();
      set((state) => ({
        tracks: state.tracks.map(t => t.id === id ? { ...t, ...updates } : t),
        canUndo: !silent || state.canUndo
      }));
      if (!silent) get().pushUpdate().catch(err => console.error("Update failed", err));
    },

    updateClip: (trackId, clipId, updates, silent = false) => {
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
      const user = get().currentUser;
      const userId = user?.id || 'anonymous';
      const userName = user?.name || 'Musician';
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
          userId,
          userName,
          status: 'open' as const,
          createdAt: Date.now(),
          mentions: parseMentions(text),
          tags: parseTags(text)
        }],
        canUndo: true
      }));
      get().pushUpdate().catch(err => console.error("Update failed", err));
      return nextCommentId;
    },

    toggleResolveComment: (id) => {
      pushToHistory();
      set((state) => ({
        comments: state.comments.map(c => c.id === id ? { ...c, status: c.status === 'approved' ? 'open' : 'approved' } : c),
        canUndo: true
      }));
      get().pushUpdate().catch(err => console.error("Update failed", err));
    },

    setCommentStatus: (id, status) => {
      pushToHistory();
      set((state) => ({
        comments: state.comments.map(c => c.id === id ? { ...c, status } : c),
        canUndo: true
      }));
      get().pushUpdate().catch(err => console.error("Update failed", err));
    },

    resolveComments: (ids) => {
      pushToHistory();
      const idSet = new Set(ids);
      set((state) => ({
        comments: state.comments.map(c => idSet.has(c.id) ? { ...c, status: 'approved' as const } : c),
        canUndo: true
      }));
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

    setZoom: (zoom) => set({ zoom: isNaN(zoom) ? 100 : Math.max(0.5, Math.min(500, zoom)) }),
    setTempo: (tempo) => {
      const val = Number(tempo);
      if (isNaN(val)) return;
      pushToHistory();
      const safeTempo = Math.max(20, Math.min(300, val));
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
    let max = 0;
    tracks.forEach(track => {
      (track.clips || []).forEach(clip => {
        const offset = Number(clip.offset) || 0;
        const duration = Number(clip.duration) || 0;
        if (!isNaN(offset) && !isNaN(duration)) {
          max = Math.max(max, offset + duration);
        }
      });
    });
    const safeCurrentTime = Number(currentTime) || 0;
    return Math.max(max + 10, safeCurrentTime + 10, 60);
  }, [tracks, currentTime]);
};
