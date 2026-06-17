import React, { useMemo, useCallback, useState, useRef } from 'react';
import { useStore, useProjectDuration } from '../store';
import { getTempoSegments, snapToNearestBeat } from '../lib/tempoUtils';

const MARKER_COLORS: Record<1 | 2, string> = {
  1: '#10B981', // emerald
  2: '#F43F5E', // rose
};

const DEFAULT_LABELS: Record<1 | 2, string> = { 1: 'In', 2: 'Out' };

interface MarkerFlagProps {
  index: 1 | 2;
  time: number;
  label: string;
  zoom: number;
  onLabelChange: (label: string) => void;
}

const MarkerFlag: React.FC<MarkerFlagProps> = ({ index, time, label, zoom, onLabelChange }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const color = MARKER_COLORS[index];
  const displayLabel = label || DEFAULT_LABELS[index];
  const x = time * zoom;

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft(label);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commit = () => {
    onLabelChange(draft.trim());
    setEditing(false);
  };

  return (
    <div
      className="absolute top-0 h-full pointer-events-none"
      style={{ left: `${x}px` }}
    >
      {/* Vertical line */}
      <div
        className="absolute top-0 bottom-0 w-[1.5px] opacity-70"
        style={{ backgroundColor: color }}
      />
      {/* Label badge — pointer-events re-enabled */}
      <div
        className="absolute top-0.5 left-0.5 pointer-events-auto"
        style={{ zIndex: 10 }}
        onMouseDown={e => e.stopPropagation()}
      >
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
            className="h-4 w-14 text-[8px] font-black uppercase px-1 rounded outline-none border"
            style={{ background: '#111', borderColor: color, color }}
            autoFocus
          />
        ) : (
          <button
            onDoubleClick={startEdit}
            title="Double-click to rename marker"
            className="h-4 px-1.5 rounded text-[8px] font-black uppercase tracking-wide leading-none flex items-center select-none"
            style={{ background: `${color}22`, border: `1px solid ${color}55`, color }}
          >
            {index} · {displayLabel}
          </button>
        )}
      </div>
    </div>
  );
};

export const TimelineRuler: React.FC = () => {
  const { timelineMode, tempo, tempoEvents, zoom, currentTime, setCurrentTime, snapEnabled, markers, markerLabels, setMarkerLabel } = useStore();
  const projectDuration = useProjectDuration();

  const snapTime = useCallback((raw: number) => {
    if (!snapEnabled || timelineMode !== 'beats') return raw;
    return snapToNearestBeat(raw, tempoEvents, tempo);
  }, [snapEnabled, timelineMode, tempo, tempoEvents]);

  const handleInteraction = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setCurrentTime(snapTime(x / zoom));
  }, [zoom, snapTime, setCurrentTime]);

  const handleMouseDown = (e: React.MouseEvent) => {
    handleInteraction(e);
    // Capture the element now — React nullifies e.currentTarget after the handler returns,
    // so the mousemove closure would crash reading getBoundingClientRect on null.
    const el = e.currentTarget as HTMLElement;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = moveEvent.clientX - rect.left;
      setCurrentTime(snapTime(x / zoom));
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
      let step = 1;
      if (pixelsPerSecond < 2) step = 60;
      else if (pixelsPerSecond < 5) step = 30;
      else if (pixelsPerSecond < 10) step = 10;
      else if (pixelsPerSecond < 25) step = 5;
      else if (pixelsPerSecond < 60) step = 2;
      else step = 1;

      for (let i = 0; i < maxSeconds; i += step) {
        const position = i * pixelsPerSecond;
        if (isNaN(position)) continue;

        list.push({
          label: `${Math.floor(i / 60)}:${(i % 60).toString().padStart(2, '0')}`,
          position,
          type: 'major' as const
        });

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
      const segments = getTempoSegments(tempoEvents, safeTempo, maxSeconds);

      let barStep = 1;
      if (pixelsPerSecond < 10) barStep = 8;
      else if (pixelsPerSecond < 25) barStep = 4;
      else if (pixelsPerSecond < 50) barStep = 2;
      else barStep = 1;

      let globalBeatIndex = 0;

      for (const seg of segments) {
        const beatsPerBar = seg.numerator;
        const beatDuration = 60 / seg.bpm;
        let t = seg.startTime;

        while (t < seg.endTime && t < maxSeconds) {
          const beatInBar = globalBeatIndex % beatsPerBar;
          const isBar = beatInBar === 0;
          const barNumber = Math.floor(globalBeatIndex / beatsPerBar);
          const isMajor = barNumber % barStep === 0 && isBar;

          if (isMajor || (isBar && pixelsPerSecond > 20)) {
            const position = t * pixelsPerSecond;
            if (!isNaN(position)) {
              list.push({
                label: isMajor ? `${barNumber + 1}.1` : null,
                position,
                type: isMajor ? 'major' : 'minor'
              });
            }
          }

          t += beatDuration;
          globalBeatIndex++;
        }
      }
    }
    return list;
  }, [timelineMode, tempo, tempoEvents, zoom, projectDuration]);

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

      {([1, 2] as const).map(idx =>
        markers[idx] !== null ? (
          <MarkerFlag
            key={idx}
            index={idx}
            time={markers[idx]!}
            label={markerLabels[idx]}
            zoom={zoom}
            onLabelChange={label => setMarkerLabel(idx, label)}
          />
        ) : null
      )}
    </div>
  );
};
