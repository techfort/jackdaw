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
  const [showHelp, setShowHelp] = useState(false);
  const [lines, setLines] = useState<TerminalLine[]>([
    { id: makeLineId(), text: 'Ready. Commands: add track, rm track, rm c, sel, go, ff, rw, s, m, vu, vd, c: "comment", invite, e, e stem, punchin, +, -, ++, --', tone: 'info' }
  ]);

  const helpLines = [
    'add track "name"    add a new empty track',
    'rm track <ref>      remove track by id/index/name',
    'sel <ref>           select track by id/index/name',
    'm <ref>             toggle mute on track',
    's <ref>             toggle solo on track',
    'go <time>           jump playhead (seconds, mm:ss, bar.beat)',
    'ff <time>           move playhead forward',
    'rw <time>           move playhead backward',
    'c: "comment"        add comment to active/auto track',
    'c <ref>: "comment"  add comment to specific track',
    'rm c <id>           remove comment by id',
    'vu [ref] <amt>      raise track volume by a float amount',
    'vd [ref] <amt>      lower track volume by a float amount',
    'invite <email>      invite collaborator to current project',
    'e                   export full mixdown',
    'e stem              export between markers 1 and 2',
    'punchin             import audio file at current playhead position',
    '+, ++, +++          zoom in 1/2/3 steps',
    '-, --, ---          zoom out 1/2/3 steps',
  ];

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

  useEffect(() => {
    if (!showHelp) return;

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowHelp(false);
    };

    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [showHelp]);

  const pushLine = (text: string, tone: TerminalLine['tone']) => {
    setLines(prev => {
      const next = [...prev, { id: makeLineId(), text, tone }];
      return next.slice(-60);
    });
  };

  const handleCommand = async (rawCommand: string) => {
    const command = rawCommand.trim();
    if (!command) return;

    pushLine(`🎵 ${command}`, 'command');
    const result = await executeTerminalCommand(command);
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
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">JackDAW Terminal</span>
              <button
                type="button"
                onClick={() => setShowHelp(true)}
                className="w-4 h-4 rounded-full border border-[var(--color-border-main)] text-[10px] leading-none text-[var(--color-text-muted)] hover:text-white hover:border-white/40 transition-colors"
                title="Terminal command help"
                aria-label="Open terminal help"
              >
                ?
              </button>
            </div>
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
              void handleCommand(current);
            }}
          >
            <span className="text-sm leading-none">🎵</span>
            <input
              id="jackdaw-terminal-input"
              name="jackdaw-terminal-input"
              ref={inputRef}
              value={input}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
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

          {showHelp && (
            <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-[1px] flex items-center justify-center p-6">
              <div className="w-full max-w-2xl max-h-[80vh] rounded border border-[var(--color-border-main)] bg-[var(--color-bg-sidebar)] flex flex-col overflow-hidden">
                <div className="h-8 px-3 border-b border-[var(--color-border-main)] flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Terminal Help</span>
                  <button
                    type="button"
                    onClick={() => setShowHelp(false)}
                    className="text-[10px] px-2 py-0.5 rounded text-[var(--color-text-muted)] hover:text-white hover:bg-white/10 transition-colors"
                  >
                    Close
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-1 bg-[var(--color-bg-deep)]/30">
                  {helpLines.map((line) => (
                    <div key={line} className="text-[11px] leading-5 font-mono text-[var(--color-text-muted)] whitespace-pre">
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
