import React, { useMemo, useCallback } from 'react';
import { useStore, useProjectDuration } from '../store';

export const TimelineRuler: React.FC = () => {
  const { timelineMode, tempo, zoom, currentTime, setCurrentTime, snapEnabled } = useStore();
  const projectDuration = useProjectDuration();
  
  const handleInteraction = useCallback((e: React.MouseEvent) => {
    // Only handle left click
    if (e.button !== 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let time = x / zoom;

    if (snapEnabled && timelineMode === 'beats') {
      const beatDuration = 60 / tempo;
      time = Math.round(time / beatDuration) * beatDuration;
    }

    setCurrentTime(time);
  }, [zoom, snapEnabled, timelineMode, tempo, setCurrentTime]);

  const handleMouseDown = (e: React.MouseEvent) => {
    handleInteraction(e);
    
    // Drag to seek logic
    const onMouseMove = (moveEvent: MouseEvent) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = moveEvent.clientX - rect.left;
      let time = x / zoom;
      if (snapEnabled && timelineMode === 'beats') {
        const beatDuration = 60 / tempo;
        time = Math.round(time / beatDuration) * beatDuration;
      }
      setCurrentTime(time);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const segments = useMemo(() => {
    const list = [];
    const safeProjectDuration = Number(projectDuration);
    const maxSeconds = isNaN(safeProjectDuration) ? 60 : Math.max(10, safeProjectDuration); 
    const pixelsPerSecond = Number(zoom) || 100;
    
    if (timelineMode === 'time') {
      // Dynamic intervals based on pixels per second (zoom)
      // We want labels approximately every 100-200px
      let step = 1;
      if (pixelsPerSecond < 2) step = 60;
      else if (pixelsPerSecond < 5) step = 30;
      else if (pixelsPerSecond < 10) step = 10;
      else if (pixelsPerSecond < 25) step = 5;
      else if (pixelsPerSecond < 60) step = 2;
      else step = 1;

      for (let i = 0; i < maxSeconds; i += step) {
        const isMajor = true; // Simplified for now since we increment by step
        const position = i * pixelsPerSecond;
        if (isNaN(position)) continue;

        list.push({
          label: `${Math.floor(i / 60)}:${(i % 60).toString().padStart(2, '0')}`,
          position,
          type: 'major' as const
        });

        // Add minors if zoom is high
        if (pixelsPerSecond > 50 && step >= 1) {
           for (let m = 1; m < 5; m++) {
             const subPos = (i + (m * step / 5)) * pixelsPerSecond;
             if (subPos < (i+step) * pixelsPerSecond && subPos < maxSeconds * pixelsPerSecond) {
               list.push({ label: null, position: subPos, type: 'minor' as const });
             }
           }
        }
      }
    } else {
      const safeTempo = Number(tempo) || 120;
      const secondsPerBeat = 60 / safeTempo;
      const beatsPerBar = 4;
      const totalBeats = maxSeconds / secondsPerBeat;
      
      // Dynamic beat intervals
      let barStep = 1;
      if (pixelsPerSecond < 10) barStep = 8;
      else if (pixelsPerSecond < 25) barStep = 4;
      else if (pixelsPerSecond < 50) barStep = 2;
      else barStep = 1;

      for (let i = 0; i < totalBeats; i++) {
        const isBar = i % beatsPerBar === 0;
        const isMajor = i % (beatsPerBar * barStep) === 0;

        if (isMajor || (isBar && pixelsPerSecond > 20)) {
          const position = i * secondsPerBeat * pixelsPerSecond;
          if (isNaN(position)) continue;

          list.push({
            label: isMajor ? `${Math.floor(i / beatsPerBar) + 1}.1` : null,
            position,
            type: isMajor ? 'major' : 'minor'
          });
        }
      }
    }
    return list;
  }, [timelineMode, tempo, zoom, projectDuration]);

  return (
    <div 
      className="h-10 bg-[var(--color-bg-sidebar)]/30 border-b border-[var(--color-border-main)] relative cursor-crosshair group hover:bg-[var(--color-bg-sidebar)]/60 transition-colors min-w-full" 
      style={{ width: `${projectDuration * zoom}px` }}
      onMouseDown={handleMouseDown}
    >
      <div className="absolute inset-0 bg-[var(--color-accent)]/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      {segments.map((s, i) => (
        <div 
          key={i} 
          className="absolute top-0 h-full flex flex-col pointer-events-none select-none"
          style={{ left: `${s.position}px` }}
        >
          <div className={`w-[1px] ${s.type === 'major' ? 'h-full bg-white/20' : 'h-3 mt-auto bg-[var(--color-border-main)]/50'}`} />
          {s.label && (
            <span className="text-[10px] font-mono text-white absolute top-1 left-1 whitespace-nowrap opacity-50">
              {s.label}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};
