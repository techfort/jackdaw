import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const setCommentStatusMock = vi.fn();
const useStoreMock = vi.fn();

vi.mock('../store', () => ({
  useStore: (selector?: (s: any) => any) => {
    const state = useStoreMock();
    return selector ? selector(state) : state;
  },
}));

vi.mock('../services/storage', () => ({
  authService: { getCurrentUser: () => null },
  storageMode: 'local',
}));

vi.mock('./MembersPanel', () => ({
  MembersPanel: () => <div data-testid="members-panel" />,
}));

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { CollaborationPanel } from './CollaborationPanel';

const baseComment = {
  id: 'c1',
  text: 'Needs more reverb',
  trackId: 't1',
  timestamp: 10,
  userId: 'u1',
  userName: 'Alice',
  status: 'open' as const,
  createdAt: Date.now(),
  tags: [],
  mentions: [],
  replies: [],
};

function buildState(overrides: Record<string, any> = {}) {
  return {
    comments: [baseComment],
    tracks: [{ id: 't1', name: 'Guitar', isMuted: false, isSoloed: false, buffer: null, clips: [] }],
    toggleResolveComment: vi.fn(),
    setCommentStatus: setCommentStatusMock,
    resolveComments: vi.fn(),
    removeComment: vi.fn(),
    setCurrentTime: vi.fn(),
    setSelectedTrackId: vi.fn(),
    currentTime: 0,
    currentUser: { id: 'u1', name: 'Alice' },
    markCommentsSeen: vi.fn(),
    addReply: vi.fn(),
    remotePresences: [],
    ...overrides,
  };
}

describe('CollaborationPanel — comment status dropdown', () => {
  beforeEach(() => {
    setCommentStatusMock.mockReset();
    useStoreMock.mockReturnValue(buildState());
  });

  it('shows the current status as the button label', () => {
    render(<CollaborationPanel onClose={vi.fn()} />);
    const btn = screen.getByTitle('Set comment status');
    expect(btn.textContent).toBe('open');
  });

  it('opens the dropdown when the status button is clicked', async () => {
    render(<CollaborationPanel onClose={vi.fn()} />);

    fireEvent.click(screen.getByTitle('Set comment status'));

    await waitFor(() => {
      expect(screen.queryAllByRole('button').some(b => b.textContent?.match(/in progress/i))).toBe(true);
    });
  });

  it('displays all four status options in the dropdown', async () => {
    render(<CollaborationPanel onClose={vi.fn()} />);

    fireEvent.click(screen.getByTitle('Set comment status'));

    await waitFor(() => {
      const labels = screen.queryAllByRole('button').map(b => b.textContent?.toLowerCase() ?? '');
      expect(labels.some(l => l === 'open')).toBe(true);
      expect(labels.some(l => l === 'in progress')).toBe(true);
      expect(labels.some(l => l === 'needs review')).toBe(true);
      expect(labels.some(l => l === 'approved')).toBe(true);
    });
  });

  it('calls setCommentStatus with the correct arguments when an option is clicked', async () => {
    render(<CollaborationPanel onClose={vi.fn()} />);

    fireEvent.click(screen.getByTitle('Set comment status'));

    await waitFor(() => {
      expect(screen.queryAllByRole('button').some(b => b.textContent?.match(/in progress/i))).toBe(true);
    });

    const inProgressBtn = screen.queryAllByRole('button').find(b => b.textContent?.match(/in progress/i))!;
    fireEvent.click(inProgressBtn);

    expect(setCommentStatusMock).toHaveBeenCalledWith('c1', 'in_progress');
  });

  it('closes the dropdown after selecting an option', async () => {
    render(<CollaborationPanel onClose={vi.fn()} />);

    fireEvent.click(screen.getByTitle('Set comment status'));

    await waitFor(() => {
      expect(screen.queryAllByRole('button').some(b => b.textContent?.match(/in progress/i))).toBe(true);
    });

    const inProgressBtn = screen.queryAllByRole('button').find(b => b.textContent?.match(/in progress/i))!;
    fireEvent.click(inProgressBtn);

    await waitFor(() => {
      expect(screen.queryAllByRole('button').some(b => b.textContent?.match(/in progress/i))).toBe(false);
    });
  });

  it('closes the dropdown when clicking outside', async () => {
    render(<CollaborationPanel onClose={vi.fn()} />);

    fireEvent.click(screen.getByTitle('Set comment status'));

    await waitFor(() => {
      expect(screen.queryAllByRole('button').some(b => b.textContent?.match(/in progress/i))).toBe(true);
    });

    fireEvent.click(document.body);

    await waitFor(() => {
      expect(screen.queryAllByRole('button').some(b => b.textContent?.match(/in progress/i))).toBe(false);
    });
  });
});
