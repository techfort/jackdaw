import React, { useState, useEffect } from 'react';
import { UserPlus, Crown, Edit2, Eye, Trash2, AlertCircle, Mail } from 'lucide-react';
import { useStore } from '../store';
import { storageService } from '../services/storage';
import { Member, Invite, Role } from '../services/storage/types';

export const MembersPanel: React.FC = () => {
  const { currentProjectId, currentUserRole, currentUser } = useStore();

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('editor');
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState('');

  const isOwner = currentUserRole === 'owner';

  useEffect(() => {
    if (!currentProjectId) return;
    load();
  }, [currentProjectId]);

  const load = async () => {
    if (!currentProjectId) return;
    const [m, i] = await Promise.all([
      storageService.getMembers(currentProjectId),
      storageService.listInvites(currentProjectId)
    ]);
    setMembers(m);
    setInvites(i.filter(inv => inv.status === 'pending'));
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProjectId || !inviteEmail.trim()) return;
    setSending(true);
    setSendStatus('');
    try {
      await storageService.inviteToProject(currentProjectId, inviteEmail.trim(), inviteRole);
      setInviteEmail('');
      setSendStatus('Invite sent!');
      await load();
    } catch (err: any) {
      setSendStatus(err.message || 'Failed to send invite');
    } finally {
      setSending(false);
    }
  };

  const handleRevoke = async (inviteId: string) => {
    if (!currentProjectId) return;
    await storageService.revokeInvite(currentProjectId, inviteId);
    await load();
  };

  const roleIcon = (role: Role) => {
    if (role === 'owner') return <Crown size={10} className="text-amber-400" />;
    if (role === 'editor') return <Edit2 size={10} className="text-blue-400" />;
    return <Eye size={10} className="text-white/30" />;
  };

  const roleLabel = (role: Role) => {
    if (role === 'owner') return 'Owner';
    if (role === 'editor') return 'Editor';
    return 'Viewer';
  };

  if (!currentProjectId) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 opacity-30">
        <p className="text-[10px] uppercase font-black tracking-widest text-center">No project loaded</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-6">
      {/* Invite form — owner only */}
      {isOwner && (
        <div>
          <h3 className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-3">Invite Collaborator</h3>
          <form onSubmit={handleInvite} className="space-y-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="email@example.com"
              required
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[var(--color-accent)]/50"
            />
            <div className="flex gap-2">
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as Role)}
                className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[var(--color-accent)]/50"
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <button
                type="submit"
                disabled={sending}
                className="flex items-center gap-1.5 bg-[var(--color-accent)] text-black px-3 py-2 rounded-lg text-[10px] font-black uppercase hover:brightness-110 disabled:opacity-50 transition-all"
              >
                <UserPlus size={12} />
                {sending ? 'Sending...' : 'Invite'}
              </button>
            </div>
            {sendStatus && (
              <p className={`text-[10px] font-bold ${sendStatus.includes('sent') ? 'text-emerald-400' : 'text-red-400'}`}>
                {sendStatus}
              </p>
            )}
          </form>
        </div>
      )}

      {/* Members list */}
      <div>
        <h3 className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-3">
          Members ({members.length})
        </h3>
        {members.length === 0 ? (
          <p className="text-[10px] text-[var(--color-text-dark)] italic">No members yet.</p>
        ) : (
          <div className="space-y-2">
            {members.map(m => (
              <div key={m.userId} className="flex items-center justify-between p-2.5 bg-white/[0.03] rounded-lg border border-white/5">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-zinc-700 flex items-center justify-center text-[10px] font-black text-white border border-white/10">
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white leading-none">
                      {m.name}
                      {m.userId === currentUser?.id && <span className="text-[8px] text-white/30 ml-1">(you)</span>}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {roleIcon(m.role)}
                      <span className="text-[8px] text-white/30 uppercase font-bold">{roleLabel(m.role)}</span>
                      {m.role === 'owner' && (
                        <span className="text-[8px] text-[var(--color-accent)] uppercase font-black tracking-widest ml-1">
                          Project owner
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending invites — owner only */}
      {isOwner && invites.length > 0 && (
        <div>
          <h3 className="text-[9px] font-black uppercase tracking-widest text-[var(--color-text-muted)] mb-3">
            Pending Invites ({invites.length})
          </h3>
          <div className="space-y-2">
            {invites.map(inv => (
              <div key={inv.id} className="flex items-center justify-between p-2.5 bg-white/[0.03] rounded-lg border border-white/5">
                <div className="flex items-center gap-2">
                  <Mail size={12} className="text-[var(--color-text-muted)] shrink-0" />
                  <div>
                    <div className="text-xs text-white font-mono">{inv.email}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {roleIcon(inv.role)}
                      <span className="text-[8px] text-white/30 uppercase font-bold">{roleLabel(inv.role)}</span>
                      <span className="text-[8px] text-white/20">· expires {new Date(inv.expiresAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleRevoke(inv.id)}
                  className="p-1.5 hover:bg-red-500/10 text-white/20 hover:text-red-400 rounded transition-all"
                  title="Revoke invite"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
