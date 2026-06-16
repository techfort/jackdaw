import React, { useState } from 'react';
import { useStore } from '../store';
import { authService, storageMode } from '../services/storage';
import { Edit2, User as UserIcon, LogIn, LogOut } from 'lucide-react';

interface UserIdentitySectionProps {
  getUserColor: (id: string) => string;
}

export const UserIdentitySection: React.FC<UserIdentitySectionProps> = ({ getUserColor }) => {
  const currentUser = useStore(state => state.currentUser);
  const [showEdit, setShowEdit] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
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
      setShowEdit(false);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="mb-5 p-3 bg-white/[0.03] rounded-xl border border-white/10">
      {!showEdit ? (
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
            onClick={() => { setNewName(currentUser?.name || ''); setShowEdit(true); }}
            className="p-1.5 hover:bg-white/5 rounded-lg transition-colors text-white/20 hover:text-[var(--color-accent)]"
          >
            <Edit2 size={12} />
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-[9px] font-black text-[var(--color-accent)] uppercase tracking-widest">Identify Yourself</h3>
            <button onClick={() => setShowEdit(false)} className="text-[8px] text-white/30 hover:text-white uppercase font-black">Cancel</button>
          </div>

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
  );
};
