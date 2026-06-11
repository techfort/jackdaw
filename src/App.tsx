/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect } from 'react';
import { useStore, useProjectDuration } from './store';
import { useAudioEngine } from './hooks/useAudioEngine';
import { useClickTrack } from './hooks/useClickTrack';
import { useFileImport } from './hooks/useFileImport';
import { usePresenceSync } from './hooks/usePresenceSync';
import { useOnlineSync } from './hooks/useOnlineSync';
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
import { SignInGate } from './components/SignInGate';
import { CommandTerminal } from './components/CommandTerminal';
import { AudioSpectrumWindow } from './components/AudioSpectrumWindow';
import { CheatSheetBar } from './components/CheatSheetBar';
import { checkBrowserCompat } from './lib/browserCompat';
import { Users, LayoutDashboard } from 'lucide-react';

const compatIssues = checkBrowserCompat();
const criticalCompatIssues = compatIssues.filter(i => i.severity === 'error');
import { motion, AnimatePresence } from 'motion/react';

const ZOOM_IN_FACTOR = 1.1;
const ZOOM_OUT_FACTOR = 0.9;

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
  const currentUser = useStore(state => state.currentUser);
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
  const [isMagicLinkPending, setIsMagicLinkPending] = React.useState(false);
  // invite params detected in URL before auth (so sign-in gate can show context)
  const [urlInviteContext, setUrlInviteContext] = React.useState<{ inviteId: string; projectId: string } | null>(null);
  // increment to force ProjectDashboard to re-fetch after invite acceptance
  const [dashboardRefreshKey, setDashboardRefreshKey] = React.useState(0);
  const { importFiles } = useFileImport();

  const projectDuration = useProjectDuration();

  const rewindInterval = useRef<any>(null);
  const forwardInterval = useRef<any>(null);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore typing targets, except selected transport/navigation controls in empty terminal input.
      const target = e.target as HTMLElement;
      const key = e.key.toLowerCase();
      if (['INPUT', 'TEXTAREA'].includes(target.tagName)) {
        const isTerminalInput = target.id === 'jackdaw-terminal-input';
        const terminalIsEmpty = isTerminalInput && (((target as HTMLInputElement).value || '').trim() === '');
        if (!terminalIsEmpty) return;

        // In terminal context, keep command typing isolated from UI letter shortcuts
        // like 'c'/'i'. Allow only transport and timeline movement controls.
        const allowedInTerminal = new Set([' ', 'spacebar', 'h', 'e', '1', '2', 'r', 'f', 'escape']);
        if (!allowedInTerminal.has(key)) return;
      }
      
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
      } else if (key === '+' || key === '=') {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        state.setZoom((Number(state.zoom) || 100) * ZOOM_IN_FACTOR);
      } else if (key === '-') {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        state.setZoom((Number(state.zoom) || 100) * ZOOM_OUT_FACTOR);
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
      } else if (key === 'v') {
        e.preventDefault();
        state.setSpectrumOpen(!state.isSpectrumOpen);
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

  useAudioEngine();
  useClickTrack();
  usePresenceSync();
  useOnlineSync();

  // Detect invite params in the URL early — persist to localStorage so onAuthStateChanged
  // can pick them up regardless of sign-in timing (handles already-signed-in users too)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteId = params.get('invite');
    const projectId = params.get('project');
    if (inviteId && projectId) {
      setUrlInviteContext({ inviteId, projectId });
      if (!window.localStorage.getItem('pendingInviteId')) {
        window.localStorage.setItem('pendingInviteId', inviteId);
        window.localStorage.setItem('pendingProjectId', projectId);
      }
    }
  }, []);

  const completeMagicLink = React.useCallback(async () => {
    try {
      await (authService as any).completeMagicLinkSignIn();
      // Invite params are picked up by onAuthStateChanged when auth state updates
    } catch (err: any) {
      if (err?.message === 'EMAIL_REQUIRED') {
        // URL is a magic link but no email in localStorage — show confirmation form
        setIsMagicLinkPending(true);
        setShowSignInGate(true);
      } else {
        console.error(err);
      }
    }
  }, []);

  // Auth Initialization
  useEffect(() => {
    const unsubscribe = authService.onAuthStateChanged((user) => {
      useStore.getState().setCurrentUser(user);
      if (storageMode === 'firebase') {
        setShowSignInGate(!user);
        if (user) {
          // Collect invite params from localStorage (saved by URL detection or completeMagicLinkSignIn)
          // Fallback to URL directly in case onAuthStateChanged fires before the URL useEffect
          const pendingInviteId = window.localStorage.getItem('pendingInviteId')
            || new URLSearchParams(window.location.search).get('invite');
          const pendingProjectId = window.localStorage.getItem('pendingProjectId')
            || new URLSearchParams(window.location.search).get('project');
          if (pendingInviteId && pendingProjectId) {
            window.localStorage.removeItem('pendingInviteId');
            window.localStorage.removeItem('pendingProjectId');
            setInviteParams({ inviteId: pendingInviteId, projectId: pendingProjectId });
          }
        }
      }
    });

    if ((authService as any).completeMagicLinkSignIn) {
      completeMagicLink();
    } else {
      // Local mode: auto-sign in anonymously if no user
      if (!authService.getCurrentUser()) {
        authService.anonymousSignIn?.().catch(console.error);
      }
    }

    return () => unsubscribe();
  }, [completeMagicLink]);

  // Handle Sync side-effects — watches both projectId and songId
  useEffect(() => {
    if (currentProjectId && currentSongId) {
      const unsubscribe = syncSong(currentProjectId, currentSongId);
      return () => unsubscribe();
    }
  }, [currentProjectId, currentSongId, syncSong]);

  const viewportRef = useRef<HTMLDivElement>(null);

  // Zoom and Scroll handlers
  // Listener is on document (not viewportRef) so it works even when the viewport
  // hasn't mounted yet (e.g. user opens a song from the ProjectDashboard after mount).
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const viewport = viewportRef.current;
      if (!viewport || !viewport.contains(e.target as Node)) return;

      if (e.ctrlKey || e.metaKey) {
        // Horizontal Move with Ctrl+Scrolling
        e.preventDefault();
        viewport.scrollLeft += e.deltaY;
      } else {
        // Zoom with Scrolling
        e.preventDefault();
        const delta = -e.deltaY;
        const zoomFactor = delta > 0 ? ZOOM_IN_FACTOR : ZOOM_OUT_FACTOR;
        const currentZoom = Number(useStore.getState().zoom) || 100;
        useStore.getState().setZoom(currentZoom * zoomFactor);
      }
    };

    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, []);

  if (!showSignInGate && !currentSongIdForRender) {
    return (
      <>
        <ProjectDashboard key={dashboardRefreshKey} />
        <AnimatePresence>
          {inviteParams && (
            <InviteAccept
              inviteId={inviteParams.inviteId}
              projectId={inviteParams.projectId}
              onAccepted={() => {
                setInviteParams(null);
                setDashboardRefreshKey(k => k + 1);
              }}
              onDismiss={() => setInviteParams(null)}
            />
          )}
        </AnimatePresence>
      </>
    );
  }

  if (showSignInGate) {
    return (
      <SignInGate
        isMagicLinkPending={isMagicLinkPending}
        urlInviteContext={urlInviteContext}
        onCompleteMagicLink={async (email, displayName) => {
          window.localStorage.setItem('emailForSignIn', email);
          window.localStorage.setItem('displayNameForSignIn', displayName);
          setIsMagicLinkPending(false);
          await completeMagicLink();
        }}
      />
    );
  }

  return (
    <div
      className="h-screen flex flex-col font-sans select-none overflow-hidden bg-[var(--color-bg-deep)] text-[#adbac7] dark"
      id="jackdaw-root"
      onContextMenu={(e) => e.preventDefault()}
    >
      <FollowPlayheadLogic />
      {criticalCompatIssues.length > 0 && (
        <div className="bg-rose-500/20 border-b border-rose-500/30 px-4 py-1.5 text-[9px] text-rose-300 font-black uppercase tracking-widest shrink-0">
          {criticalCompatIssues.map(i => i.message).join(' · ')}
        </div>
      )}
      <Toolbar
        onToggleCollaboration={() => setShowCollaboration(!showCollaboration)}
        isCollaborationOpen={showCollaboration}
        onSignIn={() => setShowSignInGate(true)}
      />
      
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
        <AudioSpectrumWindow />
      </div>

      <CheatSheetBar />

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
           <span className="text-[10px] text-[var(--color-text-dark)] font-mono tracking-tighter">jackdaw @ {import.meta.env.VITE_APP_VERSION || 'dev'}</span>
        </div>
      </footer>

      {/* InviteAccept modal — can appear over the DAW too */}
      <AnimatePresence>
        {inviteParams && (
          <InviteAccept
            inviteId={inviteParams.inviteId}
            projectId={inviteParams.projectId}
            onAccepted={() => {
              setInviteParams(null);
              setDashboardRefreshKey(k => k + 1);
            }}
            onDismiss={() => setInviteParams(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
