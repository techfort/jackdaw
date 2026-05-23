import { useStore } from '../store';
import { TrackData } from '../types';
import { storageService } from '../services/storage';
import { exportMixdown } from './exportUtils';

let _punchInTrigger: (() => void) | null = null;

export const registerPunchInTrigger = (fn: () => void): void => {
  _punchInTrigger = fn;
};

export const triggerPunchIn = (): CommandResult => {
  if (!_punchInTrigger) {
    return { ok: false, message: 'Punch-in not available.' };
  }
  _punchInTrigger();
  return { ok: true, message: 'Opening file picker for punch-in...' };
};

export type CommandResult = {
  ok: boolean;
  message: string;
};

const BEATS_PER_BAR = 4;
const ZOOM_IN_FACTOR = 1.1;
const ZOOM_OUT_FACTOR = 0.9;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

const parseVolumeCommandArgs = (rawArgs: string): { ref: string | null; amount: number | null } => {
  const cleaned = (rawArgs || '').trim();
  if (!cleaned) return { ref: null, amount: null };

  const quoted = cleaned.match(/^"(.+)"\s+(.+)$/);
  if (quoted) {
    const amount = Number(quoted[2].trim());
    return { ref: quoted[1], amount: Number.isFinite(amount) ? amount : null };
  }

  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) {
    const amount = Number(parts[0]);
    return { ref: null, amount: Number.isFinite(amount) ? amount : null };
  }

  const amount = Number(parts.slice(1).join(' '));
  return { ref: parts[0], amount: Number.isFinite(amount) ? amount : null };
};

export const adjustTrackVolume = (rawArgs: string, direction: 'up' | 'down'): CommandResult => {
  const state = useStore.getState();
  const parsed = parseVolumeCommandArgs(rawArgs);
  if (parsed.amount === null || parsed.amount <= 0) {
    return { ok: false, message: 'Volume amount must be a positive number.' };
  }

  const target = parsed.ref
    ? findTrackByReference(state.tracks, parsed.ref)
    : (state.selectedTrackId ? state.tracks.find(track => track.id === state.selectedTrackId) || null : null);

  if (!target) {
    return { ok: false, message: parsed.ref ? `Track not found: ${parsed.ref}` : 'select a track before changing volume' };
  }

  const currentVolume = Number(target.volume) || 0;
  const delta = direction === 'up' ? parsed.amount : -parsed.amount;
  const nextVolume = Math.max(0, Math.min(1, currentVolume + delta));
  state.updateTrack(target.id, { volume: nextVolume });

  const id = localTrackId(state.tracks, target.id);
  return {
    ok: true,
    message: `${direction === 'up' ? 'Raised' : 'Lowered'} track "${target.name}" (id: ${id}) volume by ${parsed.amount.toFixed(3)} to ${Math.round(nextVolume * 100)}%.`
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

export const inviteCollaboratorByEmail = async (emailRaw: string): Promise<CommandResult> => {
  const state = useStore.getState();
  const email = (emailRaw || '').trim().toLowerCase();
  if (!email) {
    return { ok: false, message: 'Email is required. Use: invite <email>' };
  }

  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, message: `Invalid email: ${emailRaw}` };
  }

  if (!state.currentProjectId) {
    return { ok: false, message: 'No project loaded.' };
  }

  try {
    await storageService.inviteToProject(state.currentProjectId, email, 'editor');
    return { ok: true, message: `Invite sent to ${email}.` };
  } catch (error: any) {
    return { ok: false, message: error?.message || 'Failed to send invite.' };
  }
};

export const exportFromCommand = async (selectionOnly: boolean): Promise<CommandResult> => {
  const state = useStore.getState();
  if (!state.tracks?.length) {
    return { ok: false, message: 'No tracks to export.' };
  }

  if (selectionOnly) {
    const marker1 = state.markers?.[1] ?? null;
    const marker2 = state.markers?.[2] ?? null;
    if (marker1 === null || marker2 === null) {
      return { ok: false, message: 'Set markers 1 and 2 before using e stem.' };
    }

    const start = Math.min(marker1, marker2);
    const end = Math.max(marker1, marker2);
    if (end <= start) {
      return { ok: false, message: 'Invalid marker range for e stem.' };
    }

    await exportMixdown(state.tracks, { startTime: start, endTime: end });
    return { ok: true, message: `Exported stem between markers (${start.toFixed(2)}s-${end.toFixed(2)}s).` };
  }

  await exportMixdown(state.tracks);
  return { ok: true, message: 'Exported full mixdown.' };
};

export const zoomFromTerminalSigns = (signs: string): CommandResult => {
  const state = useStore.getState();
  const token = (signs || '').trim();

  if (!token || !/^[+-]+$/.test(token)) {
    return { ok: false, message: 'Zoom command must use only + or only - signs.' };
  }

  if (token.includes('+') && token.includes('-')) {
    return { ok: false, message: 'Mixed zoom signs are not allowed.' };
  }

  const currentZoom = Number(state.zoom) || 100;
  const factor = token[0] === '+' ? ZOOM_IN_FACTOR : ZOOM_OUT_FACTOR;
  const nextZoom = currentZoom * Math.pow(factor, token.length);
  state.setZoom(nextZoom);

  return {
    ok: true,
    message: `${token[0] === '+' ? 'Zoomed in' : 'Zoomed out'} ${token.length} step${token.length === 1 ? '' : 's'} (${(Number(useStore.getState().zoom) || 100).toFixed(2)}%).`,
  };
};

export const executeTerminalCommand = async (raw: string): Promise<CommandResult> => {
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

  match = command.match(/^v([ud])\s+(.+)$/i);
  if (match) {
    return adjustTrackVolume(match[2], match[1].toLowerCase() === 'u' ? 'up' : 'down');
  }

  match = command.match(/^c:\s*"([\s\S]+)"\s*$/i);
  if (match) {
    return addCommentFromCommand(match[1]);
  }

  match = command.match(/^c\s+(.+?)\s*:\s*"([\s\S]+)"\s*$/i);
  if (match) {
    return addCommentFromCommand(match[2], match[1]);
  }

  match = command.match(/^invite\s+(.+)$/i);
  if (match) {
    return inviteCollaboratorByEmail(match[1]);
  }

  if (/^e\s+stem$/i.test(command)) {
    return exportFromCommand(true);
  }

  if (/^e$/i.test(command)) {
    return exportFromCommand(false);
  }

  if (/^[+-]+$/.test(command)) {
    return zoomFromTerminalSigns(command);
  }

  if (/^punchin$/i.test(command)) {
    return triggerPunchIn();
  }

  if (/^spectrum$/i.test(command) || /^spec$/i.test(command)) {
    const state = useStore.getState();
    const nextOpen = !state.isSpectrumOpen;
    state.setSpectrumOpen(nextOpen);
    return {
      ok: true,
      message: `${nextOpen ? 'Opened' : 'Closed'} audio spectrum window.`,
    };
  }

  return {
    ok: false,
    message: 'Unknown command. Use: add track, rm track, rm c, sel, go, ff, rw, s, m, vu, vd, c:, invite, e, e stem, punchin, spectrum, +, -, ++, --',
  };
};
