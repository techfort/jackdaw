import { Clip, TrackData } from '../types';

/** True when the clip has a decoded AudioBuffer ready for playback. */
export const clipHasAudio = (clip: Clip): boolean => !!clip.buffer;

/** True when at least one clip on the track has decoded audio. */
export const trackHasAudio = (track: TrackData): boolean =>
  (track.clips || []).some(clipHasAudio);

/**
 * Strip the non-serialisable AudioBuffer from a clip before persistence.
 * Keeps audioData (raw bytes) so the storage layer can upload or cache it.
 */
export const serializeClip = (clip: Clip): Omit<Clip, 'buffer'> => {
  const { buffer: _buffer, ...rest } = clip;
  return rest;
};
