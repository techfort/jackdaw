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
  LogOut
} from 'lucide-react';
import { useStore } from '../store';
import { exportMixdown } from '../lib/exportUtils';
import { useFileImport } from '../hooks/useFileImport';
import { useEffect, useState, useCallback, useRef } from 'react';
import { ProjectMenu } from './ProjectMenu';
import { AnimatePresence } from 'motion/react';
import { authService, storageMode, storageService } from '../services/storage';
import { registerPunchInTrigger } from '../lib/commandActions';

interface ToolbarProps {
  onToggleCollaboration?: () => void;
  isCollaborationOpen?: boolean;
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

export const Toolbar: React.FC<ToolbarProps> = ({ onToggleCollaboration, isCollaborationOpen }) => {
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
  const comments = useStore(state => state.comments);
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
  const markers = useStore(state => state.markers);
  const goToMarker = useStore(state => state.goToMarker);
  const goToStart = useStore(state => state.goToStart);
  const goToEnd = useStore(state => state.goToEnd);
  const seek = useStore(state => state.seek);
  const currentUser = useStore(state => state.currentUser);
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
        tracks: tracks.map(({ buffer, audioData, ...rest }) => ({
          ...rest,
          clips: (rest.clips || []).map(c => ({ ...c }))
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
      exportMixdown(tracks, { startTime: start, endTime: end });
    } else {
      exportMixdown(tracks);
    }
  };

  return (
    <div className="h-16 bg-[var(--color-bg-sidebar)] border-b border-[var(--color-border-main)] flex items-center px-4 justify-between shrink-0 select-none gap-2" id="jackdaw-toolbar">
      {/* 1. PROJECT & FILE */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 mr-2">
          <div className="relative w-8 h-8 flex items-center justify-center">
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
          <h1 className="text-lg font-black tracking-tighter uppercase text-white hidden 2xl:block">
            Jack<span className="text-[var(--color-accent)]">DAW</span>
          </h1>
        </div>

        {/* Breadcrumb: Project / Song */}
        {(currentProjectName || currentSongName) && (
          <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest max-w-[200px]">
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
              <span className="text-white/20">/</span>
            )}
            {currentSongName && (
              <span className="text-white truncate">{currentSongName}</span>
            )}
          </div>
        )}

        <div className="flex items-center gap-1 bg-white/5 p-1 rounded border border-white/10">
          <button
            onClick={() => setShowProjects(!showProjects)}
            className={`p-1.5 rounded transition-all ${showProjects ? 'bg-[var(--color-accent)] text-black' : 'hover:bg-white/10 text-[var(--color-text-muted)]'}`}
            title="Projects"
          >
            <FolderOpen size={16} />
          </button>
          <button 
            onClick={handleQuickSave}
            disabled={isSaving || !currentSongId}
            className={`p-1.5 rounded transition-all ${isSaving ? 'animate-pulse text-[var(--color-accent)]' : 'hover:bg-white/10 text-[var(--color-text-muted)] disabled:opacity-20'}`}
            title="Save Project (Ctrl+S)"
          >
            <Save size={16} />
          </button>
          <div className="w-[1px] h-4 bg-white/10 mx-1" />
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
            className="flex items-center gap-1.5 px-2 py-1 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded text-[10px] font-black uppercase tracking-widest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
            title="Punch In — import audio at playhead (punchin)"
            aria-label="Punch in: import audio file at current playhead position"
          >
            <Mic size={14} /> Punch
          </button>
          <button
            onClick={() => importFiles()}
            className="flex items-center gap-1.5 px-2 py-1 hover:bg-white/10 text-white rounded text-[10px] font-black uppercase tracking-widest"
            title="Import Stems (I)"
          >
            <Plus size={14} /> Import
          </button>
          <button 
            onClick={handleExport}
            className="flex items-center gap-1.5 px-2 py-1 bg-[var(--color-accent)]/20 hover:bg-[var(--color-accent)]/30 text-[var(--color-accent)] rounded text-[10px] font-black uppercase tracking-widest"
          >
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* 2. TRANSPORT & COUNTER */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 bg-white/5 p-1 rounded border border-white/10">
          <button onClick={goToStart} className="p-1 px-2 hover:bg-white/10 rounded text-[var(--color-text-muted)] transition-colors" title="Start (H)"><SkipBack size={16} /></button>
          <button onMouseDown={startRewind} onMouseUp={stopRewind} onMouseLeave={stopRewind} className="p-1 px-2 hover:bg-white/10 rounded text-[var(--color-text-muted)] active:text-[var(--color-accent)]" title="Rewind (R)"><Rewind size={16} fill="currentColor" /></button>
          
          <button 
            onClick={() => setIsPlaying(!isPlaying)}
            className={`p-1.5 px-5 rounded transition-all duration-200 ${isPlaying ? 'bg-[var(--color-accent)] text-black shadow-lg shadow-[var(--color-accent)]/20' : 'bg-zinc-700 hover:bg-zinc-600 text-white'}`}
            title="Play/Pause (Space)"
          >
            {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ml-1" />}
          </button>

          <button onMouseDown={startForward} onMouseUp={stopForward} onMouseLeave={stopForward} className="p-1 px-2 hover:bg-white/10 rounded text-[var(--color-text-muted)] active:text-[var(--color-accent)]" title="Forward (F)"><FastForward size={16} fill="currentColor" /></button>
          <button onClick={goToEnd} className="p-1 px-2 hover:bg-white/10 rounded text-[var(--color-text-muted)]" title="End (E)"><SkipForward size={16} /></button>
        </div>

        <div className="flex items-center bg-black/40 rounded px-4 py-1.5 border border-white/10 min-w-[200px] justify-between shadow-inner">
          <div className="flex flex-col items-center border-r border-white/10 pr-4">
            <span className="text-[8px] text-white/40 uppercase font-black tracking-widest leading-none mb-0.5">Tempo</span>
            <input 
              type="number" 
              value={tempo}
              onChange={(e) => setTempo(Number(e.target.value))}
              className="w-10 bg-transparent text-sm font-mono text-[var(--color-accent)] focus:outline-none text-center"
            />
          </div>
          <div className="flex flex-col items-end pl-4">
            <span className="text-[8px] text-white/40 uppercase font-black tracking-widest leading-none mb-0.5">Position</span>
            <PlayheadCounter />
          </div>
        </div>
      </div>

      {/* 3. TOOLS & VIEW */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 bg-white/5 p-1 rounded border border-white/10">
          <button 
            onClick={() => setTool('select')}
            className={`p-1.5 rounded transition-all ${activeTool === 'select' ? 'bg-[var(--color-accent)] text-black' : 'hover:bg-white/10 text-[var(--color-text-muted)]'}`}
            title="Select Tool (V)"
          ><MousePointer2 size={16} /></button>
          <button 
            onClick={() => setTool('scissors')}
            className={`p-1.5 rounded transition-all ${activeTool === 'scissors' ? 'bg-[var(--color-accent)] text-black' : 'hover:bg-white/10 text-[var(--color-text-muted)]'}`}
            title="Scissors Tool (S)"
          ><Scissors size={16} /></button>
          <button 
            onClick={() => setTool('mute')}
            className={`p-1.5 rounded transition-all ${activeTool === 'mute' ? 'bg-[var(--color-accent)] text-black' : 'hover:bg-white/10 text-[var(--color-text-muted)]'}`}
            title="Mute Tool (M)"
          ><VolumeX size={16} /></button>
        </div>

        <div className="flex items-center gap-1 bg-white/5 p-1 rounded border border-white/10">
          <button 
            onClick={() => setSnapEnabled(!snapEnabled)}
            className={`p-1.5 rounded transition-all ${snapEnabled ? 'text-[var(--color-accent)]' : 'text-white/20 hover:text-white/40'}`}
            title="Snap to Grid"
          ><Magnet size={16} /></button>
          <button 
            onClick={() => setFollowPlayhead(!followPlayhead)}
            className={`p-1.5 rounded transition-all ${followPlayhead ? 'text-[var(--color-accent)]' : 'text-white/20 hover:text-white/40'}`}
            title="Follow Playhead"
          ><Target size={16} /></button>
          
          <div className="w-[1px] h-4 bg-white/10 mx-1" />

          <button 
            onClick={() => setShowMixer(!showMixer)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-widest transition-all ${showMixer ? 'bg-[var(--color-accent)] text-black shadow-lg shadow-[var(--color-accent)]/20' : 'text-white/40 hover:bg-white/10 hover:text-white'}`}
          >
            <LayoutDashboard size={14} /> Mixer
          </button>
          
          <button 
            onClick={onToggleCollaboration}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-widest transition-all ${isCollaborationOpen ? 'bg-zinc-600 text-white shadow-lg' : 'text-white/40 hover:bg-white/10 hover:text-white'}`}
          >
            <TrendingUp size={14} /> Hub
          </button>
        </div>

        <div className="flex bg-white/5 p-1 rounded border border-white/10">
            <button 
              onClick={() => setTimelineMode('time')}
              className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-tighter transition-all ${timelineMode === 'time' ? 'bg-white/10 text-white shadow-inner' : 'text-white/30 hover:text-white'}`}
            >
              Time
            </button>
            <button 
              onClick={() => setTimelineMode('beats')}
              className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-tighter transition-all ${timelineMode === 'beats' ? 'bg-white/10 text-white shadow-inner' : 'text-white/30 hover:text-white'}`}
            >
              Beats
            </button>
        </div>

        <div className="flex items-center gap-1 bg-white/5 p-1 rounded border border-white/10">
          <button onClick={() => setZoom(zoom * 0.8)} className="p-1.5 text-white/40 hover:text-white rounded hover:bg-white/10"><ZoomOut size={16} /></button>
          <button onClick={() => setZoom(zoom * 1.2)} className="p-1.5 text-white/40 hover:text-white rounded hover:bg-white/10"><ZoomIn size={16} /></button>
        </div>

        {storageMode === 'firebase' && currentUser && !currentUser.isAnonymous && (
          <div className="flex items-center gap-1.5 border-l border-white/10 pl-2 ml-1">
            <div className="w-6 h-6 rounded-md bg-[var(--color-accent)]/20 flex items-center justify-center shrink-0">
              <span className="text-[9px] font-black text-[var(--color-accent)] uppercase">
                {(currentUser.name || '?').charAt(0)}
              </span>
            </div>
            <span className="text-[9px] text-white/40 font-bold truncate max-w-[72px] hidden lg:block">
              {currentUser.name}
            </span>
            <button
              onClick={() => authService.signOut()}
              className="p-1.5 text-white/30 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={14} />
            </button>
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
                  <Flag size={14} /> Export Selection Only
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
