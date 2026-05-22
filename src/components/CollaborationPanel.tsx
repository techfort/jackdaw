import React, { useState } from 'react';
import { useStore } from '../store';
import { authService, storageMode } from '../services/storage';
import {
  CheckCircle2,
  Circle,
  MessageSquare,
  Clock,
  User as UserIcon,
  Search,
  ChevronRight,
  TrendingUp,
  AlertCircle,
  Target,
  LogIn,
  LogOut,
  Edit2,
  Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { MembersPanel } from './MembersPanel';

export const CollaborationPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const {
    comments,
    tracks,
    toggleResolveComment,
    setCommentStatus,
    removeComment,
    setCurrentTime,
    setSelectedTrackId,
    currentTime,
    currentUser
  } = useStore();
  const [activeTab, setActiveTab] = useState<'comments' | 'members'>('comments');
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('open');
  const [search, setSearch] = useState('');
  const [showIdentityEdit, setShowIdentityEdit] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newName, setNewName] = useState('');
  const [authStatus, setAuthStatus] = useState<string | null>(null);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail) return;
    try {
      setAuthStatus('Sending link...');
      await authService.signInMagicLink(newEmail, newDisplayName.trim() || undefined);
      setAuthStatus('Check your email!');
    } catch (err: any) {
      setAuthStatus(err.message);
    }
  };

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName) return;
    try {
      await authService.updateProfile(newName);
      setShowIdentityEdit(false);
    } catch (err) {
      console.error(err);
    }
  };

  const filteredComments = comments.filter(c => {
    const matchesFilter = filter === 'all' || (filter === 'open' ? c.status !== 'approved' : c.status === 'approved');
    const matchesSearch = c.text.toLowerCase().includes(search.toLowerCase()) ||
                         c.userName.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  }).sort((a, b) => b.createdAt - a.createdAt);

  const getTrackName = (trackId: string) => {
    return tracks.find(t => t.id === trackId)?.name || 'Unknown Track';
  };

  const openCount = comments.filter(c => c.status !== 'approved').length;

  const STATUS_LABELS: Record<string, string> = {
    open: 'Open',
    in_progress: 'In Progress',
    needs_review: 'Needs Review',
    approved: 'Approved',
  };

  const STATUS_COLORS: Record<string, string> = {
    open: 'text-white/50 bg-white/10',
    in_progress: 'text-amber-400 bg-amber-400/10',
    needs_review: 'text-blue-400 bg-blue-400/10',
    approved: 'text-emerald-500 bg-emerald-500/10',
  };

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
              <h2 className="text-sm font-black uppercase tracking-widest text-white">Collaboration</h2>
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

        {/* Tab switcher */}
        <div className="flex gap-1 bg-black/20 p-1 rounded-lg border border-white/5 mb-5">
          <button
            onClick={() => setActiveTab('comments')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === 'comments' ? 'bg-zinc-700 text-white shadow-lg' : 'text-white/30 hover:text-white hover:bg-white/5'}`}
          >
            <MessageSquare size={10} /> Notes
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === 'members' ? 'bg-zinc-700 text-white shadow-lg' : 'text-white/30 hover:text-white hover:bg-white/5'}`}
          >
            <Users size={10} /> Members
          </button>
        </div>

        {activeTab === 'members' ? null : (<>
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
              {comments.length > 0 ? Math.round((comments.filter(c => c.status === 'approved').length / comments.length) * 100) : 100}%
            </div>
          </div>
        </div>

        {/* User Identity Section */}
        <div className="mb-5 p-3 bg-white/[0.03] rounded-xl border border-white/10">
          {!showIdentityEdit ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg ${currentUser?.id ? getUserColor(currentUser.id) : 'bg-zinc-800'} flex items-center justify-center border border-white/10 shadow-lg`}>
                  <UserIcon size={14} className="text-white" />
                </div>
                <div>
                  <div className="text-[10px] font-black text-white leading-none mb-0.5">{currentUser?.name || 'Anonymous User'}</div>
                  <div className="text-[8px] text-white/30 uppercase font-bold tracking-tighter">
                    {storageMode === 'firebase' ? (currentUser?.isAnonymous ? 'Guest Mode' : 'Verified Actor') : 'Local Identity'}
                  </div>
                </div>
              </div>
              <button 
                onClick={() => {
                  setNewName(currentUser?.name || '');
                  setShowIdentityEdit(true);
                }}
                className="p-1.5 hover:bg-white/5 rounded-lg transition-colors text-white/20 hover:text-[var(--color-accent)]"
              >
                <Edit2 size={12} />
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-[9px] font-black text-[var(--color-accent)] uppercase tracking-widest">Identify Yourself</h3>
                <button onClick={() => setShowIdentityEdit(false)} className="text-[8px] text-white/30 hover:text-white uppercase font-black">Cancel</button>
              </div>

              {/* Name Edit */}
              <form onSubmit={handleUpdateName} className="flex gap-2">
                <input 
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Enter display name..."
                  className="flex-1 bg-black/40 border border-white/10 rounded-lg py-1.5 px-3 text-[10px] focus:outline-none focus:border-[var(--color-accent)]/50"
                />
                <button type="submit" className="bg-zinc-800 px-3 py-1 rounded-lg text-[9px] font-black uppercase text-white hover:bg-zinc-700 transition-colors">Set</button>
              </form>

              {/* Magic Link (Only if Firebase) */}
              {storageMode === 'firebase' && currentUser?.isAnonymous && (
                <div className="pt-2 border-t border-white/5">
                  <p className="text-[8px] text-white/40 mb-2 uppercase tracking-tighter">Sign in for persistent cloud identity</p>
                  <form onSubmit={handleSignIn} className="flex gap-2">
                    <input 
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="email@example.com"
                      className="flex-1 bg-black/40 border border-white/10 rounded-lg py-1.5 px-3 text-[10px] focus:outline-none focus:border-[var(--color-accent)]/50"
                    />
                    <input 
                      type="text"
                      value={newDisplayName}
                      onChange={(e) => setNewDisplayName(e.target.value)}
                      placeholder="Display name"
                      className="flex-1 bg-black/40 border border-white/10 rounded-lg py-1.5 px-3 text-[10px] focus:outline-none focus:border-[var(--color-accent)]/50"
                    />
                    <button type="submit" className="bg-[var(--color-accent)] px-3 py-1 rounded-lg text-[9px] font-black uppercase text-black hover:scale-105 transition-transform">
                      <LogIn size={10} />
                    </button>
                  </form>
                  {authStatus && <p className="text-[8px] text-[var(--color-accent)] mt-1 font-bold">{authStatus}</p>}
                </div>
              )}

              {storageMode === 'firebase' && !currentUser?.isAnonymous && (
                <button 
                  onClick={() => authService.signOut()}
                  className="w-full py-1.5 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-rose-500/20 transition-all"
                >
                  <LogOut size={10} /> Sign Out
                </button>
              )}
            </div>
          )}
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
        </>)}
      </div>

      {/* Members tab body */}
      {activeTab === 'members' && <MembersPanel />}

      {/* Task List (comments tab) */}
      {activeTab === 'comments' && <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4">
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
                  comment.status === 'approved'
                    ? 'bg-white/[0.02] border-white/5 opacity-50 grayscale select-none'
                    : 'bg-white/[0.03] border-white/10 hover:border-[var(--color-accent)]/40 hover:bg-white/[0.05] shadow-sm'
                }`}
              >
                <div className="flex gap-4">
                  <div className="flex flex-col items-center gap-2 pt-0.5">
                    <button
                      onClick={() => toggleResolveComment(comment.id)}
                      className={`shrink-0 transition-all transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 rounded ${
                        comment.status === 'approved'
                          ? 'text-emerald-500'
                          : 'text-white/20 hover:text-[var(--color-accent)]'
                      }`}
                      title={comment.status === 'approved' ? 'Reopen' : 'Mark approved'}
                      aria-label={comment.status === 'approved' ? `Reopen comment #${comment.id}` : `Mark comment #${comment.id} as approved`}
                    >
                      {comment.status === 'approved' ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                    </button>
                    {comment.status !== 'approved' && (
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
                        <select
                          value={comment.status}
                          onChange={(e) => setCommentStatus(comment.id, e.target.value as any)}
                          onClick={(e) => e.stopPropagation()}
                          className={`text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border-0 outline-none cursor-pointer ${STATUS_COLORS[comment.status] || STATUS_COLORS.open}`}
                          title="Set comment status"
                          aria-label="Comment status"
                        >
                          <option value="open">Open</option>
                          <option value="in_progress">In Progress</option>
                          <option value="needs_review">Needs Review</option>
                          <option value="approved">Approved</option>
                        </select>
                       </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => { setCurrentTime(comment.timestamp); setSelectedTrackId(comment.trackId); }}
                          className="flex items-center gap-1 text-[9px] bg-white/10 px-2 py-0.5 rounded-full font-mono font-bold text-white/50 hover:bg-[var(--color-accent)] hover:text-black hover:scale-105 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/60"
                          title="Jump to this comment on the timeline"
                          aria-label={`Jump to comment at ${Math.floor(comment.timestamp / 60)}:${(comment.timestamp % 60).toFixed(1).padStart(4, '0')} on track ${getTrackName(comment.trackId)}`}
                        >
                          <Clock size={10} />
                          {Math.floor(comment.timestamp / 60)}:{(comment.timestamp % 60).toFixed(1).padStart(4, '0')}
                        </button>
                        {comment.status !== 'approved' && (
                          <button
                            onClick={() => removeComment(comment.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-500 transition-all rounded hover:bg-rose-500/10"
                          >
                            <AlertCircle size={12} />
                          </button>
                        )}
                      </div>
                    </div>

                    <p className={`text-[12px] leading-relaxed mb-4 font-medium transition-all ${comment.status === 'approved' ? 'text-white/30 line-through decoration-white/20' : 'text-white/90'}`}>
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
                {Math.abs(currentTime - comment.timestamp) < 0.2 && comment.status !== 'approved' && (
                  <motion.div 
                    layoutId="active-comment"
                    className="absolute -left-1 top-3 bottom-3 w-1.5 bg-[var(--color-accent)] rounded-full shadow-[0_0_15px_rgba(242,125,38,0.5)] z-20" 
                  />
                )}
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>}

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
