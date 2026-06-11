import React, { useCallback, useEffect, useRef } from 'react';
import {
  Volume2,
  VolumeX,
  MessageSquarePlus,
  Trash2,
  CheckCircle2,
  Circle,
  Clock,
  User as UserIcon,
  Lock,
  LockOpen,
} from 'lucide-react';
import { useStore } from '../store';
import { TrackData } from '../types';
import { WaveformRenderer } from './WaveformRenderer';
import { format } from 'date-fns';
import {
  muteTrackByReference,
  removeTrackByReference,
  selectTrackByReference,
  soloTrackByReference,
} from '../lib/commandActions';
import { CommentDraftOverlay } from './CommentDraftOverlay';

interface TrackItemProps {
  track: TrackData;
}

export const TrackItem = React.memo<TrackItemProps>(({ track }) => {
  const updateTrack = useStore(state => state.updateTrack);
  const toggleFreezeTrack = useStore(state => state.toggleFreezeTrack);
  const currentUser = useStore(state => state.currentUser);
  const currentUserRole = useStore(state => state.currentUserRole);
  const zoom = useStore(state => state.zoom);
  const snapEnabled = useStore(state => state.snapEnabled);
  const tempo = useStore(state => state.tempo);
  const timelineMode = useStore(state => state.timelineMode);
  const removeComment = useStore(state => state.removeComment);
  const toggleResolveComment = useStore(state => state.toggleResolveComment);
  const comments = useStore(state => state.comments);
  const activeTool = useStore(state => state.activeTool);
  const splitTrack = useStore(state => state.splitTrack);
  const updateClip = useStore(state => state.updateClip);
  
  const waveformContainerRef = useRef<HTMLDivElement>(null);

  const trackComments = React.useMemo(() => comments.filter(c => c.trackId === track.id), [comments, track.id]);

  const getSnappedTime = (pixels: number) => {
    let time = pixels / zoom;
    if (snapEnabled && timelineMode === 'beats') {
      const beatDuration = 60 / tempo;
      time = Math.round(time / beatDuration) * beatDuration;
    }
    return time;
  };

  const handleAddComment = (timestamp?: number) => {
    const time = timestamp ?? useStore.getState().currentTime;
    useStore.getState().setCommentDraft({ trackId: track.id, timestamp: time });
  };

  const commentDraft = useStore(state => state.commentDraft);
  const setCommentDraft = useStore(state => state.setCommentDraft);
  const selectedTrackId = useStore(state => state.selectedTrackId);
  const setSelectedTrackId = useStore(state => state.setSelectedTrackId);
  const currentProjectId = useStore(state => state.currentProjectId);
  const isSelected = selectedTrackId === track.id;

  const canManageFreeze = currentUser?.id === track.ownerId || currentUserRole === 'owner';
  const canEdit = !track.isFrozen || canManageFreeze;

  const handleInteraction = (e: React.MouseEvent) => {
    setSelectedTrackId(track.id);
    if (!waveformContainerRef.current) return;
    
    // Check for Right-Click (contextMenu) or Shift-Click
    if (e.button === 2 || e.shiftKey) {
      e.preventDefault();
      e.stopPropagation(); // Prevent playhead from moving
      
      const rect = waveformContainerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const timestamp = getSnappedTime(x);
      
      handleAddComment(timestamp);
    }
  };

  return (
    <div 
      className={`flex h-32 border-b border-[var(--color-border-main)] group relative w-full ${commentDraft?.trackId === track.id ? 'z-50' : ''} ${isSelected ? 'bg-[var(--color-accent)]/[0.08]' : 'bg-transparent'}`} 
      id={`track-${track.id}`}
      onClick={() => selectTrackByReference(track.id)}
    >
      {/* Controls - Sticky Left */}
      <div className={`w-64 border-r border-[var(--color-border-main)] p-4 flex flex-col justify-between shrink-0 z-20 track-controls sticky left-0 shadow-2xl transition-colors duration-200 ${isSelected ? 'bg-[var(--color-bg-sidebar)]' : 'bg-[var(--color-bg-sidebar)] opacity-80'} ${track.isFrozen ? 'border-l-2 border-l-sky-500/60' : ''}`}>
        {isSelected && <div className="absolute inset-y-0 left-0 w-1 bg-[var(--color-accent)] z-30" />}
        <div className="flex items-start justify-between gap-1 overflow-hidden">
          <div className="flex flex-col overflow-hidden">
            <div className="flex items-center gap-1">
              {track.isFrozen && <Lock size={10} className="text-sky-400 shrink-0" />}
              <span className="text-xs font-bold text-white truncate">{track.name}</span>
            </div>
            <span className="text-[10px] text-[var(--color-text-dark)] font-mono tracking-tight uppercase">Stem {track.id.slice(0, 4)}</span>
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {canManageFreeze && (
              <button
                onClick={(e) => { e.stopPropagation(); toggleFreezeTrack(track.id); }}
                className={`p-1.5 rounded transition-colors ${track.isFrozen ? 'text-sky-400 hover:text-sky-300 hover:bg-[var(--color-bg-input)]' : 'text-[var(--color-text-muted)] hover:text-sky-400 hover:bg-[var(--color-bg-input)]'}`}
                title={track.isFrozen ? 'Unfreeze track' : 'Freeze track'}
              >
                {track.isFrozen ? <LockOpen size={14} /> : <Lock size={14} />}
              </button>
            )}
            <button
              onClick={() => handleAddComment()}
              className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-bg-input)] rounded transition-colors"
              title="Add comment at playhead"
            >
              <MessageSquarePlus size={14} />
            </button>
            {canEdit && (
              <button
                onClick={() => removeTrackByReference(track.id)}
                className="p-1.5 text-[var(--color-text-dark)] hover:text-red-500 hover:bg-[var(--color-bg-input)] rounded transition-colors"
                title="Remove track"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <button
              onClick={() => {
                if (track.isMuted) updateTrack(track.id, { isMuted: false });
                else muteTrackByReference(track.id);
              }}
              className={`w-8 h-8 rounded text-[10px] font-bold border transition-all ${track.isMuted ? 'bg-[var(--color-accent-purple)]/20 border-[var(--color-accent-purple)] text-[var(--color-accent-purple)]' : 'bg-[var(--color-bg-input)] border-[var(--color-border-inner)] text-[var(--color-text-muted)] hover:text-[#E0E0E0]'}`}
            >
              M
            </button>
            <button
              onClick={() => {
                if (track.isSoloed) updateTrack(track.id, { isSoloed: false });
                else soloTrackByReference(track.id);
              }}
              className={`w-8 h-8 rounded text-[10px] font-bold border transition-all ${track.isSoloed ? 'bg-[var(--color-accent)] border-black text-black' : 'bg-[var(--color-bg-input)] border-[var(--color-border-inner)] text-[var(--color-text-muted)] hover:text-[#E0E0E0]'}`}
            >
              S
            </button>
          </div>
          {track.isFrozen && !canManageFreeze && (
            <span className="text-[9px] text-sky-400/70 uppercase font-bold tracking-tight ml-auto">Read-only</span>
          )}
          {(!track.isFrozen || canManageFreeze) && (
            <span className="text-[9px] text-[var(--color-text-dark)] uppercase font-bold italic ml-auto opacity-0 group-hover:opacity-100">
              Shift+Click to Comment
            </span>
          )}
        </div>

        <div className="space-y-1">
          <div className="relative h-2 bg-[var(--color-bg-input)] rounded-full overflow-hidden border border-[var(--color-border-main)]">
            <div
               className="h-full bg-gradient-to-r from-[var(--color-accent-purple)] to-[var(--color-accent)] transition-all duration-150"
               style={{ width: `${track.volume * 100}%` }}
            />
            <input
              type="range"
              min="0" max="1" step="0.01"
              value={track.volume}
              disabled={!canEdit}
              onChange={(e) => { if (canEdit) updateTrack(track.id, { volume: parseFloat(e.target.value) }); }}
              className={`absolute inset-0 opacity-0 w-full ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed'}`}
            />
          </div>
          <div className="flex justify-between text-[9px] font-mono text-[var(--color-text-muted)] uppercase tracking-tighter">
            <span>-inf</span>
            <span className="font-bold text-[var(--color-accent)]">{Math.round(track.volume * 100)}%</span>
            <span>0dB</span>
          </div>
        </div>
      </div>


      {/* Waveform Area */}
      <div 
        ref={waveformContainerRef}
        className="flex-1 bg-[var(--color-bg-deep)] relative overflow-hidden" 
        onMouseDown={handleInteraction}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Grid lines background emulation from theme */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(to right, var(--color-border-inner) 1px, transparent 1px)', backgroundSize: '100px 100%' }}></div>
        
        {/* The Clips */}
        {(track.clips || []).map((clip) => {
          const isClipMuted = clip.isMuted || track.isMuted;
          const waveformColor = isSelected 
            ? (isClipMuted ? 'rgba(0,0,0,0.4)' : '#000000') 
            : (isClipMuted ? 'var(--color-text-dark)' : 'var(--color-accent)');

          return (
            <div
              key={clip.id}
              className={`h-[80px] my-[16px] absolute rounded border group/clip transition-all ${
                !canEdit ? 'cursor-not-allowed' :
                activeTool === 'scissors' ? 'cursor-crosshair active:scale-y-95' :
                activeTool === 'mute' ? 'cursor-pointer' :
                'cursor-move'
              } ${isSelected ? 'bg-[var(--color-accent)] border-black/40 z-10' : 'bg-[var(--color-accent)]/5 border-[var(--color-accent)]/20'} ${track.isFrozen && !canEdit ? 'opacity-60' : ''}`}
              style={{ 
                left: (Number(clip.offset) || 0) * (Number(zoom) || 100),
                width: (Number(clip.duration) || 0) * (Number(zoom) || 100),
                opacity: isClipMuted && !isSelected ? 0.3 : 1
              }}
              onMouseDown={(e) => {
                selectTrackByReference(track.id);
                if (!canEdit || e.button !== 0 || e.shiftKey) return;
                e.stopPropagation();

              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const containerRect = waveformContainerRef.current?.getBoundingClientRect();
              const xInContainer = e.clientX - (containerRect?.left || 0);
              const timelineTime = getSnappedTime(xInContainer);

              if (activeTool === 'scissors') {
                splitTrack(track.id, timelineTime);
                return;
              }

              if (activeTool === 'mute') {
                updateClip(track.id, clip.id, { isMuted: !clip.isMuted });
                return;
              }
              
              const startX = e.clientX;
              const initialOffset = clip.offset;
              const initialDuration = clip.duration;
              const initialAudioStart = clip.audioStart;
              
              const xInClip = e.clientX - rect.left;
              const handleWidth = 10;
              
              let mode: 'move' | 'resize-start' | 'resize-end' = 'move';
              if (xInClip < handleWidth) mode = 'resize-start';
              else if (xInClip > rect.width - handleWidth) mode = 'resize-end';
              
              const handleMouseMove = (moveEvent: MouseEvent) => {
                const deltaX = moveEvent.clientX - startX;
                const deltaTime = deltaX / zoom;
                
                if (mode === 'move') {
                  let newOffset = initialOffset + deltaTime;
                  if (snapEnabled && timelineMode === 'beats') {
                    const beatDuration = 60 / tempo;
                    newOffset = Math.round(newOffset / beatDuration) * beatDuration;
                  }
                  updateClip(track.id, clip.id, { offset: Math.max(0, newOffset) }, true);
                } else if (mode === 'resize-start') {
                  let newDeltaTime = deltaTime;
                  if (snapEnabled && timelineMode === 'beats') {
                    const beatDuration = 60 / tempo;
                    const totalDelta = initialOffset + deltaTime;
                    const snappedTotal = Math.round(totalDelta / beatDuration) * beatDuration;
                    newDeltaTime = snappedTotal - initialOffset;
                  }
                  
                  const possibleAudioStart = initialAudioStart + newDeltaTime;
                  if (possibleAudioStart >= 0 && initialDuration - newDeltaTime > 0.01) {
                    updateClip(track.id, clip.id, { 
                      offset: initialOffset + newDeltaTime,
                      audioStart: possibleAudioStart,
                      duration: initialDuration - newDeltaTime
                    }, true);
                  }
                } else if (mode === 'resize-end') {
                  let newDuration = initialDuration + deltaTime;
                  if (snapEnabled && timelineMode === 'beats') {
                    const beatDuration = 60 / tempo;
                    const totalEnd = initialOffset + initialDuration + deltaTime;
                    const snappedEnd = Math.round(totalEnd / beatDuration) * beatDuration;
                    newDuration = snappedEnd - initialOffset;
                  }
                  // Check if we exceed buffer length
                  if (track.buffer && clip.audioStart + newDuration > track.buffer.duration) {
                    newDuration = track.buffer.duration - clip.audioStart;
                  }
                  updateClip(track.id, clip.id, { duration: Math.max(0.01, newDuration) }, true);
                }
              };
              
              const handleMouseUp = () => {
                // Final update to trigger history
                const currentTrack = useStore.getState().tracks.find(t => t.id === track.id);
                const currentClip = currentTrack?.clips.find(c => c.id === clip.id);
                if (currentClip) {
                  updateClip(track.id, clip.id, { 
                    offset: currentClip.offset, 
                    duration: currentClip.duration,
                    audioStart: currentClip.audioStart
                  }, false);
                }
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
              };
              
              window.addEventListener('mousemove', handleMouseMove);
              window.addEventListener('mouseup', handleMouseUp);
            }}
          >
            {/* Waveform renderer with offset alignment */}
            <div 
              className="absolute top-0 bottom-0 overflow-hidden pointer-events-none"
              style={{ 
                left: 0, 
                width: '100%' 
              }}
            >
              <WaveformRenderer 
                buffer={track.buffer} 
                startTime={clip.audioStart}
                duration={clip.duration}
                width={clip.duration * zoom} 
                height={80} 
                color={waveformColor}
              />
            </div>
            
            <span className="absolute top-1 left-2 text-[8px] font-bold text-white uppercase opacity-40 pointer-events-none tracking-widest">{track.name}</span>
            
            {/* Resize handles */}
            <div className="absolute top-0 left-0 bottom-0 w-2 cursor-col-resize hover:bg-white/10" />
            <div className="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize hover:bg-white/10" />

            {/* Clip actions Overlay */}
            {canEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  useStore.getState().removeClip(track.id, clip.id);
                }}
                className="absolute -top-2 -right-2 w-5 h-5 bg-black border border-[var(--color-border-main)] rounded-full items-center justify-center hidden group-hover/clip:flex hover:bg-red-500 hover:text-white transition-colors"
              >
                <Trash2 size={10} />
              </button>
            )}
          </div>
        );
      })}

        {trackComments.map((comment) => (
          <div
            key={comment.id}
            className={`absolute top-0 h-full w-[2px] z-20 group/marker transition-opacity ${comment.status === 'approved' ? 'bg-green-500/30 opacity-40 hover:opacity-100' : 'bg-[var(--color-playhead)] shadow-[0_0_8px_rgba(242,125,38,0.3)]'}`}
            style={{ left: (Number(comment.timestamp) || 0) * (Number(zoom) || 100) }}
          >
            {/* Tooltip */}
            <div className={`absolute top-1/2 -translate-y-1/2 left-2 bg-[var(--color-bg-surface)] border ${comment.status === 'approved' ? 'border-green-500/30' : 'border-[var(--color-border-inner)] shadow-[0_0_30px_rgba(0,0,0,0.5)]'} p-3 rounded-lg opacity-0 group-hover/marker:opacity-100 pointer-events-auto transition-all scale-95 group-hover/marker:scale-100 min-w-[220px] z-30`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center ${comment.status === 'approved' ? 'bg-green-500/20' : 'bg-[var(--color-accent)]/20'}`}>
                    <UserIcon size={10} className={comment.status === 'approved' ? 'text-green-500' : 'text-[var(--color-accent)]'} />
                  </div>
                  <span className="text-[9px] font-black text-[var(--color-text-muted)] font-mono">#{comment.id}</span>
                  <span className="text-[10px] font-black text-white/70 uppercase tracking-tight">{comment.userName || 'Artist'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleResolveComment(comment.id); }}
                    className={`p-1 rounded hover:bg-white/10 transition-colors ${comment.status === 'approved' ? 'text-green-500' : 'text-white/30 hover:text-green-400'}`}
                    title={comment.status === 'approved' ? 'Reopen' : 'Mark approved'}
                  >
                    {comment.status === 'approved' ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeComment(comment.id); }}
                    className="p-1 rounded text-white/10 hover:text-red-400 hover:bg-white/5 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              <p className={`text-[11px] leading-relaxed mb-3 ${comment.status === 'approved' ? 'text-white/40 line-through' : 'text-white font-medium'}`}>
                {comment.text}
              </p>

              <div className="flex justify-between items-center pt-2 border-t border-white/5">
                <div className="flex items-center gap-1 text-[9px] text-white/30 font-mono">
                  <Clock size={10} />
                  {Math.floor(comment.timestamp / 60)}:{(comment.timestamp % 60).toFixed(1).padStart(4, '0')}
                </div>
                <span className="text-[8px] text-white/20 font-mono uppercase">
                  {comment.createdAt ? format(comment.createdAt, 'HH:mm') : '--:--'}
                </span>
              </div>
            </div>

            {/* Marker Handle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleResolveComment(comment.id);
              }}
              className={`absolute top-3 -left-3 min-w-6 h-6 px-1 rounded-full border-2 border-black flex items-center justify-center transition-all ${
                comment.status === 'approved'
                  ? 'bg-green-500 text-black hover:scale-110'
                  : 'bg-[var(--color-playhead)] text-black hover:scale-125'
              }`}
            >
              <span className="text-[8px] font-black font-mono leading-none">{comment.id}</span>
            </button>
          </div>
        ))}
      </div>

      {commentDraft?.trackId === track.id && (
        <CommentDraftOverlay
          track={track}
          zoom={zoom}
          timestamp={commentDraft.timestamp}
          onDismiss={() => setCommentDraft(null)}
        />
      )}
    </div>

  );
});
