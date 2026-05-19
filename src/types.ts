export interface Comment {
  id: string;
  trackId: string;
  timestamp: number; // in seconds
  text: string;
  userName: string;
  userId: string;
  isResolved: boolean;
  createdAt: number;
}

export interface Clip {
  id: string;
  offset: number; // Timeline position in seconds
  duration: number; // Playback duration in seconds
  audioStart: number; // Start point within the buffer in seconds
  isMuted: boolean;
}

export interface TrackData {
  id: string;
  name: string;
  buffer?: AudioBuffer | null;
  audioData?: ArrayBuffer; // Stored raw data for persistence
  volume: number; // 0 to 1
  isMuted: boolean;
  isSoloed: boolean;
  clips: Clip[];
}

export type TimelineMode = 'time' | 'beats';

export interface DAWState {
  tracks: TrackData[];
  comments: Comment[];
  tempo: number;
  isPlaying: boolean;
  currentTime: number;
  timelineMode: TimelineMode;
  snapEnabled: boolean;
  zoom: number; // pixels per second
  followPlayhead: boolean;
  activeTool: 'select' | 'scissors' | 'mute';
  
  // Auth
  currentUser: any; // User | null
  setCurrentUser: (user: any) => void;

  // History
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  commentDraft: { trackId: string; timestamp: number } | null;
  currentProjectId: string | null;
  currentProjectName: string;
  isSyncing: boolean;
  remotePresences: any[];
  lastRemoteUpdate?: number;
  markers: { 1: number | null, 2: number | null };
  selectedTrackId: string | null;
  showMixer: boolean;

  // Actions
  setSelectedTrackId: (id: string | null) => void;
  setShowMixer: (show: boolean) => void;
  loadProject: (state: Partial<DAWState>) => void;
  syncProject: (id: string) => () => void;
  updatePresence: (cursorPosition: number) => void;
  pushUpdate: () => Promise<void>;
  punchIn: (file: File) => Promise<void>;
  setMarker: (index: 1 | 2, time: number | null) => void;
  goToMarker: (index: 1 | 2) => void;
  seek: (delta: number) => void;
  goToStart: () => void;
  goToEnd: () => void;
  setFollowPlayhead: (follow: boolean) => void;
  setTool: (tool: 'select' | 'scissors' | 'mute') => void;
  setCommentDraft: (draft: { trackId: string; timestamp: number } | null) => void;
  addTrack: (buffer: AudioBuffer, name: string, audioData?: ArrayBuffer, offset?: number) => void;
  splitTrack: (trackId: string, timestamp: number) => void;
  removeTrack: (id: string) => void;
  updateTrack: (id: string, updates: Partial<TrackData>, silent?: boolean) => void;
  updateClip: (trackId: string, clipId: string, updates: Partial<Clip>, silent?: boolean) => void;
  removeClip: (trackId: string, clipId: string) => void;
  addComment: (trackId: string, timestamp: number, text: string) => void;
  toggleResolveComment: (id: string) => void;
  removeComment: (id: string) => void;
  setTempo: (tempo: number) => void;
  setTimelineMode: (mode: TimelineMode) => void;
  setSnapEnabled: (enabled: boolean) => void;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setZoom: (zoom: number) => void;
}
