import React from 'react';

const bindings: Array<{ key: string; action: string }> = [
  { key: 'Space', action: 'Play/Pause' },
  { key: 'I', action: 'Import stem' },
  { key: 'C', action: 'New comment' },
  { key: 'H', action: 'Go start' },
  { key: 'E', action: 'Go end' },
  { key: 'R/F', action: 'Rewind/Fwd hold' },
  { key: '1/2', action: 'Set marker' },
  { key: 'Shift+1/2', action: 'Clear marker' },
  { key: 'Cmd/Ctrl+S', action: 'Save' },
  { key: 'Cmd/Ctrl+Z', action: 'Undo' },
  { key: 'Cmd/Ctrl+Shift+Z', action: 'Redo' },
  { key: 'Tab', action: 'Terminal focus' },
  { key: 'Esc', action: 'Cancel draft' },
];

export const CheatSheetBar: React.FC = () => {
  return (
    <div className="h-7 border-t border-[var(--color-border-main)] bg-[var(--color-bg-sidebar)]/90 backdrop-blur px-3 shrink-0 overflow-x-auto whitespace-nowrap">
      <div className="h-full inline-flex items-center gap-3 text-[9px] uppercase tracking-wider font-black text-[var(--color-text-muted)]">
        <span className="text-[var(--color-accent)]">Shortcuts</span>
        {bindings.map((binding) => (
          <span key={`${binding.key}-${binding.action}`} className="inline-flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 rounded border border-[var(--color-border-inner)] bg-[var(--color-bg-deep)] text-white font-mono normal-case">
              {binding.key}
            </span>
            <span className="text-[var(--color-text-dark)]">{binding.action}</span>
          </span>
        ))}
      </div>
    </div>
  );
};
