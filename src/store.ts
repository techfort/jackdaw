import { create } from 'zustand';
import React, { useMemo } from 'react';
import { getSharedAudioContext } from './lib/sharedAudioContext';
import { DAWState, TrackData, TimelineMode, Comment, Clip } from './types';
import { storageService, authService } from './services/storage';


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
    selectedTrackId: null,
    showMixer: false,
    currentUser: null,

    setCurrentUser: (user) => set({ currentUser: user }),
    setSelectedTrackId: (id) => set({ selectedTrackId: id }),
    setShowMixer: (show) => set({ showMixer: show }),
    setFollowPlayhead: (followPlayhead) => set({ followPlayhead }),
    setTool: (activeTool) => set({ activeTool }),
    setCommentDraft: (commentDraft) => set({ commentDraft }),

    setMarker: (index, time) => {
      set((state) => ({
        markers: { ...state.markers, [index]: time }
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
      const { isSyncing, currentProjectId, currentSongId, tracks, comments, tempo } = get();
      if (!isSyncing || !currentProjectId || !currentSongId) return;

      const now = Date.now();
      set({ lastRemoteUpdate: now });

      try {
        await (storageService as any).saveSong(currentProjectId, currentSongId, {
          tempo,
          comments,
          tracks: tracks.map(({ buffer, audioData, ...rest }) => rest), // Keep it light
          updatedAt: now
        });
      } catch (err) {
        console.error("Failed to push update", err);
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
      
      set((state) => ({
        comments: [...state.comments, {
          id: generateId(),
          trackId,
          timestamp,
          text,
          userId,
          userName,
          isResolved: false,
          createdAt: Date.now()
        }],
        canUndo: true
      }));
      get().pushUpdate().catch(err => console.error("Update failed", err));
    },

    toggleResolveComment: (id) => {
      pushToHistory();
      set((state) => ({
        comments: state.comments.map(c => c.id === id ? { ...c, isResolved: !c.isResolved } : c),
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
