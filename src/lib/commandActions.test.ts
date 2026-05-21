import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getStateMock } = vi.hoisted(() => ({
  getStateMock: vi.fn(),
}));

vi.mock('../store', () => {
  const useStore: any = () => ({});
  useStore.getState = getStateMock;
  return { useStore };
});

import { addCommentFromCommand } from './commandActions';

describe('addCommentFromCommand auto track resolution', () => {
  beforeEach(() => {
    getStateMock.mockReset();
  });

  it('auto-targets the only playable track when no selection is present', () => {
    const addComment = vi.fn();
    getStateMock.mockReturnValue({
      currentTime: 12,
      selectedTrackId: null,
      tracks: [
        {
          id: 'track-1',
          name: 'Bass',
          buffer: {},
          isMuted: false,
          isSoloed: false,
          clips: [{ id: 'c1', offset: 0, duration: 20, audioStart: 0, isMuted: false }],
        },
        {
          id: 'track-2',
          name: 'Pad',
          buffer: {},
          isMuted: true,
          isSoloed: false,
          clips: [{ id: 'c2', offset: 0, duration: 20, audioStart: 0, isMuted: false }],
        },
      ],
      addComment,
    });

    const result = addCommentFromCommand('great take');

    expect(result.ok).toBe(true);
    expect(addComment).toHaveBeenCalledWith('track-1', 12, 'great take');
  });

  it('returns explicit selection error when multiple tracks could play', () => {
    const addComment = vi.fn();
    getStateMock.mockReturnValue({
      currentTime: 8,
      selectedTrackId: null,
      tracks: [
        {
          id: 'track-1',
          name: 'Bass',
          buffer: {},
          isMuted: false,
          isSoloed: false,
          clips: [{ id: 'c1', offset: 0, duration: 20, audioStart: 0, isMuted: false }],
        },
        {
          id: 'track-2',
          name: 'Drums',
          buffer: {},
          isMuted: false,
          isSoloed: false,
          clips: [{ id: 'c2', offset: 0, duration: 20, audioStart: 0, isMuted: false }],
        },
      ],
      addComment,
    });

    const result = addCommentFromCommand('too loud');

    expect(result.ok).toBe(false);
    expect(result.message).toBe('select a track before commenting');
    expect(addComment).not.toHaveBeenCalled();
  });
});
