import { describe, expect, it } from 'vitest';
import { canManageFrozenTrack, FREEZE_EXEMPT_KEYS } from './freezeGuard';
import { TrackData } from '../types';

const makeTrack = (ownerId: string): TrackData => ({
  id: 'track-1',
  name: 'Test Track',
  volume: 1,
  isMuted: false,
  isSoloed: false,
  isFrozen: true,
  ownerId,
  clips: [],
});

describe('canManageFrozenTrack', () => {
  it('allows the track owner to manage it', () => {
    const track = makeTrack('user-1');
    expect(canManageFrozenTrack(track, { id: 'user-1' }, null)).toBe(true);
  });

  it('allows a project owner regardless of track ownership', () => {
    const track = makeTrack('user-1');
    expect(canManageFrozenTrack(track, { id: 'user-2' }, 'owner')).toBe(true);
  });

  it('denies a non-owner editor on another user\'s track', () => {
    const track = makeTrack('user-1');
    expect(canManageFrozenTrack(track, { id: 'user-2' }, 'editor')).toBe(false);
  });

  it('denies when currentUser is null', () => {
    const track = makeTrack('user-1');
    expect(canManageFrozenTrack(track, null, null)).toBe(false);
  });

  it('denies viewer role even if they own the track (owner id mismatch)', () => {
    const track = makeTrack('user-1');
    expect(canManageFrozenTrack(track, { id: 'user-99' }, 'viewer')).toBe(false);
  });
});

describe('FREEZE_EXEMPT_KEYS', () => {
  it('includes isMuted, isSoloed, isFrozen', () => {
    expect(FREEZE_EXEMPT_KEYS.has('isMuted')).toBe(true);
    expect(FREEZE_EXEMPT_KEYS.has('isSoloed')).toBe(true);
    expect(FREEZE_EXEMPT_KEYS.has('isFrozen')).toBe(true);
  });

  it('does not include other keys like volume or name', () => {
    expect(FREEZE_EXEMPT_KEYS.has('volume')).toBe(false);
    expect(FREEZE_EXEMPT_KEYS.has('name')).toBe(false);
  });
});
