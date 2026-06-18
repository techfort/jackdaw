import React, { useEffect, useRef, useState } from 'react';
import { executeTerminalCommand, COMMAND_NAMES } from '../lib/commandActions';
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
  const history = useStore(state => state.terminalHistory);
  const pushTerminalHistory = useStore(state => state.pushTerminalHistory);
  const aliasMap = useStore(state => state.aliasMap);
  const rcText = useStore(state => state.rcText);
  const saveRcText = useStore(state => state.saveRcText);
  const isConfigEditorOpen = useStore(state => state.isConfigEditorOpen);
  const setConfigEditorOpen = useStore(state => state.setConfigEditorOpen);
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [historyDraft, setHistoryDraft] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [rcDraft, setRcDraft] = useState('');

  // Autocomplete: names that match the current (single-token) input.
  const trimmedInput = input.trim();
  const suggestions =
    trimmedInput && !/\s/.test(trimmedInput)
      ? [...COMMAND_NAMES, ...Object.keys(aliasMap || {})]
          .filter(name => name !== trimmedInput && name.startsWith(trimmedInput.toLowerCase()))
          .slice(0, 5)
      : [];
  const [lines, setLines] = useState<TerminalLine[]>([
    { id: makeLineId(), text: 'Ready. Type "help" for all commands.', tone: 'info' }
  ]);

  const helpLines = [
    '── Playback ──────────────────────────────────────────',
    'play                start playback from current position',
    'pause               pause playback',
    'stop                stop and return playhead to 0',
    '── Navigation ────────────────────────────────────────',
    'go <time>           jump playhead (seconds, mm:ss, bar.beat)',
    'ff [n]              fast-forward by n seconds (default 5)',
    'rw [n]              rewind by n seconds (default 5)',
    '── Tracks ────────────────────────────────────────────',
    'add track "name"    add a new empty track',
    'rm track <ref>      remove track by id/index/name',
    'sel <ref>           select track by id/index/name',
    'arm <ref>           toggle record-arm on a track',
    'm <ref>             toggle mute on track',
    's <ref>             toggle solo on track',
    'vu [ref] [n]        raise track volume (default 0.1)',
    'vd [ref] [n]        lower track volume (default 0.1)',
    'freeze <ref>        freeze track (owner only)',
    'unfreeze <ref>      unfreeze track (owner only)',
    '── Session ───────────────────────────────────────────',
    'tempo <bpm>         set tempo (20–300)',
    'marker <1|2> [t]    set or clear a marker (t = time)',
    'undo                undo last action',
    'redo                redo last undone action',
    'click / metronome   toggle click track',
    '── Comments ──────────────────────────────────────────',
    'c: "text"           add comment at playhead',
    'c <ref>: "text"     add comment on specific track',
    'rm c <id>           remove comment by id',
    'reply <id> "text"   add threaded reply to comment',
    'unread              list unread open comments',
    '── Collaboration ─────────────────────────────────────',
    'invite <email>      invite collaborator (editor role)',
    '── Export ────────────────────────────────────────────',
    'e                   export full mixdown as WAV',
    'e stem              export between markers 1 and 2',
    'e stem <ref>        export a single track stem as WAV',
    'punchin             import audio file at playhead position',
    '── View / Tools ──────────────────────────────────────',
    'spectrum            toggle spectrum analyser panel',
    'activity [n]        show last n activity events',
    'compat              check browser API compatibility',
    '+, ++, +++          zoom in 1/2/3 steps',
    '-, --, ---          zoom out 1/2/3 steps',
    'help [command]      describe a specific command',
    '── Scripting ─────────────────────────────────────────',
    'alias               list defined aliases',
    'alias n = command   define an alias (e.g. alias rec = arm sel)',
    'unalias <name>      remove an alias',
    'config / rc         open the .jackdawrc config editor',
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

  // When the config editor opens (via the `config` command or the header button),
  // surface the terminal and seed the editor draft with the current rc text.
  useEffect(() => {
    if (isConfigEditorOpen) {
      setIsOpen(true);
      setRcDraft(rcText || '');
    }
  }, [isConfigEditorOpen, rcText]);

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
              <button
                type="button"
                onClick={() => setConfigEditorOpen(true)}
                className="px-1 h-4 rounded border border-[var(--color-border-main)] text-[9px] leading-none text-[var(--color-text-muted)] hover:text-white hover:border-white/40 transition-colors"
                title="Edit .jackdawrc config (aliases)"
                aria-label="Open config editor"
              >
                rc
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

          {suggestions.length > 0 && (
            <div className="px-2 py-0.5 border-t border-[var(--color-border-inner)] bg-black/10 flex items-center gap-2 overflow-hidden">
              <span className="text-[9px] text-[var(--color-text-muted)] opacity-60 shrink-0">Tab</span>
              {suggestions.map((s, i) => (
                <span
                  key={s}
                  className={`text-[10px] font-mono ${i === 0 ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`}
                >
                  {s}
                </span>
              ))}
            </div>
          )}

          <form
            className="h-8 border-t border-[var(--color-border-main)] px-2 bg-[var(--color-bg-sidebar)] flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const current = input;
              setInput('');
              if (!current.trim()) return;
              pushTerminalHistory(current);
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
                  // Non-empty input → accept the top autocomplete suggestion.
                  // Empty input → blur (lets Tab toggle focus out of the terminal).
                  if (suggestions.length > 0) {
                    setInput(suggestions[0] + ' ');
                  } else {
                    (event.currentTarget as HTMLInputElement).blur();
                  }
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

          {isConfigEditorOpen && (
            <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-[1px] flex items-center justify-center p-6">
              <div className="w-full max-w-2xl max-h-[80vh] rounded border border-[var(--color-border-main)] bg-[var(--color-bg-sidebar)] flex flex-col overflow-hidden">
                <div className="h-8 px-3 border-b border-[var(--color-border-main)] flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">.jackdawrc — aliases &amp; config</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={async () => { await saveRcText(rcDraft); setConfigEditorOpen(false); }}
                      className="text-[10px] px-2 py-0.5 rounded bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/40 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/30 transition-colors"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfigEditorOpen(false)}
                      className="text-[10px] px-2 py-0.5 rounded text-[var(--color-text-muted)] hover:text-white hover:bg-white/10 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-hidden p-3 bg-[var(--color-bg-deep)]/30 flex flex-col gap-2">
                  <p className="text-[10px] text-[var(--color-text-muted)] opacity-70 leading-4">
                    One alias per line: <span className="font-mono text-[var(--color-text-muted)]">alias &lt;name&gt; = &lt;command&gt;</span>. Lines starting with # are comments. Copy/paste to share your setup.
                  </p>
                  <textarea
                    value={rcDraft}
                    onChange={(e) => setRcDraft(e.target.value)}
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="none"
                    placeholder={'# JackDAW config\nalias rec = arm sel\nalias bounce = e\nalias z = spectrum'}
                    className="flex-1 min-h-[200px] w-full resize-none bg-[var(--color-bg-deep)]/50 border border-[var(--color-border-inner)] rounded p-2 text-[12px] font-mono text-white outline-none focus:border-[var(--color-accent)]/50"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
