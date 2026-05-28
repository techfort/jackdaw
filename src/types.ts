export type CommentStatus = 'open' | 'in_progress' | 'needs_review' | 'approved';

export type ActivityEventKind =
  | 'comment_added'
  | 'comment_resolved'
  | 'comment_reopened'
  | 'comment_status_changed'
  | 'track_added'
  | 'track_removed';

export interface ActivityEvent {
  id: string;
  kind: ActivityEventKind;
  actor: { userId: string; userName: string };
  timestamp: number;
  payload: Record<string, unknown>;
}

export interface Reply {
  id: string;
  commentId: string;
  text: string;
  userId: string;
  userName: string;
  createdAt: number;
  mentions?: string[];
}

export interface Comment {
  id: string;
  trackId: string;
  timestamp: number; // in seconds
  text: string;
  userName: string;
  userId: string;
  status: CommentStatus;
  createdAt: number;
  mentions?: string[];
  tags?: string[];
  replies?: Reply[];
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
  storagePath?: string;    // Firebase Storage path: audio/{projectId}/{trackId}
  volume: number; // 0 to 1
  isMuted: boolean;
  isSoloed: boolean;
  clips: Clip[];
  createdAt?: number;
}

export type TimelineMode = 'time' | 'beats';

import { Role } from './services/storage/types';
export type { Role };

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
  currentSongId: string | null;
  currentSongName: string;
  currentProjectId: string | null;
  currentProjectName: string;
  currentUserRole: Role | null;
  isSyncing: boolean;
  remotePresences: any[];
  lastRemoteUpdate?: number;
  activityEvents: ActivityEvent[];
  seenCommentIds: string[];
  markers: { 1: number | null, 2: number | null };
  markerLabels: { 1: string; 2: string };
  selectedTrackId: string | null;
  showMixer: boolean;
  isSpectrumOpen: boolean;
  isClickEnabled: boolean;

  // Actions
  setSpectrumOpen: (open: boolean) => void;
  setClickEnabled: (enabled: boolean) => void;
  setSelectedTrackId: (id: string | null) => void;
  setShowMixer: (show: boolean) => void;
  clearSong: () => void;
  loadProject: (state: Partial<DAWState>) => void;
  loadSong: (state: Partial<DAWState>) => void;
  syncProject: (id: string) => () => void;
  syncSong: (projectId: string, songId: string) => () => void;
  updatePresence: (cursorPosition: number) => void;
  pushUpdate: () => Promise<void>;
  punchIn: (file: File) => Promise<void>;
  setMarker: (index: 1 | 2, time: number | null) => void;
  setMarkerLabel: (index: 1 | 2, label: string) => void;
  goToMarker: (index: 1 | 2) => void;
  seek: (delta: number) => void;
  goToStart: () => void;
  goToEnd: () => void;
  setFollowPlayhead: (follow: boolean) => void;
  setTool: (tool: 'select' | 'scissors' | 'mute') => void;
  setCommentDraft: (draft: { trackId: string; timestamp: number } | null) => void;
  addActivityEvent: (event: Omit<ActivityEvent, 'id'>) => void;
  markCommentsSeen: (ids: string[]) => void;
  addReply: (commentId: string, text: string) => string;
  addEmptyTrack: (name: string) => string;
  addTrack: (buffer: AudioBuffer, name: string, audioData?: ArrayBuffer, offset?: number) => void;
  splitTrack: (trackId: string, timestamp: number) => void;
  removeTrack: (id: string) => void;
  updateTrack: (id: string, updates: Partial<TrackData>, silent?: boolean) => void;
  updateClip: (trackId: string, clipId: string, updates: Partial<Clip>, silent?: boolean) => void;
  removeClip: (trackId: string, clipId: string) => void;
  addComment: (trackId: string, timestamp: number, text: string) => string;
  toggleResolveComment: (id: string) => void;
  setCommentStatus: (id: string, status: CommentStatus) => void;
  resolveComments: (ids: string[]) => void;
  removeComment: (id: string) => void;
  setTempo: (tempo: number) => void;
  setTimelineMode: (mode: TimelineMode) => void;
  setSnapEnabled: (enabled: boolean) => void;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setZoom: (zoom: number) => void;
}
