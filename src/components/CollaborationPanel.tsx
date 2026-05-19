import React, { useState } from 'react';
import { useStore } from '../store';
import { 
  CheckCircle2, 
  Circle, 
  MessageSquare, 
  Clock, 
  User as UserIcon,
  Filter,
  Search,
  ChevronRight,
  TrendingUp,
  AlertCircle,
  Target
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';

export const CollaborationPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { 
    comments, 
    tracks, 
    toggleResolveComment, 
    removeComment,
    setCurrentTime,
    currentTime
  } = useStore();
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('open');
  const [search, setSearch] = useState('');

  const filteredComments = comments.filter(c => {
    const matchesFilter = filter === 'all' || (filter === 'open' ? !c.isResolved : c.isResolved);
    const matchesSearch = c.text.toLowerCase().includes(search.toLowerCase()) || 
                         c.userName.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  }).sort((a, b) => b.createdAt - a.createdAt);

  const getTrackName = (trackId: string) => {
    return tracks.find(t => t.id === trackId)?.name || 'Unknown Track';
  };

  const openCount = comments.filter(c => !c.isResolved).length;

  const getUserColor = (userId: string) => {
    const colors = [
      'bg-blue-500', 'bg-purple-500', 'bg-pink-500', 
      'bg-amber-500', 'bg-emerald-500', 'bg-indigo-500',
      'bg-rose-500', 'bg-cyan-500'
    ];
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const getUserRole = (userName: string) => {
    const name = userName.toLowerCase();
    if (name.includes('producer') || name.includes('admin')) return 'Producer';
    if (name.includes('artist') || name.includes('vocal')) return 'Artist';
    if (name.includes('engineer') || name.includes('mix')) return 'Engineer';
    return 'Collaborator';
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'Producer': return <TrendingUp size={8} className="text-amber-400" />;
      case 'Artist': return <MessageSquare size={8} className="text-pink-400" />;
      case 'Engineer': return <Target size={8} className="text-blue-400" />;
      default: return <UserIcon size={8} className="text-white/20" />;
    }
  };

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  const item = {
    hidden: { x: 20, opacity: 0 },
    show: { x: 0, opacity: 1 }
  };

  return (
    <motion.div 
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="w-[400px] h-full bg-[var(--color-bg-surface)] border-l border-[var(--color-border-main)] flex flex-col shadow-2xl z-50 overflow-hidden"
    >
      {/* Header */}
      <div className="p-5 border-b border-[var(--color-border-main)] bg-[var(--color-bg-deep)]">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[var(--color-accent)] shadow-[0_0_15px_rgba(242,125,38,0.2)] rounded-xl">
              <TrendingUp size={20} className="text-black" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-white">Project Hub</h2>
              <div className="flex items-center gap-2">
                <span className="flex h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
                <p className="text-[9px] text-[var(--color-text-muted)] font-black uppercase tracking-tighter">
                  {openCount} unresolved tasks
                </p>
              </div>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-full transition-colors text-white/40 hover:text-white"
          >
            <ChevronRight size={24} />
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-white/[0.03] p-3 rounded-xl border border-white/5">
            <div className="text-[8px] text-white/30 font-black uppercase tracking-widest mb-1">Status</div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
              <div className="text-[10px] font-black text-white uppercase tracking-tight">Active</div>
            </div>
          </div>
          <div className="bg-white/[0.03] p-3 rounded-xl border border-white/5">
            <div className="text-[8px] text-white/30 font-black uppercase tracking-widest mb-1">Backlog</div>
            <div className="text-[11px] font-black text-[var(--color-accent)]">{comments.length}</div>
          </div>
          <div className="bg-white/[0.03] p-3 rounded-xl border border-white/5">
            <div className="text-[8px] text-white/30 font-black uppercase tracking-widest mb-1">Health</div>
            <div className="text-[11px] font-black text-white">
              {comments.length > 0 ? Math.round((comments.filter(c => c.isResolved).length / comments.length) * 100) : 100}%
            </div>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="space-y-3">
          <div className="relative group">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-[var(--color-accent)] transition-colors" />
            <input 
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search feedback..."
              className="w-full bg-black/40 border border-white/10 rounded-lg py-2.5 pl-9 pr-4 text-[11px] font-medium focus:outline-none focus:border-[var(--color-accent)]/50 focus:ring-1 focus:ring-[var(--color-accent)]/20 placeholder:text-white/10 transition-all"
            />
          </div>
          <div className="flex gap-1.5 bg-black/20 p-1 rounded-lg border border-white/5">
            {(['open', 'resolved', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${
                  filter === f 
                    ? 'bg-zinc-700 text-white shadow-lg' 
                    : 'text-white/30 hover:text-white hover:bg-white/5'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4">
        {filteredComments.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-20 text-center px-10">
            <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center mb-4 border border-white/5">
                <AlertCircle size={32} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] leading-relaxed">No production notes found in this scope</p>
          </div>
        ) : (
          <motion.div 
            variants={container}
            initial="hidden"
            animate="show"
            className="space-y-4"
          >
            {filteredComments.map((comment) => (
              <motion.div 
                variants={item}
                key={comment.id}
                className={`group relative p-4 rounded-xl border transition-all duration-300 ${
                  comment.isResolved 
                    ? 'bg-white/[0.02] border-white/5 opacity-50 grayscale select-none' 
                    : 'bg-white/[0.03] border-white/10 hover:border-[var(--color-accent)]/40 hover:bg-white/[0.05] shadow-sm'
                }`}
              >
                <div className="flex gap-4">
                  <div className="flex flex-col items-center gap-2 pt-0.5">
                    <button 
                      onClick={() => toggleResolveComment(comment.id)}
                      className={`shrink-0 transition-all transform hover:scale-110 ${
                        comment.isResolved 
                          ? 'text-emerald-500' 
                          : 'text-white/20 hover:text-[var(--color-accent)]'
                      }`}
                      title={comment.isResolved ? "Unresolve" : "Resolve note"}
                    >
                      {comment.isResolved ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                    </button>
                    {!comment.isResolved && (
                      <div className="w-[1px] flex-1 bg-white/[0.05]" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-2">
                       <div className="flex items-center gap-2 overflow-hidden">
                        <span className="flex items-center gap-1.5 text-[9px] font-black text-[var(--color-accent)] uppercase tracking-widest truncate bg-[var(--color-accent)]/10 px-2 py-0.5 rounded border border-[var(--color-accent)]/10">
                          <MessageSquare size={10} />
                          {getTrackName(comment.trackId)}
                        </span>
                        {comment.isResolved && (
                           <span className="text-[8px] font-bold text-emerald-500 uppercase tracking-widest px-1.5 py-0.5 bg-emerald-500/10 rounded">
                             Done
                           </span>
                        )}
                       </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button 
                          onClick={() => setCurrentTime(comment.timestamp)}
                          className="flex items-center gap-1 text-[9px] bg-white/10 px-2 py-0.5 rounded-full font-mono font-bold text-white/50 hover:bg-[var(--color-accent)] hover:text-black hover:scale-105 active:scale-95 transition-all"
                        >
                          <Clock size={10} />
                          {Math.floor(comment.timestamp / 60)}:{(comment.timestamp % 60).toFixed(1).padStart(4, '0')}
                        </button>
                        {!comment.isResolved && (
                          <button 
                            onClick={() => removeComment(comment.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-500 transition-all rounded hover:bg-rose-500/10"
                          >
                            <AlertCircle size={12} />
                          </button>
                        )}
                      </div>
                    </div>

                    <p className={`text-[12px] leading-relaxed mb-4 font-medium transition-all ${comment.isResolved ? 'text-white/30 line-through decoration-white/20' : 'text-white/90'}`}>
                      {comment.text}
                    </p>

                    <div className="flex items-center justify-between mt-auto">
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-lg ${getUserColor(comment.userId)} flex items-center justify-center shadow-lg border border-white/10`}>
                          <span className="text-[10px] font-black text-white">
                            {comment.userName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-white/80 leading-none mb-0.5">
                            {comment.userName}
                          </span>
                          <div className="flex items-center gap-1">
                            {getRoleIcon(getUserRole(comment.userName))}
                            <span className="text-[8px] font-bold text-white/30 uppercase tracking-tighter">
                              {getUserRole(comment.userName)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[9px] text-white/20 font-bold uppercase tracking-tighter">
                          Posted
                        </span>
                        <span className="text-[10px] text-white/40 font-mono leading-none">
                          {format(comment.createdAt || Date.now(), 'HH:mm')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Active Indicator Bar */}
                {Math.abs(currentTime - comment.timestamp) < 0.2 && !comment.isResolved && (
                  <motion.div 
                    layoutId="active-comment"
                    className="absolute -left-1 top-3 bottom-3 w-1.5 bg-[var(--color-accent)] rounded-full shadow-[0_0_15px_rgba(242,125,38,0.5)] z-20" 
                  />
                )}
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* Footer / Workflow Tip */}
      <div className="p-4 bg-[var(--color-bg-deep)] border-t border-[var(--color-border-main)]">
        <div className="flex items-center gap-3 p-3 bg-white/[0.02] rounded-xl border border-white/5 group hover:border-[var(--color-accent)]/20 transition-colors">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-accent)]/10 flex items-center justify-center shrink-0 group-hover:bg-[var(--color-accent)]/20 transition-all">
            <AlertCircle size={14} className="text-[var(--color-accent)]" />
          </div>
          <p className="text-[10px] font-medium leading-relaxed text-white/40 group-hover:text-white/60 transition-colors">
            Production notes are synced in <span className="text-white/80 font-bold">real-time</span>. Use markers (1/2) to bound export regions for review.
          </p>
        </div>
      </div>
    </motion.div>
  );
};
