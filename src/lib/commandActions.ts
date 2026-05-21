import { useStore } from '../store';
import { TrackData } from '../types';

export type CommandResult = {
  ok: boolean;
  message: string;
};

const BEATS_PER_BAR = 4;

const findTrackByReference = (tracks: TrackData[], rawRef: string): TrackData | null => {
  const ref = rawRef.trim();
  if (!ref) return null;

  const byId = tracks.find(track => track.id === ref);
  if (byId) return byId;

  if (/^\d+$/.test(ref)) {
    const localId = Number(ref);
    return tracks[localId - 1] || null;
  }

  const unquoted = ref.match(/^"(.+)"$/)?.[1] ?? ref;
  const normalized = unquoted.trim().toLowerCase();
  return tracks.find(track => track.name.trim().toLowerCase() === normalized) || null;
};

const localTrackId = (tracks: TrackData[], id: string): number => {
  const index = tracks.findIndex(track => track.id === id);
  return index >= 0 ? index + 1 : 0;
};

const getAutoCommentTarget = (tracks: TrackData[], currentTime: number): TrackData | null => {
  const hasSolo = tracks.some(track => track.isSoloed);

  const playable = tracks.filter(track => {
    if (!track.buffer || track.isMuted) return false;
    if (hasSolo && !track.isSoloed) return false;

    return (track.clips || []).some(clip => {
      if (clip.isMuted) return false;
      const clipEnd = Number(clip.offset || 0) + Number(clip.duration || 0);
      return currentTime < clipEnd;
    });
  });

  if (playable.length === 1) return playable[0];
  return null;
};

const parseClockToken = (token: string): number | null => {
  const parts = token.trim().split(':').map(part => part.trim());
  if (parts.length < 2 || parts.length > 3) return null;

  const numericParts = parts.map(Number);
  if (numericParts.some(part => Number.isNaN(part) || part < 0)) return null;

  if (parts.length === 2) {
    const [minutes, seconds] = numericParts;
    return minutes * 60 + seconds;
  }

  const [hours, minutes, seconds] = numericParts;
  return hours * 3600 + minutes * 60 + seconds;
};

const parseAbsolutePositionToken = (token: string, tempo: number): number | null => {
  const cleaned = token.trim();

  if (cleaned.includes(':')) return parseClockToken(cleaned);

  if (cleaned.includes('.')) {
    const pieces = cleaned.split('.');
    if (pieces.length < 2 || pieces.length > 3) return null;

    const bar = Number(pieces[0]);
    const beat = Number(pieces[1]);
    const subdivision = pieces[2] ? Number(pieces[2]) : 0;

    if (
      Number.isNaN(bar) || Number.isNaN(beat) || Number.isNaN(subdivision) ||
      bar < 1 || beat < 1 || subdivision < 0
    ) {
      return null;
    }

    const totalBeats = (bar - 1) * BEATS_PER_BAR + (beat - 1) + subdivision / 100;
    return totalBeats * (60 / tempo);
  }

  const seconds = Number(cleaned);
  if (Number.isNaN(seconds) || seconds < 0) return null;
  return seconds;
};

const parseRelativeToken = (token: string, tempo: number): number | null => {
  const cleaned = token.trim();

  if (cleaned.includes(':')) return parseClockToken(cleaned);

  if (cleaned.includes('.')) {
    const pieces = cleaned.split('.');
    if (pieces.length < 1 || pieces.length > 3) return null;

    const bars = Number(pieces[0] || '0');
    const beats = Number(pieces[1] || '0');
    const subdivision = Number(pieces[2] || '0');

    if (
      Number.isNaN(bars) || Number.isNaN(beats) || Number.isNaN(subdivision) ||
      bars < 0 || beats < 0 || subdivision < 0
    ) {
      return null;
    }

    const totalBeats = bars * BEATS_PER_BAR + beats + subdivision / 100;
    return totalBeats * (60 / tempo);
  }

  const seconds = Number(cleaned);
  if (Number.isNaN(seconds) || seconds < 0) return null;
  return seconds;
};

export const selectTrackByReference = (ref: string): CommandResult => {
  const state = useStore.getState();
  const target = findTrackByReference(state.tracks, ref);
  if (!target) {
    return { ok: false, message: `Track not found: ${ref}` };
  }

  const id = localTrackId(state.tracks, target.id);
  state.setSelectedTrackId(target.id);
  return { ok: true, message: `Selected track "${target.name}" (id: ${id}).` };
};

export const muteTrackByReference = (ref: string): CommandResult => {
  const state = useStore.getState();
  const target = findTrackByReference(state.tracks, ref);
  if (!target) {
    return { ok: false, message: `Track not found: ${ref}` };
  }

  const id = localTrackId(state.tracks, target.id);
  const nextMuted = !target.isMuted;
  state.updateTrack(target.id, { isMuted: nextMuted });
  return {
    ok: true,
    message: `${nextMuted ? 'Muted' : 'Unmuted'} track "${target.name}" (id: ${id}).`
  };
};

export const soloTrackByReference = (ref: string): CommandResult => {
  const state = useStore.getState();
  const target = findTrackByReference(state.tracks, ref);
  if (!target) {
    return { ok: false, message: `Track not found: ${ref}` };
  }

  const id = localTrackId(state.tracks, target.id);
  const nextSolo = !target.isSoloed;
  state.updateTrack(target.id, { isSoloed: nextSolo });
  return {
    ok: true,
    message: `${nextSolo ? 'Soloed' : 'Unsoloed'} track "${target.name}" (id: ${id}).`
  };
};

export const addTrackByName = (name: string): CommandResult => {
  const state = useStore.getState();
  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, message: 'Track name is required.' };
  }

  const trackId = state.addEmptyTrack(trimmed);
  const nextTracks = useStore.getState().tracks;
  const id = localTrackId(nextTracks, trackId);
  return { ok: true, message: `Added track "${trimmed}" (id: ${id}).` };
};

export const removeTrackByReference = (ref: string): CommandResult => {
  const state = useStore.getState();
  const target = findTrackByReference(state.tracks, ref);
  if (!target) {
    return { ok: false, message: `Track not found: ${ref}` };
  }

  const id = localTrackId(state.tracks, target.id);
  state.removeTrack(target.id);
  return { ok: true, message: `Removed track "${target.name}" (id: ${id}).` };
};

export const goToPosition = (token: string): CommandResult => {
  const state = useStore.getState();
  const seconds = parseAbsolutePositionToken(token, state.tempo);
  if (seconds === null) {
    return { ok: false, message: `Invalid position/time: ${token}` };
  }

  state.setCurrentTime(seconds);
  return { ok: true, message: `Playhead set to ${seconds.toFixed(2)}s.` };
};

export const moveForward = (token: string): CommandResult => {
  const state = useStore.getState();
  const delta = parseRelativeToken(token, state.tempo);
  if (delta === null) {
    return { ok: false, message: `Invalid forward value: ${token}` };
  }

  state.seek(delta);
  return { ok: true, message: `Moved forward ${delta.toFixed(2)}s.` };
};

export const rewind = (token: string): CommandResult => {
  const state = useStore.getState();
  const delta = parseRelativeToken(token, state.tempo);
  if (delta === null) {
    return { ok: false, message: `Invalid rewind value: ${token}` };
  }

  state.seek(-delta);
  return { ok: true, message: `Moved back ${delta.toFixed(2)}s.` };
};

export const addCommentFromCommand = (commentText: string, trackRef?: string): CommandResult => {
  const state = useStore.getState();
  const text = (commentText || '').trim();
  if (!text) {
    return { ok: false, message: 'Comment text is required.' };
  }

  let targetTrack: TrackData | null = null;

  if (trackRef && trackRef.trim()) {
    targetTrack = findTrackByReference(state.tracks, trackRef);
    if (!targetTrack) {
      return { ok: false, message: `Track not found: ${trackRef}` };
    }
  } else if (state.selectedTrackId) {
    targetTrack = state.tracks.find(track => track.id === state.selectedTrackId) || null;
  } else {
    targetTrack = getAutoCommentTarget(state.tracks, Number(state.currentTime || 0));
  }

  if (!targetTrack) {
    return { ok: false, message: 'select a track before commenting' };
  }

  const localId = localTrackId(state.tracks, targetTrack.id);
  const commentId = state.addComment(targetTrack.id, state.currentTime || 0, text);
  return {
    ok: true,
    message: `Comment #${commentId} added to "${targetTrack.name}" (id: ${localId}) at ${Number(state.currentTime || 0).toFixed(2)}s.`
  };
};

export const removeCommentById = (commentId: string): CommandResult => {
  const state = useStore.getState();
  const normalized = (commentId || '').trim().replace(/^#/, '');
  if (!normalized) {
    return { ok: false, message: 'Comment id is required.' };
  }

  const target = state.comments.find(comment => comment.id === normalized);
  if (!target) {
    return { ok: false, message: `Comment not found: ${normalized}` };
  }

  state.removeComment(normalized);
  return { ok: true, message: `Removed comment #${normalized}.` };
};

export const executeTerminalCommand = (raw: string): CommandResult => {
  const command = raw.trim();
  if (!command) {
    return { ok: true, message: '' };
  }

  let match = command.match(/^add\s+track\s+(.+)$/i);
  if (match) {
    const name = match[1].trim().replace(/^"(.+)"$/, '$1').trim();
    return addTrackByName(name);
  }

  match = command.match(/^rm\s+track\s+(.+)$/i);
  if (match) {
    return removeTrackByReference(match[1].trim().replace(/^"(.+)"$/, '$1'));
  }

  match = command.match(/^rm\s+c\s+(.+)$/i);
  if (match) {
    return removeCommentById(match[1]);
  }

  match = command.match(/^sel\s+(.+)$/i);
  if (match) {
    return selectTrackByReference(match[1]);
  }

  match = command.match(/^go\s+(.+)$/i);
  if (match) {
    return goToPosition(match[1]);
  }

  match = command.match(/^ff\s+(.+)$/i);
  if (match) {
    return moveForward(match[1]);
  }

  match = command.match(/^rw\s+(.+)$/i);
  if (match) {
    return rewind(match[1]);
  }

  match = command.match(/^s\s+(.+)$/i);
  if (match) {
    return soloTrackByReference(match[1]);
  }

  match = command.match(/^m\s+(.+)$/i);
  if (match) {
    return muteTrackByReference(match[1]);
  }

  match = command.match(/^c:\s*"([\s\S]+)"\s*$/i);
  if (match) {
    return addCommentFromCommand(match[1]);
  }

  match = command.match(/^c\s+(.+?)\s*:\s*"([\s\S]+)"\s*$/i);
  if (match) {
    return addCommentFromCommand(match[2], match[1]);
  }

  return {
    ok: false,
    message: 'Unknown command. Use: add track, rm track, rm c, sel, go, ff, rw, s, m, c:',
  };
};
