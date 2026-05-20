import React, { useState, useEffect } from 'react';
import { UserPlus, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { storageService } from '../services/storage';
import { Project, Invite } from '../services/storage/types';
import { motion } from 'motion/react';

interface InviteAcceptProps {
  inviteId: string;
  projectId: string;
  onAccepted: () => void;
  onDismiss: () => void;
}

export const InviteAccept: React.FC<InviteAcceptProps> = ({ inviteId, projectId, onAccepted, onDismiss }) => {
  const [project, setProject] = useState<Project | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [proj, invites] = await Promise.all([
          storageService.getProject(projectId),
          storageService.listInvites(projectId)
        ]);
        setProject(proj);
        const inv = invites.find(i => i.id === inviteId) || null;
        setInvite(inv);
      } catch (err: any) {
        setError(err.message || 'Failed to load invite');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [inviteId, projectId]);

  const handleAccept = async () => {
    setAccepting(true);
    setError('');
    try {
      await storageService.acceptInvite(inviteId, projectId);
      setAccepted(true);
      setTimeout(onAccepted, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to accept invite');
    } finally {
      setAccepting(false);
    }
  };

  const roleLabel = (role: string) => {
    if (role === 'owner') return 'Owner';
    if (role === 'editor') return 'Editor';
    return 'Viewer';
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200] backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm mx-4 bg-[var(--color-bg-sidebar)] border border-[var(--color-border-main)] rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="p-2.5 bg-[var(--color-accent)]/10 rounded-xl">
              <UserPlus size={20} className="text-[var(--color-accent)]" />
            </div>
            <button onClick={onDismiss} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors text-white/40 hover:text-white">
              <X size={16} />
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-[var(--color-text-muted)] animate-pulse">Loading invite...</p>
          ) : accepted ? (
            <div className="text-center py-4">
              <CheckCircle2 size={40} className="text-emerald-400 mx-auto mb-3" />
              <p className="text-sm font-bold text-white">Joined! Welcome to {project?.name}.</p>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-black text-white mb-1">You've been invited</h2>
              <p className="text-sm text-[var(--color-text-muted)] mb-5">
                Join <span className="text-white font-bold">{project?.name || projectId}</span> as{' '}
                <span className="text-[var(--color-accent)] font-bold">{invite ? roleLabel(invite.role) : '...'}</span>
              </p>

              {invite && (
                <div className="p-3 bg-[var(--color-bg-deep)] rounded-xl border border-[var(--color-border-inner)] mb-5 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--color-text-muted)]">Invited email</span>
                    <span className="text-white font-mono">{invite.email}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--color-text-muted)]">Role</span>
                    <span className="text-[var(--color-accent)] font-bold uppercase">{invite.role}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[var(--color-text-muted)]">Expires</span>
                    <span className="text-white">{new Date(invite.expiresAt).toLocaleDateString()}</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg mb-4">
                  <AlertCircle size={14} className="text-red-400 shrink-0" />
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={onDismiss}
                  className="flex-1 py-2.5 border border-[var(--color-border-main)] rounded-lg text-xs font-bold text-[var(--color-text-muted)] hover:text-white hover:border-white/20 transition-all"
                >
                  Decline
                </button>
                <button
                  onClick={handleAccept}
                  disabled={accepting || !invite}
                  className="flex-1 py-2.5 bg-[var(--color-accent)] text-black rounded-lg text-xs font-black uppercase tracking-widest hover:brightness-110 disabled:opacity-50 transition-all"
                >
                  {accepting ? 'Joining...' : 'Join Project'}
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};
