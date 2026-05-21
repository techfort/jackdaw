import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { ProjectDashboard } from './ProjectDashboard';

const { listUserProjectsMock, useStoreMock } = vi.hoisted(() => ({
  listUserProjectsMock: vi.fn().mockResolvedValue([]),
  useStoreMock: vi.fn(),
}));

vi.mock('../services/storage', () => ({
  storageService: {
    listUserProjects: listUserProjectsMock,
    listSongs: vi.fn().mockResolvedValue([]),
    createProject: vi.fn(),
    saveSong: vi.fn(),
    getSong: vi.fn(),
    deleteProject: vi.fn(),
    deleteSong: vi.fn(),
  },
}));

vi.mock('../store', () => ({
  useStore: () => useStoreMock(),
}));

vi.mock('../lib/sharedAudioContext', () => ({
  getSharedAudioContext: () => ({
    decodeAudioData: vi.fn(),
  }),
}));

vi.mock('motion/react', () => ({
  motion: {
    div: (props: any) => <div {...props} />,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('ProjectDashboard project loading', () => {
  beforeEach(() => {
    listUserProjectsMock.mockClear();
    useStoreMock.mockReset();
  });

  it('reloads project list when auth user becomes available after initial render', async () => {
    const loadSong = vi.fn();

    useStoreMock
      .mockReturnValueOnce({ loadSong, currentUser: null })
      .mockReturnValue({ loadSong, currentUser: { id: 'user-1', name: 'User One' } });

    const { rerender } = render(<ProjectDashboard />);

    await waitFor(() => {
      expect(listUserProjectsMock).toHaveBeenCalledTimes(1);
    });

    rerender(<ProjectDashboard />);

    await waitFor(() => {
      expect(listUserProjectsMock).toHaveBeenCalledTimes(2);
    });
  });
});
