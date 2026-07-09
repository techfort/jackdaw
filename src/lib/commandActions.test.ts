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

const { triggerFileImportMock } = vi.hoisted(() => ({
  triggerFileImportMock: vi.fn(),
}));

vi.mock('../hooks/useFileImport', () => ({
  triggerFileImport: triggerFileImportMock,
}));

import {
  addCommentFromCommand,
  executeTerminalCommand,
  DEFAULT_TERMINAL_WIDTH_PX,
  DEFAULT_TERMINAL_HEIGHT_PX,
} from './commandActions';

const setViewport = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
};

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
          isMuted: false,
          isSoloed: false,
          clips: [{ id: 'c1', offset: 0, duration: 20, audioStart: 0, isMuted: false, buffer: {} }],
        },
        {
          id: 'track-2',
          name: 'Pad',
          isMuted: true,
          isSoloed: false,
          clips: [{ id: 'c2', offset: 0, duration: 20, audioStart: 0, isMuted: false, buffer: {} }],
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
          isMuted: false,
          isSoloed: false,
          clips: [{ id: 'c1', offset: 0, duration: 20, audioStart: 0, isMuted: false, buffer: {} }],
        },
        {
          id: 'track-2',
          name: 'Drums',
          isMuted: false,
          isSoloed: false,
          clips: [{ id: 'c2', offset: 0, duration: 20, audioStart: 0, isMuted: false, buffer: {} }],
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
          isMuted: false,
          isSoloed: false,
          clips: [{ id: 'c1', offset: 0, duration: 20, audioStart: 0, isMuted: false, buffer: {} }],
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
          status: 'open' as const,
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

  it('volup alias raises selected track by default step when no amount given', async () => {
    const updateTrack = vi.fn();
    getStateMock.mockReturnValue({
      selectedTrackId: 'track-1',
      tracks: [{ id: 'track-1', name: 'Bass', volume: 0.5 }],
      updateTrack,
    });

    const result = await executeTerminalCommand('volup');

    expect(result.ok).toBe(true);
    expect(updateTrack).toHaveBeenCalledWith('track-1', { volume: 0.6 });
  });

  it('voldown alias lowers named track by default step when no amount given', async () => {
    const updateTrack = vi.fn();
    getStateMock.mockReturnValue({
      selectedTrackId: null,
      tracks: [{ id: 'track-1', name: 'Drums', volume: 0.8 }],
      updateTrack,
    });

    const result = await executeTerminalCommand('voldown Drums');

    expect(result.ok).toBe(true);
    expect(updateTrack).toHaveBeenCalledWith('track-1', { volume: expect.closeTo(0.7, 5) });
  });

  it('bare track ref without amount uses default step', async () => {
    const updateTrack = vi.fn();
    getStateMock.mockReturnValue({
      selectedTrackId: null,
      tracks: [{ id: 'track-1', name: 'Bass', volume: 0.5 }],
      updateTrack,
    });

    const result = await executeTerminalCommand('vu Bass');

    expect(result.ok).toBe(true);
    expect(updateTrack).toHaveBeenCalledWith('track-1', { volume: 0.6 });
  });

  it('volup with explicit track ref and amount', async () => {
    const updateTrack = vi.fn();
    getStateMock.mockReturnValue({
      selectedTrackId: null,
      tracks: [{ id: 'track-1', name: 'Lead', volume: 0.3 }],
      updateTrack,
    });

    const result = await executeTerminalCommand('volup Lead 0.2');

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
      .mockReturnValueOnce({ aliasMap: {} }) // alias-expansion lookup
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
      .mockReturnValueOnce({ aliasMap: {} }) // alias-expansion lookup
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

  it('toggles spectrum window with spectrum command', async () => {
    const setSpectrumOpen = vi.fn();
    getStateMock
      .mockReturnValueOnce({ aliasMap: {} }) // alias-expansion lookup (1st call)
      .mockReturnValueOnce({ isSpectrumOpen: false, setSpectrumOpen })
      .mockReturnValueOnce({ aliasMap: {} }) // alias-expansion lookup (2nd call)
      .mockReturnValueOnce({ isSpectrumOpen: true, setSpectrumOpen });

    let result = await executeTerminalCommand('spectrum');
    expect(result.ok).toBe(true);
    expect(setSpectrumOpen).toHaveBeenCalledWith(true);
    expect(result.message).toContain('Opened');

    result = await executeTerminalCommand('spec');
    expect(result.ok).toBe(true);
    expect(setSpectrumOpen).toHaveBeenCalledWith(false);
    expect(result.message).toContain('Closed');
  });

  it('unread returns "No unread notes" when all comments are seen', async () => {
    getStateMock.mockReturnValue({
      comments: [{ id: '1', status: 'open', userName: 'Alice', text: 'Fix this' }],
      seenCommentIds: ['1'],
    });
    const result = await executeTerminalCommand('unread');
    expect(result.ok).toBe(true);
    expect(result.message).toBe('No unread notes.');
  });

  it('unread lists unseen open comments', async () => {
    getStateMock.mockReturnValue({
      comments: [
        { id: '1', status: 'open', userName: 'Alice', text: 'Fix this' },
        { id: '2', status: 'approved', userName: 'Bob', text: 'Done' },
        { id: '3', status: 'in_progress', userName: 'Charlie', text: 'Working on it' },
      ],
      seenCommentIds: [],
    });
    const result = await executeTerminalCommand('unread');
    expect(result.ok).toBe(true);
    expect(result.message).toContain('2 unread');
    expect(result.message).toContain('#1');
    expect(result.message).toContain('#3');
    expect(result.message).not.toContain('#2');
  });

  it('termopt reset clears custom position and size', async () => {
    const setTerminalPos = vi.fn();
    const setTerminalSize = vi.fn();
    getStateMock.mockReturnValue({ setTerminalPos, setTerminalSize });

    const result = await executeTerminalCommand('termopt reset');

    expect(result.ok).toBe(true);
    expect(setTerminalPos).toHaveBeenCalledWith(null);
    expect(setTerminalSize).toHaveBeenCalledWith(null);
  });

  it('termopt size sets a valid width/height', async () => {
    setViewport(2000, 2000);
    const setTerminalSize = vi.fn();
    getStateMock.mockReturnValue({ terminalPos: null, setTerminalSize, setTerminalPos: vi.fn() });

    const result = await executeTerminalCommand('termopt size 40 50');

    expect(result.ok).toBe(true);
    expect(setTerminalSize).toHaveBeenCalledWith({ width: 40, height: 50 });
    expect(result.message).toBe('Terminal size set to 40.0% x 50.0% of viewport.');
  });

  it('termopt size floors below the default terminal dimensions', async () => {
    setViewport(1000, 1000);
    const setTerminalSize = vi.fn();
    getStateMock.mockReturnValue({ terminalPos: null, setTerminalSize, setTerminalPos: vi.fn() });

    const result = await executeTerminalCommand('termopt size 1 1');

    const expectedMinWidth = (DEFAULT_TERMINAL_WIDTH_PX / 1000) * 100;
    const expectedMinHeight = (DEFAULT_TERMINAL_HEIGHT_PX / 1000) * 100;
    expect(result.ok).toBe(true);
    expect(setTerminalSize).toHaveBeenCalledWith({ width: expectedMinWidth, height: expectedMinHeight });
  });

  it('termopt size caps at the max layout percentage', async () => {
    setViewport(1000, 1000);
    const setTerminalSize = vi.fn();
    getStateMock.mockReturnValue({ terminalPos: null, setTerminalSize, setTerminalPos: vi.fn() });

    const result = await executeTerminalCommand('termopt size 500 500');

    expect(result.ok).toBe(true);
    expect(setTerminalSize).toHaveBeenCalledWith({ width: 95, height: 95 });
  });

  it('termopt size re-clamps an existing custom position to stay on screen', async () => {
    setViewport(1000, 1000);
    const setTerminalSize = vi.fn();
    const setTerminalPos = vi.fn();
    getStateMock.mockReturnValue({
      terminalPos: { top: 80, left: 80 },
      setTerminalSize,
      setTerminalPos,
    });

    const result = await executeTerminalCommand('termopt size 60 60');

    expect(result.ok).toBe(true);
    expect(setTerminalSize).toHaveBeenCalledWith({ width: 60, height: 60 });
    expect(setTerminalPos).toHaveBeenCalledWith({ top: 35, left: 35 });
  });

  it('termopt size rejects non-numeric input', async () => {
    const setTerminalSize = vi.fn();
    getStateMock.mockReturnValue({ terminalPos: null, setTerminalSize, setTerminalPos: vi.fn() });

    const result = await executeTerminalCommand('termopt size abc 50');

    expect(result.ok).toBe(false);
    expect(setTerminalSize).not.toHaveBeenCalled();
  });

  it('termopt pos sets a valid position', async () => {
    setViewport(1000, 1000);
    const setTerminalPos = vi.fn();
    getStateMock.mockReturnValue({ terminalSize: { width: 40, height: 50 }, setTerminalPos });

    const result = await executeTerminalCommand('termopt pos 10 10');

    expect(result.ok).toBe(true);
    expect(setTerminalPos).toHaveBeenCalledWith({ top: 10, left: 10 });
    expect(result.message).toBe('Terminal position set to 10.0% from top, 10.0% from left.');
  });

  it('termopt pos clamps to keep the window fully on screen given the current size', async () => {
    setViewport(1000, 1000);
    const setTerminalPos = vi.fn();
    getStateMock.mockReturnValue({ terminalSize: { width: 40, height: 50 }, setTerminalPos });

    const result = await executeTerminalCommand('termopt pos 90 90');

    expect(result.ok).toBe(true);
    // max top = 95 - 50 (height) = 45; max left = 95 - 40 (width) = 55
    expect(setTerminalPos).toHaveBeenCalledWith({ top: 45, left: 55 });
  });

  it('termopt pos rejects non-numeric input', async () => {
    const setTerminalPos = vi.fn();
    getStateMock.mockReturnValue({ terminalSize: null, setTerminalPos });

    const result = await executeTerminalCommand('termopt pos x y');

    expect(result.ok).toBe(false);
    expect(setTerminalPos).not.toHaveBeenCalled();
  });

  it('bare termopt reports usage', async () => {
    getStateMock.mockReturnValue({});

    const result = await executeTerminalCommand('termopt');

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Usage: termopt');
  });

  it('record starts recording when a track is armed', async () => {
    const startRecording = vi.fn().mockResolvedValue(undefined);
    getStateMock.mockReturnValue({
      isRecording: false,
      tracks: [{ id: 't1', isArmed: true }],
      startRecording,
    });

    const result = await executeTerminalCommand('record');

    expect(result.ok).toBe(true);
    expect(startRecording).toHaveBeenCalled();
    expect(result.message).toBe('Recording started.');
  });

  it('record refuses to start without an armed track', async () => {
    const startRecording = vi.fn();
    getStateMock.mockReturnValue({
      isRecording: false,
      tracks: [{ id: 't1', isArmed: false }],
      startRecording,
    });

    const result = await executeTerminalCommand('record');

    expect(result.ok).toBe(false);
    expect(startRecording).not.toHaveBeenCalled();
  });

  it('record stops an in-progress recording', async () => {
    const stopRecording = vi.fn().mockResolvedValue(undefined);
    getStateMock.mockReturnValue({
      isRecording: true,
      tracks: [],
      stopRecording,
    });

    const result = await executeTerminalCommand('record');

    expect(result.ok).toBe(true);
    expect(stopRecording).toHaveBeenCalled();
    expect(result.message).toBe('Recording stopped.');
  });

  it('save persists the current song via saveNow', async () => {
    const saveNow = vi.fn().mockResolvedValue(undefined);
    getStateMock.mockReturnValue({
      currentSongId: 'song-1',
      currentSongName: 'My Song',
      saveNow,
    });

    const result = await executeTerminalCommand('save');

    expect(result.ok).toBe(true);
    expect(saveNow).toHaveBeenCalled();
    expect(result.message).toBe('Saved "My Song".');
  });

  it('save reports an error when no song is loaded', async () => {
    const saveNow = vi.fn();
    getStateMock.mockReturnValue({ currentSongId: null, saveNow });

    const result = await executeTerminalCommand('save');

    expect(result.ok).toBe(false);
    expect(saveNow).not.toHaveBeenCalled();
  });

  it('save surfaces a save failure', async () => {
    const saveNow = vi.fn().mockRejectedValue(new Error('offline'));
    getStateMock.mockReturnValue({ currentSongId: 'song-1', currentSongName: 'X', saveNow });

    const result = await executeTerminalCommand('save');

    expect(result.ok).toBe(false);
    expect(result.message).toBe('offline');
  });

  it('import opens the file picker', async () => {
    getStateMock.mockReturnValue({});
    triggerFileImportMock.mockClear();

    const result = await executeTerminalCommand('import');

    expect(result.ok).toBe(true);
    expect(triggerFileImportMock).toHaveBeenCalled();
  });

  it('tool switches the active editing tool', async () => {
    const setTool = vi.fn();
    getStateMock.mockReturnValue({ setTool });

    const result = await executeTerminalCommand('tool scissors');

    expect(result.ok).toBe(true);
    expect(setTool).toHaveBeenCalledWith('scissors');
  });

  it('tool rejects an unknown tool name', async () => {
    const setTool = vi.fn();
    getStateMock.mockReturnValue({ setTool });

    const result = await executeTerminalCommand('tool laser');

    expect(result.ok).toBe(false);
    expect(setTool).not.toHaveBeenCalled();
  });

  it('snap toggles snap-to-grid', async () => {
    const setSnapEnabled = vi.fn();
    getStateMock.mockReturnValue({ snapEnabled: false, setSnapEnabled });

    const result = await executeTerminalCommand('snap');

    expect(result.ok).toBe(true);
    expect(setSnapEnabled).toHaveBeenCalledWith(true);
  });

  it('follow toggles follow-playhead', async () => {
    const setFollowPlayhead = vi.fn();
    getStateMock.mockReturnValue({ followPlayhead: true, setFollowPlayhead });

    const result = await executeTerminalCommand('follow');

    expect(result.ok).toBe(true);
    expect(setFollowPlayhead).toHaveBeenCalledWith(false);
  });

  it('mixer toggles the mixer panel', async () => {
    const setShowMixer = vi.fn();
    getStateMock.mockReturnValue({ showMixer: false, setShowMixer });

    const result = await executeTerminalCommand('mixer');

    expect(result.ok).toBe(true);
    expect(setShowMixer).toHaveBeenCalledWith(true);
  });

  it('tempo sheet toggles the tempo sheet panel', async () => {
    const setShowTempoSheet = vi.fn();
    getStateMock.mockReturnValue({ showTempoSheet: false, setShowTempoSheet });

    const result = await executeTerminalCommand('tempo sheet');

    expect(result.ok).toBe(true);
    expect(setShowTempoSheet).toHaveBeenCalledWith(true);
  });

  it('tempo <bpm> still works after adding tempo sheet special-case', async () => {
    const setTempo = vi.fn();
    getStateMock.mockReturnValue({ setTempo, tempo: 140 });

    const result = await executeTerminalCommand('tempo 140');

    expect(result.ok).toBe(true);
    expect(setTempo).toHaveBeenCalledWith(140);
  });

  it('timeline switches the ruler display mode', async () => {
    const setTimelineMode = vi.fn();
    getStateMock.mockReturnValue({ setTimelineMode });

    const result = await executeTerminalCommand('timeline beats');

    expect(result.ok).toBe(true);
    expect(setTimelineMode).toHaveBeenCalledWith('beats');
  });

  it('timeline rejects an unknown mode', async () => {
    const setTimelineMode = vi.fn();
    getStateMock.mockReturnValue({ setTimelineMode });

    const result = await executeTerminalCommand('timeline grid');

    expect(result.ok).toBe(false);
    expect(setTimelineMode).not.toHaveBeenCalled();
  });

  it('go start jumps the playhead to 0', async () => {
    const goToStart = vi.fn();
    getStateMock.mockReturnValue({ goToStart, currentTime: 0 });

    const result = await executeTerminalCommand('go start');

    expect(result.ok).toBe(true);
    expect(goToStart).toHaveBeenCalled();
  });

  it('go end jumps the playhead to the project end', async () => {
    const goToEnd = vi.fn();
    getStateMock.mockReturnValue({ goToEnd, currentTime: 42 });

    const result = await executeTerminalCommand('go end');

    expect(result.ok).toBe(true);
    expect(goToEnd).toHaveBeenCalled();
    expect(result.message).toContain('42.00s');
  });

  it('go <time> still works after adding go start/end special-cases', async () => {
    const setCurrentTime = vi.fn();
    getStateMock.mockReturnValue({ setCurrentTime, tempo: 120 });

    const result = await executeTerminalCommand('go 30');

    expect(result.ok).toBe(true);
    expect(setCurrentTime).toHaveBeenCalledWith(30);
  });

  it('resolve toggles a comment to approved', async () => {
    const toggleResolveComment = vi.fn();
    getStateMock.mockReturnValue({
      comments: [{ id: '1', status: 'open' }],
      toggleResolveComment,
    });

    const result = await executeTerminalCommand('resolve 1');

    expect(result.ok).toBe(true);
    expect(toggleResolveComment).toHaveBeenCalledWith('1');
    expect(result.message).toBe('Comment #1 resolved.');
  });

  it('resolve toggles an approved comment back to open', async () => {
    const toggleResolveComment = vi.fn();
    getStateMock.mockReturnValue({
      comments: [{ id: '1', status: 'approved' }],
      toggleResolveComment,
    });

    const result = await executeTerminalCommand('resolve 1');

    expect(result.ok).toBe(true);
    expect(result.message).toBe('Comment #1 reopened.');
  });

  it('resolve reports comment not found', async () => {
    const toggleResolveComment = vi.fn();
    getStateMock.mockReturnValue({ comments: [], toggleResolveComment });

    const result = await executeTerminalCommand('resolve 99');

    expect(result.ok).toBe(false);
    expect(toggleResolveComment).not.toHaveBeenCalled();
  });

  it('marker label sets a label on an existing marker', async () => {
    const setMarkerLabel = vi.fn();
    getStateMock.mockReturnValue({
      markers: { 1: 10, 2: null },
      setMarkerLabel,
    });

    const result = await executeTerminalCommand('marker 1 label "Chorus"');

    expect(result.ok).toBe(true);
    expect(setMarkerLabel).toHaveBeenCalledWith(1, 'Chorus');
  });

  it('marker label refuses to label an unset marker', async () => {
    const setMarkerLabel = vi.fn();
    getStateMock.mockReturnValue({
      markers: { 1: null, 2: null },
      setMarkerLabel,
    });

    const result = await executeTerminalCommand('marker 1 label "Chorus"');

    expect(result.ok).toBe(false);
    expect(setMarkerLabel).not.toHaveBeenCalled();
  });

  it('marker <n> <time> still works after adding the label special-case', async () => {
    const setMarker = vi.fn();
    getStateMock.mockReturnValue({ setMarker, tempo: 120 });

    const result = await executeTerminalCommand('marker 1 5');

    expect(result.ok).toBe(true);
    expect(setMarker).toHaveBeenCalledWith(1, 5);
  });

  it('activity returns "No activity yet" when log is empty', async () => {
    getStateMock.mockReturnValue({ activityEvents: [] });
    const result = await executeTerminalCommand('activity');
    expect(result.ok).toBe(true);
    expect(result.message).toBe('No activity yet.');
  });

  it('renames a track by local id via rn command', async () => {
    const updateTrack = vi.fn();
    getStateMock.mockReturnValue({
      tracks: [{ id: 'track-1', name: 'Bass' }],
      updateTrack,
    });

    const result = await executeTerminalCommand('rn 1 "Upright Bass"');

    expect(result.ok).toBe(true);
    expect(updateTrack).toHaveBeenCalledWith('track-1', { name: 'Upright Bass' });
    expect(result.message).toBe('Renamed track "Bass" (id: 1) to "Upright Bass".');
  });

  it('renames a track by quoted current name via rn command', async () => {
    const updateTrack = vi.fn();
    getStateMock.mockReturnValue({
      tracks: [{ id: 'track-1', name: 'Old Name' }],
      updateTrack,
    });

    const result = await executeTerminalCommand('rn "Old Name" "New Name"');

    expect(result.ok).toBe(true);
    expect(updateTrack).toHaveBeenCalledWith('track-1', { name: 'New Name' });
  });

  it('rn reports track not found', async () => {
    const updateTrack = vi.fn();
    getStateMock.mockReturnValue({
      tracks: [{ id: 'track-1', name: 'Bass' }],
      updateTrack,
    });

    const result = await executeTerminalCommand('rn Drums "New Name"');

    expect(result.ok).toBe(false);
    expect(result.message).toBe('Track not found: Drums');
    expect(updateTrack).not.toHaveBeenCalled();
  });

  it('rn rejects a blank new name', async () => {
    const updateTrack = vi.fn();
    getStateMock.mockReturnValue({
      tracks: [{ id: 'track-1', name: 'Bass' }],
      updateTrack,
    });

    const result = await executeTerminalCommand('rn 1 "   "');

    expect(result.ok).toBe(false);
    expect(result.message).toBe('New track name is required.');
    expect(updateTrack).not.toHaveBeenCalled();
  });

  it('activity shows recent events in reverse-chronological order', async () => {
    getStateMock.mockReturnValue({
      activityEvents: [
        { id: 'a', kind: 'track_added', actor: { userId: 'u1', userName: 'Alice' }, timestamp: 1000, payload: {} },
        { id: 'b', kind: 'comment_added', actor: { userId: 'u2', userName: 'Bob' }, timestamp: 2000, payload: {} },
      ],
    });
    const result = await executeTerminalCommand('activity 5');
    expect(result.ok).toBe(true);
    expect(result.message).toContain('Bob');
    expect(result.message).toContain('comment added');
    const lines = result.message.split('\n');
    expect(lines[0]).toContain('Bob');
  });
});
