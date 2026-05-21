/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect } from 'react';
import { useStore, useProjectDuration } from './store';
import { useAudioEngine } from './hooks/useAudioEngine';
import { useFileImport } from './hooks/useFileImport';
import { usePresenceSync } from './hooks/usePresenceSync';
import { Toolbar } from './components/Toolbar';
import { authService, storageMode } from './services/storage';
import { TimelineRuler } from './components/TimelineRuler';
import { TrackItem } from './components/TrackItem';
import { Dropzone } from './components/Dropzone';
import { Mixer } from './components/Mixer';
import { CollaborationPanel } from './components/CollaborationPanel';
import { CollaborativeCursors } from './components/CollaborativeCursors';
import { ProjectDashboard } from './components/ProjectDashboard';
import { InviteAccept } from './components/InviteAccept';
import { CommandTerminal } from './components/CommandTerminal';
import { Users, LayoutDashboard } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const Playhead: React.FC = () => {
  const currentTime = useStore(state => state.currentTime);
  const zoom = useStore(state => state.zoom);
  
  const safeCurrentTime = Number(currentTime) || 0;
  const safeZoom = Number(zoom) || 100;
  
  return (
    <div 
      className="absolute top-0 bottom-0 w-[2px] bg-[var(--color-playhead)] z-50 pointer-events-none duration-0 shadow-[0_0_15px_rgba(242,125,38,0.5)]"
      style={{ 
        transform: `translateX(${256 + safeCurrentTime * safeZoom}px)`,
        height: '100%'
      }}
    >
       <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[10px] border-t-[var(--color-playhead)] -ml-[7px]" />
    </div>
  );
};

const FollowPlayheadLogic: React.FC = () => {
  const currentTime = useStore(state => state.currentTime);
  const zoom = useStore(state => state.zoom);
  const followPlayhead = useStore(state => state.followPlayhead);
  const isPlaying = useStore(state => state.isPlaying);

  useEffect(() => {
    if (followPlayhead && isPlaying) {
      const viewport = document.getElementById('jackdaw-viewport');
      if (viewport) {
        const x = currentTime * zoom;
        const scrollLeft = viewport.scrollLeft;
        const width = viewport.clientWidth - 300;
        if (x > scrollLeft + width || x < scrollLeft) {
          viewport.scrollLeft = x - 100;
        }
      }
    }
  }, [currentTime, zoom, followPlayhead, isPlaying]);

  return null;
};

export default function App() {
  const tracks = useStore(state => state.tracks);
  const currentTime = useStore(state => state.currentTime);
  const setCurrentTime = useStore(state => state.setCurrentTime);
  const zoom = useStore(state => state.zoom);
  const setZoom = useStore(state => state.setZoom);
  const snapEnabled = useStore(state => state.snapEnabled);
  const tempo = useStore(state => state.tempo);
  const timelineMode = useStore(state => state.timelineMode);
  const isPlaying = useStore(state => state.isPlaying);
  const followPlayhead = useStore(state => state.followPlayhead);
  const currentProjectId = useStore(state => state.currentProjectId);
  const currentSongId = useStore(state => state.currentSongId);
  const syncSong = useStore(state => state.syncSong);
  const isSyncing = useStore(state => state.isSyncing);
  const remotePresences = useStore(state => state.remotePresences);
  const setMarker = useStore(state => state.setMarker);
  const goToStart = useStore(state => state.goToStart);
  const goToEnd = useStore(state => state.goToEnd);
  const seek = useStore(state => state.seek);
  const markers = useStore(state => state.markers);
  const showMixer = useStore(state => state.showMixer);
  const setShowMixer = useStore(state => state.setShowMixer);

  const [showCollaboration, setShowCollaboration] = React.useState(false);
  const [inviteParams, setInviteParams] = React.useState<{ inviteId: string; projectId: string } | null>(null);
  const [showSignInGate, setShowSignInGate] = React.useState(false);
  const [signInEmail, setSignInEmail] = React.useState('');
  const [signInSent, setSignInSent] = React.useState(false);
  const [signInError, setSignInError] = React.useState('');
  const { importFiles } = useFileImport();

  const projectDuration = useProjectDuration();

  const rewindInterval = useRef<any>(null);
  const forwardInterval = useRef<any>(null);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input/textarea
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      const key = e.key.toLowerCase();
      
      const state = useStore.getState();
      
      if (key === 'h') {
        state.goToStart();
      } else if (key === 'e') {
        state.goToEnd();
      } else if (key === '1') {
        if (e.shiftKey) state.setMarker(1, null);
        else state.setMarker(1, state.currentTime || 0);
      } else if (key === '2') {
        if (e.shiftKey) state.setMarker(2, null);
        else state.setMarker(2, state.currentTime || 0);
      } else if (key === 'r' && !rewindInterval.current) {
        state.seek(-1); // Immediate seek
        rewindInterval.current = setInterval(() => useStore.getState().seek(-0.5), 50);
      } else if (key === 'f' && !forwardInterval.current) {
        state.seek(1); // Immediate seek
        forwardInterval.current = setInterval(() => useStore.getState().seek(0.5), 50);
      } else if (key === ' ') {
        e.preventDefault();
        try {
          state.setIsPlaying(!state.isPlaying);
        } catch (err) {
          console.error("Failed to toggle playback:", err);
        }
      } else if (key === 'escape') {
        state.setCommentDraft(null);
      } else if (key === 'c') {
        e.preventDefault();
        const trackId = state.selectedTrackId || (state.tracks.length > 0 ? state.tracks[0].id : null);
        if (trackId) {
          state.setCommentDraft({ 
            trackId, 
            timestamp: state.currentTime 
          });
        }
      } else if (key === 'i') {
        e.preventDefault();
        importFiles(state.currentTime);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'r') {
        if (rewindInterval.current) {
          clearInterval(rewindInterval.current);
          rewindInterval.current = null;
        }
      } else if (key === 'f') {
        if (forwardInterval.current) {
          clearInterval(forwardInterval.current);
          forwardInterval.current = null;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (rewindInterval.current) clearInterval(rewindInterval.current);
      if (forwardInterval.current) clearInterval(forwardInterval.current);
    };
  }, []); // Only set up once

  const currentSongIdForRender = useStore(state => state.currentSongId);

  useAudioEngine(); // Initialize audio engine
  usePresenceSync(); // Throttled presence updates

  // Auth Initialization
  useEffect(() => {
    const unsubscribe = authService.onAuthStateChanged((user) => {
      useStore.getState().setCurrentUser(user);
      if (storageMode === 'firebase') {
        setShowSignInGate(!user);
      }
    });

    if ((authService as any).completeMagicLinkSignIn) {
      // Firebase mode: complete any in-progress magic link sign-in
      (authService as any).completeMagicLinkSignIn()
        .then((user: any) => {
          if (user) {
            const params = new URLSearchParams(window.location.search);
            const inviteId = params.get('invite');
            const projectId = params.get('project');
            if (inviteId && projectId) {
              setInviteParams({ inviteId, projectId });
            }
          }
        })
        .catch(console.error);
    } else {
      // Local mode: auto-sign in anonymously if no user
      if (!authService.getCurrentUser()) {
        authService.anonymousSignIn().catch(console.error);
      }
    }

    return () => unsubscribe();
  }, []);

  // Handle Sync side-effects — watches both projectId and songId
  useEffect(() => {
    if (currentProjectId && currentSongId) {
      const unsubscribe = syncSong(currentProjectId, currentSongId);
      return () => unsubscribe();
    }
  }, [currentProjectId, currentSongId, syncSong]);

  const viewportRef = useRef<HTMLDivElement>(null);

  // Zoom and Scroll handlers
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (!viewportRef.current) return;

      if (e.ctrlKey || e.metaKey) {
        // Horizontal Move with Ctrl+Scrolling
        e.preventDefault();
        viewportRef.current.scrollLeft += e.deltaY;
      } else {
        // Zoom with Scrolling
        e.preventDefault();
        const delta = -e.deltaY;
        const zoomFactor = delta > 0 ? 1.1 : 0.9;
        setZoom(zoom * zoomFactor);
      }
    };

    const viewport = viewportRef.current;
    if (viewport) {
      viewport.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => {
      if (viewport) {
        viewport.removeEventListener('wheel', handleWheel);
      }
    };
  }, [zoom, setZoom]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signInEmail.trim()) return;
    setSignInError('');
    try {
      await authService.signInMagicLink(signInEmail.trim());
      setSignInSent(true);
    } catch (err: any) {
      setSignInError(err.message || 'Failed to send sign-in link');
    }
  };

  if (!showSignInGate && !currentSongIdForRender) {
    return (
      <>
        <ProjectDashboard />
        <AnimatePresence>
          {inviteParams && (
            <InviteAccept
              inviteId={inviteParams.inviteId}
              projectId={inviteParams.projectId}
              onAccepted={() => setInviteParams(null)}
              onDismiss={() => setInviteParams(null)}
            />
          )}
        </AnimatePresence>
      </>
    );
  }

  if (showSignInGate) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--color-bg-deep)] text-[#adbac7]">
        <div className="w-full max-w-sm p-8 bg-[var(--color-bg-sidebar)] border border-[var(--color-border-main)] rounded-xl shadow-2xl">
          <h1 className="text-xl font-black uppercase tracking-widest mb-1 text-white">JackDAW</h1>
          <p className="text-xs text-[var(--color-text-muted)] mb-8">Sign in to collaborate</p>
          {signInSent ? (
            <p className="text-sm text-[var(--color-accent)] font-bold">
              Check your email — a sign-in link is on its way to {signInEmail}.
            </p>
          ) : (
            <form onSubmit={handleSignIn} className="space-y-4">
              <input
                type="email"
                value={signInEmail}
                onChange={e => setSignInEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full bg-[var(--color-bg-deep)] border border-[var(--color-border-inner)] rounded px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-accent)]"
              />
              {signInError && <p className="text-xs text-red-400">{signInError}</p>}
              <button
                type="submit"
                className="w-full bg-[var(--color-accent)] text-black font-black uppercase tracking-widest text-xs py-2.5 rounded hover:brightness-110 transition-all"
              >
                Send Sign-in Link
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-screen flex flex-col font-sans select-none overflow-hidden bg-[var(--color-bg-deep)] text-[#adbac7] dark"
      id="jackdaw-root"
      onContextMenu={(e) => e.preventDefault()}
    >
      <FollowPlayheadLogic />
      <Toolbar onToggleCollaboration={() => setShowCollaboration(!showCollaboration)} isCollaborationOpen={showCollaboration} />
      
      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <div 
            ref={viewportRef}
            id="jackdaw-viewport"
            className="flex-1 overflow-x-auto overflow-y-auto relative bg-[var(--color-bg-deep)]"
          >
            <div 
              className="relative min-h-full"
              style={{ width: `${256 + projectDuration * zoom}px` }}
            >
              {/* Ruler stays at top of scrollable area */}
              <div className="sticky top-0 z-30 flex bg-[var(--color-bg-deep)] border-b border-[var(--color-border-main)] w-full h-10">
                {/* Ruler Sidebar - Sticky Left */}
                <div className="w-64 bg-[var(--color-bg-sidebar)] border-r border-[var(--color-border-main)] z-40 flex items-center px-4 sticky left-0 shrink-0">
                  <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
                    <LayoutDashboard size={14} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Timeline</span>
                  </div>
                </div>
                {/* Ruler area */}
                <div className="flex-1 relative">
                   <TimelineRuler />
                </div>
              </div>

              {tracks.length === 0 ? (
                <div className="flex flex-col border-b border-[var(--color-border-main)] h-32 group relative">
                   <div className="w-64 bg-[var(--color-bg-sidebar)] border-r border-[var(--color-border-main)] p-4 flex flex-col justify-center shrink-0 z-20 sticky left-0 shadow-2xl">
                     <button 
                       onClick={() => {
                         const btn = document.querySelector('button[title^="Import Stems"]') as HTMLButtonElement;
                         if (btn) btn.click();
                       }}
                       className="w-full py-3 border-2 border-dashed border-[var(--color-border-main)] rounded-lg text-[var(--color-text-dark)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)]/50 hover:bg-[var(--color-accent)]/5 transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest"
                     >
                        <span className="text-lg">+</span>
                        Import First Stem
                     </button>
                   </div>
                   <div className="flex-1 flex items-center justify-center bg-[var(--color-bg-deep)]/40 italic text-[11px] uppercase font-bold tracking-[0.2em] text-[var(--color-text-dark)]/50">
                      Drop audio stems here to begin your session
                   </div>
                </div>
              ) : (
                <div className="relative">
                  <CollaborativeCursors />
                  {tracks.map(track => (
                    <TrackItem key={track.id} track={track} />
                  ))}
                  
                  {/* Add more stems button slot - appears after last track */}
                  <div className="flex h-24 border-b border-[var(--color-border-main)] group relative">
                    <div className="w-64 bg-[var(--color-bg-sidebar)] border-r border-[var(--color-border-main)] p-4 flex flex-col justify-center shrink-0 z-20 sticky left-0">
                      <button 
                        onClick={() => {
                          const btn = document.querySelector('button[title^="Import Stems"]') as HTMLButtonElement;
                          if (btn) btn.click();
                        }}
                        className="w-full py-2.5 border border-dashed border-[var(--color-border-main)] rounded-lg text-[var(--color-text-dark)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)]/50 hover:bg-[var(--color-accent)]/5 transition-all flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest"
                      >
                         <span className="text-base leading-none">+</span>
                         Import Stem
                      </button>
                    </div>
                    <div className="flex-1 bg-[var(--color-bg-deep)]/20" />
                  </div>
                </div>
              )}
    
              {/* Playhead */}
              <Playhead />

              {/* Markers */}
              {Object.entries(markers).map(([key, time]) => {
                const markerTime = Number(time);
                if (time === null || isNaN(markerTime)) return null;
                
                return (
                  <div 
                    key={key}
                    className="absolute top-0 bottom-0 w-[1px] bg-yellow-400/50 z-40 pointer-events-none group"
                    style={{ transform: `translateX(${256 + markerTime * (Number(zoom) || 100)}px)` }}
                  >
                    <div className="absolute -top-1 -left-2 w-4 h-4 bg-yellow-500 rounded-sm flex items-center justify-center text-[10px] text-black font-black shadow-lg">
                      {key}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Floating Mixer Panel */}
        <AnimatePresence>
          {showMixer && (
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute right-0 top-0 bottom-0 w-[400px] bg-[var(--color-bg-sidebar)] border-l border-[var(--color-border-main)] z-[100] shadow-2xl flex flex-col"
            >
              <div className="h-10 flex items-center justify-between px-4 border-b border-white/5 bg-black/20">
                <div className="flex items-center gap-2">
                  <LayoutDashboard size={14} className="text-[var(--color-accent)]" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-white">Full Mixer Console</span>
                </div>
                <button 
                  onClick={() => setShowMixer(false)}
                  className="p-1 hover:bg-white/10 rounded transition-colors text-white/40 hover:text-white"
                >
                  <span className="text-lg font-mono">×</span>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <Mixer />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collaboration Hub Panel */}
        <AnimatePresence>
          {showCollaboration && (
            <CollaborationPanel onClose={() => setShowCollaboration(false)} />
          )}
        </AnimatePresence>

        <CommandTerminal />
      </div>

      {/* Footer / Status Bar */}
      <footer className="h-8 border-t border-[var(--color-border-main)] bg-[var(--color-bg-deep)] px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-blue-400 animate-[pulse_1s_infinite]' : 'bg-[var(--color-accent)] animate-pulse'}`}></div>
            <span className="text-[10px] text-[var(--color-text-muted)] uppercase font-bold tracking-tight">
              {isSyncing ? 'Collaborating Live' : `${tracks.length} Channels Active`}
            </span>
          </div>
          {isSyncing && (
            <div className="flex items-center gap-2 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
              <Users size={12} className="text-blue-400" />
              <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">{remotePresences.length + 1} Online</span>
            </div>
          )}
          <span className="text-[10px] text-[var(--color-text-muted)] uppercase font-bold tracking-tight">44.1kHz / 32-bit Float</span>
        </div>
        <div className="flex items-center gap-4">
           <div className="flex items-center gap-2">
             <span className="text-[10px] text-[var(--color-text-muted)] uppercase font-bold">Zoom</span>
             <div 
               className="w-24 h-1.5 bg-[var(--color-bg-input)] rounded overflow-hidden cursor-pointer"
               onClick={(e) => {
                 const rect = e.currentTarget.getBoundingClientRect();
                 const x = e.clientX - rect.left;
                 const percentage = x / rect.width;
                 setZoom(percentage * 499.5 + 0.5); // 10 to 500 range
               }}
             >
               <div className="h-full bg-[var(--color-accent)]" style={{ width: `${((zoom - 0.5) / 499.5) * 100}%` }}></div>
             </div>
           </div>
           <span className="text-[10px] text-[var(--color-text-dark)] font-mono tracking-tighter">JACKDAW-ENGINE_V1</span>
        </div>
      </footer>

      {/* InviteAccept modal — can appear over the DAW too */}
      <AnimatePresence>
        {inviteParams && (
          <InviteAccept
            inviteId={inviteParams.inviteId}
            projectId={inviteParams.projectId}
            onAccepted={() => setInviteParams(null)}
            onDismiss={() => setInviteParams(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
