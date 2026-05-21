import React, { useEffect, useRef, useState } from 'react';
import { executeTerminalCommand } from '../lib/commandActions';
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

export const CommandTerminal: React.FC = () => {
  const isPlaying = useStore(state => state.isPlaying);
  const setIsPlaying = useStore(state => state.setIsPlaying);
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [historyDraft, setHistoryDraft] = useState('');
  const [lines, setLines] = useState<TerminalLine[]>([
    { id: makeLineId(), text: 'Ready. Commands: add track, rm track, sel, go, ff, rw, s, m, c: "comment"', tone: 'info' }
  ]);

  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

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
    const result = executeTerminalCommand(command);
    if (!result.message) return;
    pushLine(result.message, result.ok ? 'info' : 'error');
  };

  const navigateHistory = (direction: 'up' | 'down') => {
    if (history.length === 0) return;

    if (direction === 'up') {
      if (historyIndex === -1) {
        setHistoryDraft(input);
        const nextIndex = history.length - 1;
        setHistoryIndex(nextIndex);
        setInput(history[nextIndex]);
        return;
      }

      if (historyIndex > 0) {
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        setInput(history[nextIndex]);
      }
      return;
    }

    if (historyIndex === -1) return;

    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setInput(history[nextIndex]);
      return;
    }

    setHistoryIndex(-1);
    setInput(historyDraft);
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
        <div className="w-[420px] h-56 rounded border border-[var(--color-border-main)] bg-[var(--color-bg-sidebar)] shadow-2xl flex flex-col overflow-hidden">
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
              if (!current.trim()) return;
              setHistory(prev => [...prev, current]);
              setHistoryIndex(-1);
              setHistoryDraft('');
              handleCommand(current);
            }}
          >
            <span className="text-sm leading-none">🎵</span>
            <input
              id="jackdaw-terminal-input"
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Tab') {
                  event.preventDefault();
                  (event.currentTarget as HTMLInputElement).blur();
                  return;
                }

                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  navigateHistory('up');
                  return;
                }

                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  navigateHistory('down');
                }
              }}
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
