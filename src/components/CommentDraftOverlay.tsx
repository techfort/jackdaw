import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { TrackData } from '../types';
import { storageService } from '../services/storage';
import { getAutocompleteQuery, mentionHandle } from '../lib/mentionUtils';

interface CommentDraftOverlayProps {
  track: TrackData;
  zoom: number;
  timestamp: number;
  onDismiss: () => void;
}

export const CommentDraftOverlay: React.FC<CommentDraftOverlayProps> = ({ track, zoom, timestamp, onDismiss }) => {
  const addComment = useStore(state => state.addComment);
  const currentProjectId = useStore(state => state.currentProjectId);
  const allComments = useStore(state => state.comments);

  const [draftText, setDraftText] = useState('');
  const [memberHandles, setMemberHandles] = useState<string[]>([]);
  const [acSuggestions, setAcSuggestions] = useState<{ type: 'mention' | 'tag'; items: string[] } | null>(null);
  const [acIndex, setAcIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const allTags = React.useMemo(
    () => [...new Set(allComments.flatMap(c => c.tags || []))].sort(),
    [allComments]
  );

  useEffect(() => {
    const pid = currentProjectId || 'local';
    storageService.getMembers(pid).then(members => {
      setMemberHandles(members.map(m => mentionHandle(m.name || m.userId)));
    }).catch(() => {});
  }, [currentProjectId]);

  const submitComment = () => {
    if (!draftText.trim()) return;
    addComment(track.id, timestamp, draftText.trim());
    onDismiss();
  };

  const handleDraftChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setDraftText(val);
    const cursor = e.target.selectionStart ?? val.length;
    const ac = getAutocompleteQuery(val, cursor);
    if (ac) {
      const q = ac.query.toLowerCase();
      const items = ac.type === 'mention'
        ? memberHandles.filter(h => h.toLowerCase().startsWith(q))
        : allTags.filter(t => t.startsWith(q));
      setAcSuggestions(items.length > 0 ? { type: ac.type, items } : null);
      setAcIndex(0);
    } else {
      setAcSuggestions(null);
    }
  };

  const acceptSuggestion = (item: string) => {
    const cursor = textareaRef.current?.selectionStart ?? draftText.length;
    const before = draftText.slice(0, cursor);
    const after = draftText.slice(cursor);
    const triggerMatch = before.match(/[@#]\w*$/);
    if (!triggerMatch) return;
    const trigger = triggerMatch[0][0];
    const replacement = `${trigger}${item} `;
    const newText = before.slice(0, before.length - triggerMatch[0].length) + replacement + after;
    setDraftText(newText);
    setAcSuggestions(null);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const pos = before.length - triggerMatch[0].length + replacement.length;
        textareaRef.current.setSelectionRange(pos, pos);
      }
    });
  };

  return (
    <div
      className="absolute top-0 bottom-0 w-[2px] bg-[var(--color-playhead)] z-50 pointer-events-none"
      style={{ left: 256 + ((Number(timestamp) || 0) * (Number(zoom) || 100)) }}
    >
      <div className="absolute top-4 left-2 flex flex-col gap-2 bg-[var(--color-bg-surface)] border border-[var(--color-playhead)] p-3 rounded-lg shadow-2xl z-50 w-64 animate-in fade-in zoom-in duration-200 pointer-events-auto">
        <span className="text-[10px] text-[var(--color-playhead)] font-black uppercase tracking-[0.2em]">Add Feedback</span>
        <div className="relative">
          <textarea
            ref={textareaRef}
            autoFocus
            value={draftText}
            onChange={handleDraftChange}
            onKeyDown={(e) => {
              if (acSuggestions) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setAcIndex(i => Math.min(i + 1, acSuggestions.items.length - 1)); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setAcIndex(i => Math.max(i - 1, 0)); return; }
                if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); acceptSuggestion(acSuggestions.items[acIndex]); return; }
                if (e.key === 'Escape') { setAcSuggestions(null); return; }
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitComment();
              }
              if (e.key === 'Escape') {
                onDismiss();
              }
            }}
            placeholder="Type your notes... (@mention #tag)"
            className="w-full bg-[var(--color-bg-deep)] border border-[var(--color-border-inner)] rounded p-2 text-xs text-white focus:outline-none focus:border-[var(--color-accent)] resize-none h-20"
          />
          {acSuggestions && (
            <div className="absolute bottom-full left-0 mb-1 w-full bg-[var(--color-bg-deep)] border border-[var(--color-border-main)] rounded shadow-xl z-10 overflow-hidden">
              {acSuggestions.items.slice(0, 6).map((item, i) => (
                <button
                  key={item}
                  onMouseDown={(e) => { e.preventDefault(); acceptSuggestion(item); }}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                    i === acIndex
                      ? acSuggestions.type === 'mention' ? 'bg-amber-400/20 text-amber-300' : 'bg-blue-400/20 text-blue-300'
                      : 'text-white/60 hover:bg-white/5'
                  }`}
                >
                  {acSuggestions.type === 'mention' ? `@${item}` : `#${item}`}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[9px] text-[var(--color-text-muted)]">Enter to save • Esc to cancel</span>
          <button
            onClick={submitComment}
            className="bg-[var(--color-playhead)] text-black px-3 py-1 rounded text-[10px] font-bold uppercase transition-transform active:scale-95"
          >
            Post
          </button>
        </div>
      </div>
    </div>
  );
};
