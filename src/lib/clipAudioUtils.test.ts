import { describe, expect, it } from 'vitest';
import { Clip, TrackData } from '../types';
import { clipHasAudio, trackHasAudio, serializeClip } from './clipAudioUtils';

const makeClip = (overrides: Partial<Clip> = {}): Clip => ({
  id: 'c1',
  offset: 0,
  duration: 4,
  audioStart: 0,
  isMuted: false,
  ...overrides,
});

const makeTrack = (clips: Clip[]): TrackData => ({
  id: 't1',
  name: 'Track',
  volume: 1,
  isMuted: false,
  isSoloed: false,
  clips,
});

const fakeBuffer = {} as AudioBuffer;

describe('clipHasAudio', () => {
  it('returns true when clip has a buffer', () => {
    expect(clipHasAudio(makeClip({ buffer: fakeBuffer }))).toBe(true);
  });

  it('returns false when clip has no buffer', () => {
    expect(clipHasAudio(makeClip())).toBe(false);
  });

  it('returns false when buffer is null', () => {
    expect(clipHasAudio(makeClip({ buffer: null }))).toBe(false);
  });
});

describe('trackHasAudio', () => {
  it('returns true when at least one clip has a buffer', () => {
    const track = makeTrack([
      makeClip(),
      makeClip({ id: 'c2', buffer: fakeBuffer }),
    ]);
    expect(trackHasAudio(track)).toBe(true);
  });

  it('returns false when no clips have a buffer', () => {
    expect(trackHasAudio(makeTrack([makeClip(), makeClip({ id: 'c2' })]))).toBe(false);
  });

  it('returns false for a track with no clips', () => {
    expect(trackHasAudio(makeTrack([]))).toBe(false);
  });
});

describe('serializeClip', () => {
  it('strips the buffer field', () => {
    const clip = makeClip({ buffer: fakeBuffer });
    const result = serializeClip(clip);
    expect('buffer' in result).toBe(false);
  });

  it('preserves all other fields including audioData', () => {
    const audioData = new ArrayBuffer(8);
    const clip = makeClip({ buffer: fakeBuffer, audioData, storagePath: '/some/path' });
    const result = serializeClip(clip);
    expect(result.id).toBe('c1');
    expect(result.offset).toBe(0);
    expect(result.duration).toBe(4);
    expect(result.audioStart).toBe(0);
    expect(result.isMuted).toBe(false);
    expect(result.audioData).toBe(audioData);
    expect(result.storagePath).toBe('/some/path');
  });

  it('is safe on a clip with no buffer', () => {
    const clip = makeClip();
    const result = serializeClip(clip);
    expect('buffer' in result).toBe(false);
    expect(result.id).toBe('c1');
  });
});
