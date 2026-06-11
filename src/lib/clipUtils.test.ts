import { describe, expect, it } from 'vitest';
import { getClipEnd, getTracksMaxTime } from './clipUtils';
import { Clip, TrackData } from '../types';

const makeClip = (offset: number, duration: number): Clip => ({
  id: 'c1',
  offset,
  duration,
  audioStart: 0,
  isMuted: false,
});

const makeTrack = (clips: Clip[]): TrackData => ({
  id: 't1',
  name: 'Track',
  volume: 1,
  isMuted: false,
  isSoloed: false,
  clips,
});

describe('getClipEnd', () => {
  it('returns offset + duration', () => {
    expect(getClipEnd(makeClip(5, 10))).toBe(15);
  });

  it('handles zero offset', () => {
    expect(getClipEnd(makeClip(0, 8))).toBe(8);
  });

  it('coerces non-numeric values to 0', () => {
    expect(getClipEnd({ ...makeClip(0, 0), offset: NaN as any })).toBe(0);
    expect(getClipEnd({ ...makeClip(0, 0), duration: undefined as any })).toBe(0);
  });
});

describe('getTracksMaxTime', () => {
  it('returns 0 for empty tracks array', () => {
    expect(getTracksMaxTime([])).toBe(0);
  });

  it('returns 0 for a track with no clips', () => {
    expect(getTracksMaxTime([makeTrack([])])).toBe(0);
  });

  it('returns the end time of a single clip', () => {
    expect(getTracksMaxTime([makeTrack([makeClip(2, 8)])])).toBe(10);
  });

  it('returns the furthest end time across multiple tracks', () => {
    const tracks = [
      makeTrack([makeClip(0, 10)]),
      makeTrack([makeClip(5, 20)]),
      makeTrack([makeClip(0, 3)]),
    ];
    expect(getTracksMaxTime(tracks)).toBe(25);
  });

  it('returns the furthest end time across multiple clips on one track', () => {
    const track = makeTrack([makeClip(0, 5), makeClip(10, 8)]);
    expect(getTracksMaxTime([track])).toBe(18);
  });
});
