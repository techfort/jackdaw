import React from 'react';
import {
  Play, Pause, SkipBack, SkipForward,
  Magnet, Download,
  Plus, ZoomIn, ZoomOut,
  Undo, Redo, Target, FolderOpen,
  MousePointer2, Scissors, VolumeX,
  Save,
  TrendingUp,
  LayoutDashboard,
  Rewind,
  FastForward,
  Flag,
  Mic,
  LogOut,
  LogIn,
  Timer,
  Circle,
} from 'lucide-react';
import { useStore } from '../store';
import { exportMixdown } from '../lib/exportUtils';
import { useFileImport } from '../hooks/useFileImport';
import { useEffect, useState, useCallback, useRef } from 'react';
import { ProjectMenu } from './ProjectMenu';
import { AnimatePresence } from 'motion/react';
import { authService, storageMode, storageService } from '../services/storage';
import { registerPunchInTrigger } from '../lib/commandActions';
import { InputDeviceSelector } from './InputDeviceSelector';

interface ToolbarProps {
  onToggleCollaboration?: () => void;
  isCollaborationOpen?: boolean;
  onSignIn?: () => void;
}

const PlayheadCounter: React.FC = () => {
  const currentTime = Number(useStore(state => state.currentTime)) || 0;
  const tempo = Number(useStore(state => state.tempo)) || 120;
  const timelineMode = useStore(state => state.timelineMode);

  if (timelineMode === 'beats') {
    const beatsPerSecond = Math.max(0.1, tempo / 60);
    const totalBeats = currentTime * beatsPerSecond;
    const bar = Math.floor(totalBeats / 4) + 1;
    const beat = Math.floor(totalBeats % 4) + 1;
    const sixteenth = Math.floor((totalBeats % 1) * 100);
    
    if (isNaN(bar) || isNaN(beat) || isNaN(sixteenth)) return <span className="text-lg font-mono text-[#E0E0E0] leading-none">0:0:00</span>;

    return (
      <span className="text-lg font-mono text-[#E0E0E0] leading-none">
        {bar}:{beat}:{sixteenth.toString().padStart(2, '0')}
      </span>
    );
  }

  const date = new Date(currentTime * 1000);
  const mm = date.getUTCMinutes();
  const ss = date.getUTCSeconds();
  const ms = Math.floor(date.getUTCMilliseconds() / 10);
  
  if (isNaN(mm) || isNaN(ss) || isNaN(ms)) return <span className="text-lg font-mono text-[#E0E0E0] leading-none">00:00.00</span>;

  return (
    <span className="text-lg font-mono text-[#E0E0E0] leading-none">
      {mm.toString().padStart(2, '0')}:{ss.toString().padStart(2, '0')}.{ms.toString().padStart(2, '0')}
    </span>
  );
};

export const Toolbar: React.FC<ToolbarProps> = ({ onToggleCollaboration, isCollaborationOpen, onSignIn }) => {
  const { importFiles } = useFileImport();
  const punchIn = useStore(state => state.punchIn);
  const punchInRef = useRef<HTMLInputElement>(null);
  const isPlaying = useStore(state => state.isPlaying);
  const setIsPlaying = useStore(state => state.setIsPlaying);
  const timelineMode = useStore(state => state.timelineMode);
  const setTimelineMode = useStore(state => state.setTimelineMode);
  const snapEnabled = useStore(state => state.snapEnabled);
  const setSnapEnabled = useStore(state => state.setSnapEnabled);
  const followPlayhead = useStore(state => state.followPlayhead);
  const setFollowPlayhead = useStore(state => state.setFollowPlayhead);
  const tempo = useStore(state => state.tempo);
  const setTempo = useStore(state => state.setTempo);
  const zoom = useStore(state => state.zoom);
  const setZoom = useStore(state => state.setZoom);
  const activeTool = useStore(state => state.activeTool);
  const setTool = useStore(state => state.setTool);
  const tracks = useStore(state => state.tracks);
  const hasArmedTrack = tracks.some(t => t.isArmed);
  const comments = useStore(state => state.comments);
  const seenCommentIds = useStore(state => state.seenCommentIds);
  const currentProjectId = useStore(state => state.currentProjectId);
  const currentProjectName = useStore(state => state.currentProjectName);
  const currentSongId = useStore(state => state.currentSongId);
  const currentSongName = useStore(state => state.currentSongName);
  const clearSong = useStore(state => state.clearSong);
  const undo = useStore(state => state.undo);
  const redo = useStore(state => state.redo);
  const canUndo = useStore(state => state.canUndo);
  const canRedo = useStore(state => state.canRedo);
  const showMixer = useStore(state => state.showMixer);
  const setShowMixer = useStore(state => state.setShowMixer);
  const showTempoSheet = useStore(state => state.showTempoSheet);
  const setShowTempoSheet = useStore(state => state.setShowTempoSheet);
  const isClickEnabled = useStore(state => state.isClickEnabled);
  const setClickEnabled = useStore(state => state.setClickEnabled);
  const markers = useStore(state => state.markers);
  const markerLabels = useStore(state => state.markerLabels);
  const goToMarker = useStore(state => state.goToMarker);
  const goToStart = useStore(state => state.goToStart);
  const goToEnd = useStore(state => state.goToEnd);
  const seek = useStore(state => state.seek);
  const currentUser = useStore(state => state.currentUser);
  const isOnline = useStore(state => state.isOnline);
  const isRecording = useStore(state => state.isRecording);
  const startRecording = useStore(state => state.startRecording);
  const stopRecording = useStore(state => state.stopRecording);
  const pendingWriteCount = useStore(state => state.pendingWriteCount);
  const [showProjects, setShowProjects] = useState(false);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const rewindInterval = useRef<any>(null);
  const forwardInterval = useRef<any>(null);

  const startRewind = () => {
    seek(-1);
    rewindInterval.current = setInterval(() => seek(-0.5), 50);
  };
  const stopRewind = () => {
    if (rewindInterval.current) {
      clearInterval(rewindInterval.current);
      rewindInterval.current = null;
    }
  };

  const startForward = () => {
    seek(1);
    forwardInterval.current = setInterval(() => seek(0.5), 50);
  };
  const stopForward = () => {
    if (forwardInterval.current) {
      clearInterval(forwardInterval.current);
      forwardInterval.current = null;
    }
  };

  const handleQuickSave = useCallback(async () => {
    if (!currentSongId) {
      setShowProjects(true);
      return;
    }

    setIsSaving(true);
    const projectId = currentProjectId || 'local';

    try {
      await storageService.saveSong(projectId, currentSongId, {
        name: currentSongName,
        tempo,
        comments,
        tracks: tracks.map(({ ...rest }) => ({
          ...rest,
          clips: (rest.clips || []).map(({ buffer: _buf, ...c }) => c)
        })) as any,
        updatedAt: Date.now(),
        projectId
      } as any);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  }, [currentProjectId, currentSongId, currentSongName, tempo, comments, tracks]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA'].includes(target.tagName)) {
        const isTerminalInput = target.id === 'jackdaw-terminal-input';
        const terminalIsEmpty = isTerminalInput && (((target as HTMLInputElement).value || '').trim() === '');
        if (!terminalIsEmpty) return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (cmdOrCtrl && e.key === 's') {
        e.preventDefault();
        handleQuickSave();
      }

      if (cmdOrCtrl && e.key === 'z') {
        if (e.shiftKey) redo();
        else undo();
      } else if (cmdOrCtrl && e.key === 'y') {
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, handleQuickSave]);

  useEffect(() => {
    registerPunchInTrigger(() => punchInRef.current?.click());
    return () => registerPunchInTrigger(() => {});
  }, []);

  const handlePunchIn = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      punchIn(file);
      e.target.value = '';
    }
  };

  const handleExport = () => {
    if (markers[1] !== null && markers[2] !== null) {
      setShowExportOptions(true);
    } else {
      exportMixdown(tracks);
    }
  };

  const doExport = (useSelection: boolean) => {
    setShowExportOptions(false);
    if (useSelection && markers[1] !== null && markers[2] !== null) {
      const start = Math.min(markers[1], markers[2]);
      const end = Math.max(markers[1], markers[2]);
      const label1 = markerLabels[1] || 'In';
      const label2 = markerLabels[2] || 'Out';
      const safeName = (currentSongName || 'jackdaw').replace(/[^a-z0-9_\-\s]/gi, '').trim() || 'jackdaw';
      exportMixdown(tracks, { startTime: start, endTime: end, filename: `${safeName}-${label1}-to-${label2}` });
    } else {
      exportMixdown(tracks);
    }
  };

  const unreadCount = comments.filter(c => c.status !== 'approved' && !seenCommentIds.includes(c.id)).length;
  const blockerCount = currentUser?.name
    ? comments.filter(c => c.status !== 'approved' && (c.mentions || []).some(m => m.toLowerCase() === (currentUser.name || '').toLowerCase())).length
    : 0;

  // Shared class fragments for consistency
  const iconBtn = (active?: boolean, activeClass = 'bg-[var(--color-accent)] text-black') =>
    `p-1.5 rounded transition-all ${active ? activeClass : 'hover:bg-white/10 text-[var(--color-text-muted)]'}`;
  const toggleBtn = (active?: boolean) =>
    `p-1.5 rounded transition-all ${active ? 'text-[var(--color-accent)]' : 'text-white/20 hover:text-white/40'}`;
  const textBtn = (active?: boolean, activeClass = 'bg-[var(--color-accent)] text-black shadow-lg shadow-[var(--color-accent)]/20') =>
    `flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] font-black uppercase tracking-widest transition-all ${active ? activeClass : 'text-white/40 hover:bg-white/10 hover:text-white'}`;
  const group = 'flex items-center gap-1 bg-white/5 p-1 rounded border border-white/10';
  const divider = <div className="w-px h-4 bg-white/10 mx-0.5 shrink-0" />;

  return (
    <div className="h-14 bg-[var(--color-bg-sidebar)] border-b border-[var(--color-border-main)] flex items-center px-3 justify-between shrink-0 select-none gap-2" id="jackdaw-toolbar">
      {/* 1. PROJECT & FILE */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-7 h-7 flex items-center justify-center">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <defs>
                <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--color-accent-purple)" />
                  <stop offset="100%" stopColor="var(--color-accent)" />
                </linearGradient>
              </defs>
              <path
                d="M85,35 C80,30 70,25 60,25 C50,25 40,35 35,45 C30,55 25,60 15,65 C25,75 40,80 55,75 C60,72 65,65 65,55 C65,45 75,40 85,35"
                fill="none"
                stroke="url(#logoGradient)"
                strokeWidth="6"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h1 className="text-base font-black tracking-tighter uppercase text-white hidden 2xl:block">
            Jack<span className="text-[var(--color-accent)]">DAW</span>
          </h1>
        </div>

        {/* Breadcrumb: Project / Song */}
        {(currentProjectName || currentSongName) && (
          <div className="hidden sm:flex items-center gap-1 text-[10px] font-black uppercase tracking-widest max-w-[160px] min-w-0">
            {currentProjectName && (
              <button
                onClick={clearSong}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors truncate"
                title="Back to projects"
              >
                {currentProjectName}
              </button>
            )}
            {currentProjectName && currentSongName && (
              <span className="text-white/20 shrink-0">/</span>
            )}
            {currentSongName && (
              <span className="text-white truncate">{currentSongName}</span>
            )}
          </div>
        )}

        <div className={group}>
          <button
            onClick={() => setShowProjects(!showProjects)}
            className={iconBtn(showProjects)}
            title="Projects"
          >
            <FolderOpen size={15} />
          </button>
          <button
            onClick={handleQuickSave}
            disabled={isSaving || !currentSongId}
            className={`p-1.5 rounded transition-all ${isSaving ? 'animate-pulse text-[var(--color-accent)]' : 'hover:bg-white/10 text-[var(--color-text-muted)] disabled:opacity-20'}`}
            title="Save (Ctrl+S)"
          >
            <Save size={15} />
          </button>
          <div
            role="status"
            aria-live="polite"
            aria-label={isOnline ? (pendingWriteCount > 0 ? `Online, ${pendingWriteCount} pending write${pendingWriteCount !== 1 ? 's' : ''}` : 'Online') : `Offline, ${pendingWriteCount} write${pendingWriteCount !== 1 ? 's' : ''} queued`}
            className="flex items-center gap-1 px-1.5"
            title={isOnline ? (pendingWriteCount > 0 ? `${pendingWriteCount} pending write${pendingWriteCount !== 1 ? 's' : ''}` : 'Online') : 'Offline — changes queued'}
          >
            <div aria-hidden="true" className={`w-1.5 h-1.5 rounded-full transition-colors ${isOnline ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`} />
            {!isOnline && pendingWriteCount > 0 && (
              <span aria-hidden="true" className="text-[8px] font-mono text-amber-400 font-bold">{pendingWriteCount}</span>
            )}
          </div>
          {divider}
          <button
            onClick={undo}
            disabled={!canUndo}
            className="p-1.5 rounded transition-all hover:bg-white/10 text-[var(--color-text-muted)] disabled:opacity-20"
            title="Undo (Ctrl+Z)"
          >
            <Undo size={15} />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="p-1.5 rounded transition-all hover:bg-white/10 text-[var(--color-text-muted)] disabled:opacity-20"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo size={15} />
          </button>
          {divider}
          <input
            ref={punchInRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={handlePunchIn}
            aria-label="Punch in audio file"
          />
          <button
            onClick={() => punchInRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded text-[10px] font-black uppercase tracking-widest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
            title="Punch In — import at playhead"
            aria-label="Punch in: import audio file at current playhead position"
          >
            <Mic size={13} /> Punch
          </button>
          <button
            onClick={() => importFiles()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-white/10 text-white rounded text-[10px] font-black uppercase tracking-widest"
            title="Import Stems (I)"
          >
            <Plus size={13} /> Import
          </button>
          <button
            onClick={handleExport}
            aria-label="Export mixdown"
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--color-accent)]/20 hover:bg-[var(--color-accent)]/30 text-[var(--color-accent)] rounded text-[10px] font-black uppercase tracking-widest"
          >
            <Download size={13} /> Export
          </button>
        </div>
      </div>

      {/* 2. TRANSPORT & COUNTER */}
      <div className="flex items-center gap-2 shrink-0">
        <div className={group}>
          <button onClick={goToStart} aria-label="Go to start" className={toggleBtn()} title="Start (H)"><SkipBack size={15} /></button>
          <button onMouseDown={startRewind} onMouseUp={stopRewind} onMouseLeave={stopRewind} aria-label="Rewind" className={`p-1.5 rounded transition-all text-white/20 hover:text-white/40 active:text-[var(--color-accent)]`} title="Rewind (R)"><Rewind size={15} fill="currentColor" /></button>

          <button
            onClick={() => setIsPlaying(!isPlaying)}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            aria-pressed={isPlaying}
            className={`p-1.5 px-5 rounded transition-all duration-200 ${isPlaying ? 'bg-[var(--color-accent)] text-black shadow-lg shadow-[var(--color-accent)]/20' : 'bg-zinc-700 hover:bg-zinc-600 text-white'}`}
            title="Play/Pause (Space)"
          >
            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
          </button>

          <button onMouseDown={startForward} onMouseUp={stopForward} onMouseLeave={stopForward} aria-label="Fast forward" className={`p-1.5 rounded transition-all text-white/20 hover:text-white/40 active:text-[var(--color-accent)]`} title="Forward (F)"><FastForward size={15} fill="currentColor" /></button>
          <button onClick={goToEnd} aria-label="Go to end" className={toggleBtn()} title="End (E)"><SkipForward size={15} /></button>
          <div className="w-px h-4 bg-white/10 mx-0.5 shrink-0" />
          <button
            onClick={() => isRecording ? stopRecording() : startRecording()}
            disabled={!isRecording && !hasArmedTrack}
            aria-label={isRecording ? 'Stop recording' : 'Start recording'}
            aria-pressed={isRecording}
            title={isRecording ? 'Stop Recording' : hasArmedTrack ? 'Start Recording' : 'Arm a track first (R)'}
            className={`p-1.5 rounded transition-all disabled:opacity-30 ${
              isRecording
                ? 'text-red-400 animate-pulse'
                : 'text-red-400/50 hover:text-red-400 hover:bg-red-500/10'
            }`}
          >
            <Circle size={15} fill="currentColor" />
          </button>
        </div>

        <div className="flex items-center bg-black/40 rounded px-3 py-1.5 border border-white/10 gap-3 shadow-inner">
          <div className="flex flex-col items-center">
            <span className="text-[8px] text-white/40 uppercase font-black tracking-widest leading-none mb-0.5">Tempo</span>
            <input
              type="number"
              value={tempo}
              aria-label="Tempo (BPM)"
              onChange={(e) => setTempo(Number(e.target.value))}
              className="w-10 bg-transparent text-sm font-mono text-[var(--color-accent)] focus:outline-none text-center"
            />
          </div>
          <div className="w-px h-6 bg-white/10 shrink-0" />
          <div className="flex flex-col items-end">
            <span className="text-[8px] text-white/40 uppercase font-black tracking-widest leading-none mb-0.5">Position</span>
            <PlayheadCounter />
          </div>
        </div>
      </div>

      {/* 3. TOOLS & VIEW */}
      <div className="flex items-center gap-2">
        <div className={group}>
          <button onClick={() => setTool('select')} aria-label="Select tool" aria-pressed={activeTool === 'select'} className={iconBtn(activeTool === 'select')} title="Select Tool (V)"><MousePointer2 size={15} /></button>
          <button onClick={() => setTool('scissors')} aria-label="Scissors tool" aria-pressed={activeTool === 'scissors'} className={iconBtn(activeTool === 'scissors')} title="Scissors Tool (S)"><Scissors size={15} /></button>
          <button onClick={() => setTool('mute')} aria-label="Mute tool" aria-pressed={activeTool === 'mute'} className={iconBtn(activeTool === 'mute')} title="Mute Tool (M)"><VolumeX size={15} /></button>
        </div>

        <div className={group}>
          <button onClick={() => setSnapEnabled(!snapEnabled)} aria-label="Snap to grid" aria-pressed={snapEnabled} className={toggleBtn(snapEnabled)} title="Snap to Grid"><Magnet size={15} /></button>
          <button onClick={() => setFollowPlayhead(!followPlayhead)} aria-label="Follow playhead" aria-pressed={followPlayhead} className={toggleBtn(followPlayhead)} title="Follow Playhead"><Target size={15} /></button>
          <button onClick={() => setClickEnabled(!isClickEnabled)} aria-label="Click track" aria-pressed={isClickEnabled} className={toggleBtn(isClickEnabled)} title="Click Track (metronome)"><Timer size={15} /></button>
          {divider}
          <button onClick={() => setShowMixer(!showMixer)} aria-label="Toggle mixer" aria-pressed={showMixer} className={textBtn(showMixer)}>
            <LayoutDashboard size={13} /> Mixer
          </button>
          <button onClick={() => setShowTempoSheet(!showTempoSheet)} aria-label="Toggle tempo sheet" aria-pressed={showTempoSheet} className={textBtn(showTempoSheet)} title="Tempo Sheet — variable tempo">
            <Timer size={13} /> Tempo
          </button>
          <div className="relative">
            <button onClick={onToggleCollaboration} aria-label="Toggle collaboration hub" aria-pressed={isCollaborationOpen} className={textBtn(isCollaborationOpen, 'bg-zinc-600 text-white shadow-lg')}>
              <TrendingUp size={13} /> Hub
            </button>
            {!isCollaborationOpen && (unreadCount > 0 || blockerCount > 0) && (
              <span className={`absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[8px] font-black px-1 pointer-events-none ${blockerCount > 0 ? 'bg-rose-500 text-white' : 'bg-[var(--color-accent)] text-black'}`}>
                {blockerCount > 0 ? blockerCount : unreadCount}
              </span>
            )}
          </div>
        </div>

        <div className={`${group} gap-0`}>
          <button
            onClick={() => setTimelineMode('time')}
            aria-label="Time mode"
            aria-pressed={timelineMode === 'time'}
            className={`px-2.5 py-1.5 rounded text-[9px] font-black uppercase tracking-tighter transition-all ${timelineMode === 'time' ? 'bg-white/10 text-white shadow-inner' : 'text-white/30 hover:text-white'}`}
          >
            Time
          </button>
          <button
            onClick={() => setTimelineMode('beats')}
            aria-label="Beats mode"
            aria-pressed={timelineMode === 'beats'}
            className={`px-2.5 py-1.5 rounded text-[9px] font-black uppercase tracking-tighter transition-all ${timelineMode === 'beats' ? 'bg-white/10 text-white shadow-inner' : 'text-white/30 hover:text-white'}`}
          >
            Beats
          </button>
        </div>

        <div className={group}>
          <button onClick={() => setZoom(zoom * 0.8)} aria-label="Zoom out" title="Zoom out" className="p-1.5 text-white/40 hover:text-white rounded hover:bg-white/10"><ZoomOut size={15} /></button>
          <button onClick={() => setZoom(zoom * 1.2)} aria-label="Zoom in" title="Zoom in" className="p-1.5 text-white/40 hover:text-white rounded hover:bg-white/10"><ZoomIn size={15} /></button>
        </div>

        <div className="border-l border-white/10 pl-2 ml-0.5">
          <InputDeviceSelector />
        </div>

        {storageMode === 'firebase' && (
          <div className="flex items-center gap-1.5 border-l border-white/10 pl-2 ml-0.5">
            {currentUser ? (
              <>
                {!currentUser.isAnonymous && (
                  <>
                    <div className="w-6 h-6 rounded-md bg-[var(--color-accent)]/20 flex items-center justify-center shrink-0">
                      <span className="text-[9px] font-black text-[var(--color-accent)] uppercase">
                        {(currentUser.name || '?').charAt(0)}
                      </span>
                    </div>
                    <span className="text-[9px] text-white/40 font-bold truncate max-w-[72px] hidden lg:block">
                      {currentUser.name}
                    </span>
                  </>
                )}
                <button
                  onClick={() => authService.signOut()}
                  className="flex items-center gap-1 px-2 py-1 text-white/30 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60"
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <LogOut size={13} />
                  <span className="text-[9px] font-bold uppercase tracking-wide hidden sm:block">Sign Out</span>
                </button>
                {currentUser.isAnonymous && (
                  <button
                    onClick={onSignIn}
                    className="flex items-center gap-1 px-2 py-1 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 rounded transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/60"
                    title="Sign in"
                    aria-label="Sign in"
                  >
                    <LogIn size={13} />
                    <span className="text-[9px] font-bold uppercase tracking-wide">Sign In</span>
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={onSignIn}
                className="flex items-center gap-1 px-2 py-1 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 rounded transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/60"
                title="Sign in"
                aria-label="Sign in"
              >
                <LogIn size={13} />
                <span className="text-[9px] font-bold uppercase tracking-wide">Sign In</span>
              </button>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showProjects && <ProjectMenu onClose={() => setShowProjects(false)} />}
        {showExportOptions && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div 
              className="bg-[var(--color-bg-sidebar)] border border-[var(--color-border-main)] rounded-xl shadow-2xl p-6 w-96 max-w-full"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-sm font-black uppercase tracking-widest text-white mb-4">Export Mixdown</h3>
              <p className="text-[10px] text-white/50 uppercase tracking-widest leading-relaxed mb-6">
                You have markers set. Would you like to export the entire project or only the selection between markers?
              </p>
              
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => doExport(true)}
                  className="w-full py-3 bg-[var(--color-accent)] text-black rounded-lg font-black uppercase text-[10px] tracking-widest hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
                >
                  <Flag size={14} /> Export "{markerLabels[1] || 'In'}" → "{markerLabels[2] || 'Out'}"
                </button>
                <button 
                  onClick={() => doExport(false)}
                  className="w-full py-3 bg-zinc-800 text-white hover:bg-zinc-700 rounded-lg font-black uppercase text-[10px] tracking-widest transition-colors flex items-center justify-center gap-2"
                >
                  <Download size={14} /> Export Entire Project
                </button>
                <button 
                  onClick={() => setShowExportOptions(false)}
                  className="w-full py-3 text-white/40 hover:text-white rounded-lg font-black uppercase text-[9px] tracking-widest transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
