import { TrackData } from '../types';
import { Role } from '../services/storage/types';

export const FREEZE_EXEMPT_KEYS: ReadonlySet<string> = new Set(['isMuted', 'isSoloed', 'isFrozen']);

export const canManageFrozenTrack = (
  track: TrackData,
  currentUser: any,
  currentUserRole: Role | null,
): boolean => currentUser?.id === track.ownerId || currentUserRole === 'owner';
