import React from 'react';
import { useStore } from '../store';
import { TrackData } from '../types';
import { Volume2, VolumeX } from 'lucide-react';

interface ChannelStripProps {
  track: TrackData;
}

const ChannelStrip = React.memo<ChannelStripProps>(({ track }) => {
  const updateTrack = useStore(state => state.updateTrack);

  return (
    <div className="w-24 bg-[var(--color-bg-sidebar)] border-x border-[var(--color-border-main)] flex flex-col h-full shrink-0 group">
      {/* Track Info */}
      <div className="p-2 border-b border-[var(--color-border-main)] bg-[var(--color-bg-deep)]">
        <div className="text-[9px] font-black text-[var(--color-text-dark)] uppercase tracking-widest truncate">{track.id.slice(0, 4)}</div>
        <div className="text-[11px] font-bold text-[#E0E0E0] truncate leading-tight mt-1">{track.name}</div>
      </div>

      {/* Meter Area */}
      <div className="flex-1 px-4 py-4 flex gap-1 justify-center relative">
        <div className="absolute inset-x-0 top-0 bottom-0 pointer-events-none px-4 py-4 flex gap-1">
           <div className="flex-1 bg-[var(--color-bg-input)] rounded-sm relative overflow-hidden">
             <div 
               className="absolute bottom-0 w-full bg-[var(--color-accent)] opacity-40 transition-all duration-75" 
               style={{ height: `${track.volume * 85}%` }} 
             />
           </div>
           <div className="flex-1 bg-[var(--color-bg-input)] rounded-sm relative overflow-hidden">
             <div 
               className="absolute bottom-0 w-full bg-[var(--color-accent)] opacity-40 transition-all duration-75" 
               style={{ height: `${track.volume * 80}%` }} 
             />
           </div>
        </div>

        {/* Vertical Fader */}
        <div className="relative z-10 w-full flex justify-center">
          <input 
            type="range" 
            min="0" max="1" step="0.01"
            value={track.volume}
            onChange={(e) => updateTrack(track.id, { volume: parseFloat(e.target.value) })}
            className="fader-input"
            style={{ 
              appearance: 'none',
              background: 'transparent',
              width: '160px',
              transform: 'rotate(-90deg)',
              marginTop: '80px'
            }}
          />
        </div>

        {/* Fader markings */}
        <div className="absolute left-1 top-4 bottom-4 flex flex-col justify-between text-[8px] font-mono text-[var(--color-text-dark)] pointer-events-none">
          <span>0</span>
          <span>-6</span>
          <span>-12</span>
          <span>-24</span>
          <span>-inf</span>
        </div>
      </div>

      {/* Controls */}
      <div className="p-2 bg-[var(--color-bg-deep)] border-t border-[var(--color-border-main)] grid grid-cols-2 gap-1">
        <button 
          onClick={() => updateTrack(track.id, { isMuted: !track.isMuted })}
          className={`h-8 rounded text-[10px] font-bold border transition-all ${track.isMuted ? 'bg-[var(--color-accent-purple)]/20 border-[var(--color-accent-purple)] text-[var(--color-accent-purple)]' : 'bg-[var(--color-bg-input)] border-[var(--color-border-inner)] text-[var(--color-text-muted)] hover:text-[#E0E0E0]'}`}
        >
          M
        </button>
        <button 
          onClick={() => updateTrack(track.id, { isSoloed: !track.isSoloed })}
          className={`h-8 rounded text-[10px] font-bold border transition-all ${track.isSoloed ? 'bg-[var(--color-accent)] border-black text-black' : 'bg-[var(--color-bg-input)] border-[var(--color-border-inner)] text-[var(--color-text-muted)] hover:text-[#E0E0E0]'}`}
        >
          S
        </button>
      </div>

      <div className="h-4 bg-[var(--color-bg-deep)] flex items-center justify-center border-t border-[var(--color-border-main)]">
        <span className="text-[10px] font-mono text-[var(--color-accent)]">
          {Math.round(track.volume * 100)}
        </span>
      </div>
    </div>
  );
});

export const Mixer: React.FC = () => {
  const tracks = useStore(state => state.tracks);

  return (
    <div className="flex-1 bg-[var(--color-bg-deep)] flex overflow-hidden min-h-0" id="jackdaw-mixer">
      {/* Channel Strips */}
      <div className="flex-1 overflow-x-auto flex scrollbar-hide">
        {tracks.map(track => (
          <ChannelStrip key={track.id} track={track} />
        ))}
        {tracks.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-[var(--color-text-dark)] text-[10px] uppercase font-bold tracking-[0.2em] p-12 text-center">
            Import stems to see mixer channels
          </div>
        )}
      </div>

      {/* Master Section - stays on right */}
      <div className="w-24 bg-[var(--color-bg-sidebar)] border-l border-[var(--color-border-main)] flex flex-col shrink-0">
        <div className="p-2 border-b border-[var(--color-border-main)] bg-[var(--color-bg-deep)] text-[10px] font-black text-white uppercase tracking-widest text-center">
          Master
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-4 gap-4">
           {/* Master Meters */}
           <div className="flex gap-1 h-48 w-10 bg-[var(--color-bg-deep)] p-1 rounded border border-[var(--color-border-main)]">
              <div className="flex-1 bg-[var(--color-bg-input)] relative overflow-hidden">
                <div className="absolute bottom-0 w-full bg-[var(--color-accent)] opacity-60" style={{ height: '5%' }} />
              </div>
              <div className="flex-1 bg-[var(--color-bg-input)] relative overflow-hidden">
                <div className="absolute bottom-0 w-full bg-[var(--color-accent)] opacity-60" style={{ height: '7%' }} />
              </div>
           </div>
           <div className="text-[10px] font-mono text-[var(--color-text-muted)]">0.0 dB</div>
        </div>
        <div className="h-10 bg-gradient-to-r from-[var(--color-accent-purple)] to-[var(--color-accent)] flex items-center justify-center text-white font-black text-[10px] tracking-tight uppercase">
          Output
        </div>
      </div>
    </div>
  );
};
