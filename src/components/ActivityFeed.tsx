import React from 'react';
import { useStore } from '../store';
import { ActivityEvent } from '../types';
import { MessageSquare, CheckCircle2, Circle, Clock, Activity, Music2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const EVENT_ICONS: Record<string, React.ReactNode> = {
  track_added: <Music2 size={12} className="text-white" />,
  track_removed: <Music2 size={12} className="text-white/40" />,
  comment_added: <MessageSquare size={12} className="text-white" />,
  comment_resolved: <CheckCircle2 size={12} className="text-emerald-400" />,
  comment_reopened: <Circle size={12} className="text-amber-400" />,
  comment_status_changed: <Clock size={12} className="text-blue-400" />,
};

const getEventDisplay = (ev: ActivityEvent, getTrackName: (id: string) => string): { label: string; detail: string } => {
  const p = ev.payload;
  switch (ev.kind) {
    case 'track_added':
      return { label: String(p.trackName || 'Unnamed'), detail: 'Track added' };
    case 'track_removed':
      return { label: String(p.trackName || 'Track'), detail: 'Track removed' };
    case 'comment_added': {
      const text = String(p.text || '');
      return { label: text.length > 60 ? `${text.slice(0, 60)}…` : text, detail: `Note on ${getTrackName(String(p.trackId || ''))}` };
    }
    case 'comment_resolved': {
      const ids = p.commentIds as string[] | undefined;
      if (ids && ids.length > 1) return { label: `${ids.length} notes resolved`, detail: 'Batch resolve' };
      return { label: `#${p.commentId || (ids && ids[0]) || '?'}`, detail: 'Note resolved' };
    }
    case 'comment_reopened':
      return { label: `#${String(p.commentId || '?')}`, detail: 'Note reopened' };
    case 'comment_status_changed':
      return { label: `#${String(p.commentId || '?')}`, detail: `${String(p.from || '')} → ${String(p.to || '')}` };
    default:
      return { label: 'Event', detail: ev.kind };
  }
};

export const ActivityFeed: React.FC<{ getUserColor: (id: string) => string }> = ({ getUserColor }) => {
  const activityEvents = useStore(state => state.activityEvents);
  const tracks = useStore(state => state.tracks);
  const getTrackName = (trackId: string) => tracks.find(t => t.id === trackId)?.name || 'Unknown Track';

  const sorted = [...activityEvents].sort((a, b) => b.timestamp - a.timestamp);

  if (sorted.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center opacity-20 text-center px-10">
        <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center mb-4 border border-white/5">
          <Activity size={32} />
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] leading-relaxed">No activity yet</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 space-y-2">
      {sorted.map(ev => {
        const { label, detail } = getEventDisplay(ev, getTrackName);
        return (
          <div key={ev.id} className="flex gap-3 items-start p-3 rounded-xl bg-white/[0.02] border border-white/5">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border border-white/10 ${getUserColor(ev.actor.userId)}`}>
              {EVENT_ICONS[ev.kind] ?? <MessageSquare size={12} className="text-white" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black text-white/80 leading-snug truncate">{label}</p>
              <p className="text-[9px] text-white/30 font-bold uppercase tracking-tighter">{detail}</p>
              <p className="text-[9px] text-[var(--color-accent)] font-bold mt-0.5">{ev.actor.userName}</p>
            </div>
            <span className="text-[8px] text-white/20 font-mono shrink-0 mt-0.5" title={new Date(ev.timestamp).toLocaleString()}>
              {formatDistanceToNow(ev.timestamp, { addSuffix: true })}
            </span>
          </div>
        );
      })}
    </div>
  );
};
