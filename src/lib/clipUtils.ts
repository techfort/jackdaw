import { Clip, TrackData } from '../types';

export const getClipEnd = (clip: Clip): number =>
  (Number(clip.offset) || 0) + (Number(clip.duration) || 0);

export const getTracksMaxTime = (tracks: TrackData[]): number => {
  let max = 0;
  tracks.forEach(track => {
    (track.clips || []).forEach(clip => {
      const end = getClipEnd(clip);
      if (isFinite(end)) max = Math.max(max, end);
    });
  });
  return max;
};
