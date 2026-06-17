import React, { useState } from 'react';
import { X, Plus, Trash2, Music } from 'lucide-react';
import { useStore } from '../store';
import { TempoEvent } from '../types';
import { getBpmAt } from '../lib/tempoUtils';

const formatTime = (secs: number): string => {
  const m = Math.floor(secs / 60);
  const s = (secs % 60).toFixed(2).padStart(5, '0');
  return `${m}:${s}`;
};

interface TempoEventRowProps {
  event: TempoEvent;
  onUpdate: (id: string, updates: Partial<Omit<TempoEvent, 'id'>>) => void;
  onRemove: (id: string) => void;
}

const TempoEventRow: React.FC<TempoEventRowProps> = ({ event, onUpdate, onRemove }) => {
  const [editingBpm, setEditingBpm] = useState(false);
  const [bpmDraft, setBpmDraft] = useState('');
  const [editingNum, setEditingNum] = useState(false);
  const [numDraft, setNumDraft] = useState('');

  const startEditBpm = () => {
    setBpmDraft(String(event.bpm));
    setEditingBpm(true);
  };
  const commitBpm = () => {
    const v = parseFloat(bpmDraft);
    if (!isNaN(v) && v > 0 && v <= 999) onUpdate(event.id, { bpm: v });
    setEditingBpm(false);
  };

  const startEditNum = () => {
    setNumDraft(String(event.numerator ?? 4));
    setEditingNum(true);
  };
  const commitNum = () => {
    const v = parseInt(numDraft, 10);
    if (!isNaN(v) && v >= 1 && v <= 32) onUpdate(event.id, { numerator: v });
    setEditingNum(false);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] border-b border-[var(--color-border-inner)] hover:bg-white/5 group">
      <span className="font-mono text-[var(--color-text-muted)] w-16 shrink-0">{formatTime(event.time)}</span>

      {editingBpm ? (
        <input
          autoFocus
          value={bpmDraft}
          onChange={e => setBpmDraft(e.target.value)}
          onBlur={commitBpm}
          onKeyDown={e => { if (e.key === 'Enter') commitBpm(); if (e.key === 'Escape') setEditingBpm(false); }}
          className="w-16 bg-[var(--color-bg-deep)] border border-[var(--color-accent)] rounded px-1 py-0.5 text-white text-[10px] outline-none"
        />
      ) : (
        <button
          onClick={startEditBpm}
          title="Click to edit BPM"
          className="w-16 font-black text-white hover:text-[var(--color-accent)] transition-colors text-left"
        >
          {event.bpm} BPM
        </button>
      )}

      <span className="text-[var(--color-text-dark)] mx-1">·</span>

      {editingNum ? (
        <input
          autoFocus
          value={numDraft}
          onChange={e => setNumDraft(e.target.value)}
          onBlur={commitNum}
          onKeyDown={e => { if (e.key === 'Enter') commitNum(); if (e.key === 'Escape') setEditingNum(false); }}
          className="w-10 bg-[var(--color-bg-deep)] border border-[var(--color-accent)] rounded px-1 py-0.5 text-white text-[10px] outline-none"
        />
      ) : (
        <button
          onClick={startEditNum}
          title="Click to edit time signature"
          className="text-[var(--color-text-muted)] hover:text-white transition-colors"
        >
          {event.numerator ?? 4}/{event.denominator ?? 4}
        </button>
      )}

      <button
        onClick={() => onRemove(event.id)}
        aria-label="Remove tempo event"
        className="ml-auto p-1 text-[var(--color-text-dark)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded"
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
};

export const TempoSheet: React.FC = () => {
  const tempo = useStore(state => state.tempo);
  const currentTime = useStore(state => state.currentTime);
  const tempoEvents = useStore(state => state.tempoEvents);
  const addTempoEvent = useStore(state => state.addTempoEvent);
  const updateTempoEvent = useStore(state => state.updateTempoEvent);
  const removeTempoEvent = useStore(state => state.removeTempoEvent);
  const setShowTempoSheet = useStore(state => state.setShowTempoSheet);

  const activeBpm = getBpmAt(currentTime, tempoEvents, tempo);

  const handleAddAtPlayhead = () => {
    if (tempoEvents.some(e => Math.abs(e.time - currentTime) < 0.01)) return;
    addTempoEvent({ time: currentTime, bpm: activeBpm, numerator: 4, denominator: 4 });
  };

  const sorted = [...tempoEvents].sort((a, b) => a.time - b.time);

  return (
    <div className="border-b border-[var(--color-border-main)] bg-[var(--color-bg-sidebar)] text-[10px] shrink-0">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-border-inner)]">
        <div className="flex items-center gap-2">
          <Music size={12} className="text-[var(--color-accent)]" />
          <span className="font-black uppercase tracking-widest text-white text-[9px]">Tempo Sheet</span>
          <span className="text-[var(--color-text-dark)] font-mono">— base {tempo} BPM</span>
          <span className="text-[var(--color-accent)] font-mono font-bold">@ {activeBpm} BPM</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleAddAtPlayhead}
            title="Add tempo event at current playhead position"
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:bg-white/5 transition-colors border border-transparent hover:border-[var(--color-border-inner)]"
          >
            <Plus size={10} />
            Add at playhead
          </button>
          <button
            onClick={() => setShowTempoSheet(false)}
            className="p-1 hover:bg-white/10 rounded transition-colors text-[var(--color-text-muted)] hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="px-3 py-2 text-[var(--color-text-dark)] italic">
          No tempo changes. Click "Add at playhead" to insert one.
        </div>
      ) : (
        <div className="max-h-28 overflow-y-auto">
          {sorted.map(event => (
            <TempoEventRow
              key={event.id}
              event={event}
              onUpdate={updateTempoEvent}
              onRemove={removeTempoEvent}
            />
          ))}
        </div>
      )}
    </div>
  );
};
