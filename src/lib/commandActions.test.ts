import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getStateMock } = vi.hoisted(() => ({
  getStateMock: vi.fn(),
}));

const { inviteToProjectMock } = vi.hoisted(() => ({
  inviteToProjectMock: vi.fn(),
}));

const { exportMixdownMock } = vi.hoisted(() => ({
  exportMixdownMock: vi.fn(),
}));

vi.mock('../store', () => {
  const useStore: any = () => ({});
  useStore.getState = getStateMock;
  return { useStore };
});

vi.mock('../services/storage', () => ({
  storageService: {
    inviteToProject: inviteToProjectMock,
  },
}));

vi.mock('./exportUtils', () => ({
  exportMixdown: exportMixdownMock,
}));

import { addCommentFromCommand, executeTerminalCommand } from './commandActions';

describe('addCommentFromCommand auto track resolution', () => {
  beforeEach(() => {
    getStateMock.mockReset();
    inviteToProjectMock.mockReset();
    exportMixdownMock.mockReset();
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

  it('returns assigned comment id in terminal feedback', () => {
    const addComment = vi.fn().mockReturnValue('7');
    getStateMock.mockReturnValue({
      currentTime: 4,
      selectedTrackId: 'track-1',
      tracks: [
        {
          id: 'track-1',
          name: 'Lead',
          buffer: {},
          isMuted: false,
          isSoloed: false,
          clips: [{ id: 'c1', offset: 0, duration: 20, audioStart: 0, isMuted: false }],
        },
      ],
      addComment,
    });

    const result = addCommentFromCommand('vocal too bright');

    expect(result.ok).toBe(true);
    expect(result.message).toContain('Comment #7');
  });

  it('removes comment by id via rm c command', async () => {
    const removeComment = vi.fn();
    getStateMock.mockReturnValue({
      comments: [
        {
          id: '3',
          trackId: 'track-1',
          timestamp: 10,
          text: 'Need cleanup',
          userId: 'u1',
          userName: 'User',
          isResolved: false,
          createdAt: Date.now(),
        },
      ],
      removeComment,
    });

    const result = await executeTerminalCommand('rm c 3');

    expect(result.ok).toBe(true);
    expect(removeComment).toHaveBeenCalledWith('3');
  });

  it('invites collaborator by email in current project', async () => {
    inviteToProjectMock.mockResolvedValue({ id: 'inv-1' });
    getStateMock.mockReturnValue({
      currentProjectId: 'project-1',
    });

    const result = await executeTerminalCommand('invite  user@example.com ');

    expect(result.ok).toBe(true);
    expect(result.message).toBe('Invite sent to user@example.com.');
    expect(inviteToProjectMock).toHaveBeenCalledWith('project-1', 'user@example.com', 'editor');
  });

  it('returns validation message for malformed email', async () => {
    getStateMock.mockReturnValue({
      currentProjectId: 'project-1',
    });

    const result = await executeTerminalCommand('invite bad-email');

    expect(result.ok).toBe(false);
    expect(result.message).toBe('Invalid email: bad-email');
    expect(inviteToProjectMock).not.toHaveBeenCalled();
  });

  it('returns error if no project is loaded', async () => {
    getStateMock.mockReturnValue({
      currentProjectId: null,
    });

    const result = await executeTerminalCommand('invite user@example.com');

    expect(result.ok).toBe(false);
    expect(result.message).toBe('No project loaded.');
    expect(inviteToProjectMock).not.toHaveBeenCalled();
  });

  it('raises selected track volume by a float amount', async () => {
    const updateTrack = vi.fn();
    getStateMock.mockReturnValue({
      selectedTrackId: 'track-1',
      tracks: [
        {
          id: 'track-1',
          name: 'Lead',
          volume: 0.5,
        },
      ],
      updateTrack,
    });

    const result = await executeTerminalCommand('vu 0.125');

    expect(result.ok).toBe(true);
    expect(updateTrack).toHaveBeenCalledWith('track-1', { volume: 0.625 });
    expect(result.message).toContain('0.125');
  });

  it('lowers a referenced track volume by a float amount', async () => {
    const updateTrack = vi.fn();
    getStateMock.mockReturnValue({
      selectedTrackId: null,
      tracks: [
        {
          id: 'track-1',
          name: 'Bass',
          volume: 0.8,
        },
      ],
      updateTrack,
    });

    const result = await executeTerminalCommand('vd track-1 0.05');

    expect(result.ok).toBe(true);
    expect(updateTrack).toHaveBeenCalledWith('track-1', { volume: 0.75 });
    expect(result.message).toContain('0.050');
  });

  it('supports quoted track names for volume commands', async () => {
    const updateTrack = vi.fn();
    getStateMock.mockReturnValue({
      selectedTrackId: null,
      tracks: [
        {
          id: 'track-1',
          name: 'Lead Vox',
          volume: 0.4,
        },
      ],
      updateTrack,
    });

    const result = await executeTerminalCommand('vu "Lead Vox" 0.1');

    expect(result.ok).toBe(true);
    expect(updateTrack).toHaveBeenCalledWith('track-1', { volume: 0.5 });
  });

  it('rejects volume commands without a positive float', async () => {
    const updateTrack = vi.fn();
    getStateMock.mockReturnValue({
      selectedTrackId: 'track-1',
      tracks: [
        {
          id: 'track-1',
          name: 'Bass',
          volume: 0.8,
        },
      ],
      updateTrack,
    });

    const result = await executeTerminalCommand('vu 0');

    expect(result.ok).toBe(false);
    expect(result.message).toBe('Volume amount must be a positive number.');
    expect(updateTrack).not.toHaveBeenCalled();
  });

  it('surfaces storage invite errors (local mode unsupported)', async () => {
    inviteToProjectMock.mockRejectedValue(new Error('Invites are not supported in local mode'));
    getStateMock.mockReturnValue({
      currentProjectId: 'project-1',
    });

    const result = await executeTerminalCommand('invite user@example.com');

    expect(result.ok).toBe(false);
    expect(result.message).toBe('Invites are not supported in local mode');
  });

  it('exports full mixdown with e', async () => {
    const tracks = [{ id: 'track-1', name: 'Lead' }];
    getStateMock.mockReturnValue({ tracks, markers: { 1: null, 2: null } });

    const result = await executeTerminalCommand('e');

    expect(result.ok).toBe(true);
    expect(result.message).toBe('Exported full mixdown.');
    expect(exportMixdownMock).toHaveBeenCalledWith(tracks);
  });

  it('exports marker-bounded mixdown with e stem', async () => {
    const tracks = [{ id: 'track-1', name: 'Lead' }];
    getStateMock.mockReturnValue({ tracks, markers: { 1: 15, 2: 3 } });

    const result = await executeTerminalCommand('e stem');

    expect(result.ok).toBe(true);
    expect(result.message).toBe('Exported stem between markers (3.00s-15.00s).');
    expect(exportMixdownMock).toHaveBeenCalledWith(tracks, { startTime: 3, endTime: 15 });
  });

  it('fails e stem when marker range is not defined', async () => {
    const tracks = [{ id: 'track-1', name: 'Lead' }];
    getStateMock.mockReturnValue({ tracks, markers: { 1: 8, 2: null } });

    const result = await executeTerminalCommand('e stem');

    expect(result.ok).toBe(false);
    expect(result.message).toBe('Set markers 1 and 2 before using e stem.');
    expect(exportMixdownMock).not.toHaveBeenCalled();
  });

  it('fails export when there are no tracks', async () => {
    getStateMock.mockReturnValue({ tracks: [], markers: { 1: null, 2: null } });

    const result = await executeTerminalCommand('e');

    expect(result.ok).toBe(false);
    expect(result.message).toBe('No tracks to export.');
    expect(exportMixdownMock).not.toHaveBeenCalled();
  });

  it('zooms in with repeated plus signs', async () => {
    const setZoom = vi.fn();
    getStateMock
      .mockReturnValueOnce({ zoom: 100, setZoom })
      .mockReturnValueOnce({ zoom: 133.1 });

    const result = await executeTerminalCommand('+++');

    expect(result.ok).toBe(true);
    expect(setZoom).toHaveBeenCalledWith(133.10000000000005);
    expect(result.message).toContain('Zoomed in 3 steps');
  });

  it('zooms out with repeated minus signs', async () => {
    const setZoom = vi.fn();
    getStateMock
      .mockReturnValueOnce({ zoom: 100, setZoom })
      .mockReturnValueOnce({ zoom: 72.9 });

    const result = await executeTerminalCommand('---');

    expect(result.ok).toBe(true);
    expect(setZoom).toHaveBeenCalledWith(72.9);
    expect(result.message).toContain('Zoomed out 3 steps');
  });

  it('rejects mixed zoom signs', async () => {
    getStateMock.mockReturnValue({ zoom: 100, setZoom: vi.fn() });

    const result = await executeTerminalCommand('+-+');

    expect(result.ok).toBe(false);
    expect(result.message).toBe('Mixed zoom signs are not allowed.');
  });
});
