import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';

type TerminalLine = {
  id: string;
  text: string;
  tone: 'command' | 'info' | 'error';
};

const makeLineId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const parseTrackArg = (raw: string): { kind: 'id' | 'name'; value: string } => {
  const trimmed = raw.trim();
  const quoted = trimmed.match(/^"(.+)"$/);
  if (quoted) {
    return { kind: 'name', value: quoted[1].trim() };
  }
  if (/^\d+$/.test(trimmed)) {
    return { kind: 'id', value: trimmed };
  }
  return { kind: 'name', value: trimmed };
};

export const CommandTerminal: React.FC = () => {
  const tracks = useStore(state => state.tracks);
  const addEmptyTrack = useStore(state => state.addEmptyTrack);
  const removeTrack = useStore(state => state.removeTrack);

  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [lines, setLines] = useState<TerminalLine[]>([
    { id: makeLineId(), text: 'Ready. Commands: add track "name", rm track "name"|id', tone: 'info' }
  ]);

  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const trackLocalIds = useMemo(() => {
    const map = new Map<string, number>();
    tracks.forEach((track, index) => {
      map.set(track.id, index + 1);
    });
    return map;
  }, [tracks]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      event.preventDefault();
      setIsOpen(true);
      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!outputRef.current) return;
    outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [lines]);

  const pushLine = (text: string, tone: TerminalLine['tone']) => {
    setLines(prev => {
      const next = [...prev, { id: makeLineId(), text, tone }];
      return next.slice(-60);
    });
  };

  const handleCommand = (rawCommand: string) => {
    const command = rawCommand.trim();
    if (!command) return;

    pushLine(`🎵 ${command}`, 'command');

    const addMatch = command.match(/^add\s+track\s+(.+)$/i);
    if (addMatch) {
      const arg = parseTrackArg(addMatch[1]);
      if (!arg.value) {
        pushLine('Track name is required.', 'error');
        return;
      }
      const trackId = addEmptyTrack(arg.value);
      const localId = trackLocalIds.get(trackId) ?? tracks.length + 1;
      pushLine(`Added track "${arg.value}" (id: ${localId}).`, 'info');
      return;
    }

    const rmMatch = command.match(/^rm\s+track\s+(.+)$/i);
    if (rmMatch) {
      const arg = parseTrackArg(rmMatch[1]);
      let targetTrack = null as (typeof tracks)[number] | null;

      if (arg.kind === 'id') {
        const localId = Number(arg.value);
        targetTrack = tracks[localId - 1] || null;
      } else {
        const lower = arg.value.toLowerCase();
        targetTrack = tracks.find(track => track.name.toLowerCase() === lower) || null;
      }

      if (!targetTrack) {
        pushLine(`Track not found: ${arg.value}`, 'error');
        return;
      }

      const removedLocalId = trackLocalIds.get(targetTrack.id) || 0;
      removeTrack(targetTrack.id);
      pushLine(`Removed track "${targetTrack.name}" (id: ${removedLocalId}).`, 'info');
      return;
    }

    pushLine('Unknown command. Use: add track "name" or rm track "name"|id', 'error');
  };

  return (
    <div className="absolute bottom-2 right-4 z-[110]">
      {!isOpen ? (
        <button
          onClick={() => {
            setIsOpen(true);
            window.requestAnimationFrame(() => inputRef.current?.focus());
          }}
          className="h-9 px-3 rounded border border-[var(--color-border-main)] bg-[var(--color-bg-sidebar)] text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
          title="Open terminal (Tab)"
        >
          🎵 Terminal
        </button>
      ) : (
        <div className="w-[420px] h-40 rounded border border-[var(--color-border-main)] bg-[var(--color-bg-sidebar)] shadow-2xl flex flex-col overflow-hidden">
          <div className="h-7 px-2 border-b border-[var(--color-border-main)] bg-black/20 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Command Terminal</span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-[10px] px-1.5 py-0.5 rounded text-[var(--color-text-muted)] hover:text-white hover:bg-white/10 transition-colors"
              title="Collapse terminal"
            >
              Collapse
            </button>
          </div>

          <div ref={outputRef} className="flex-1 px-2 py-1 overflow-y-auto bg-[var(--color-bg-deep)]/30">
            {lines.map(line => (
              <div
                key={line.id}
                className={`text-[11px] leading-5 font-mono whitespace-pre-wrap ${
                  line.tone === 'error'
                    ? 'text-red-300'
                    : line.tone === 'command'
                      ? 'text-[var(--color-accent)]'
                      : 'text-[var(--color-text-muted)]'
                }`}
              >
                {line.text}
              </div>
            ))}
          </div>

          <form
            className="h-8 border-t border-[var(--color-border-main)] px-2 bg-[var(--color-bg-sidebar)] flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const current = input;
              setInput('');
              handleCommand(current);
            }}
          >
            <span className="text-sm leading-none">🎵</span>
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              className="flex-1 bg-transparent text-[11px] font-mono text-white outline-none"
              placeholder="type command..."
              aria-label="Terminal command input"
            />
          </form>
        </div>
      )}
    </div>
  );
};
