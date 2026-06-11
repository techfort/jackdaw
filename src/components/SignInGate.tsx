import React, { useState } from 'react';
import { authService } from '../services/storage';

interface SignInGateProps {
  isMagicLinkPending: boolean;
  urlInviteContext: { inviteId: string; projectId: string } | null;
  onCompleteMagicLink: (email: string, displayName: string) => Promise<void>;
}

export const SignInGate: React.FC<SignInGateProps> = ({ isMagicLinkPending, urlInviteContext, onCompleteMagicLink }) => {
  const [signInEmail, setSignInEmail] = useState('');
  const [signInDisplayName, setSignInDisplayName] = useState('');
  const [signInSent, setSignInSent] = useState(false);
  const [signInError, setSignInError] = useState('');

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signInEmail.trim()) return;
    if (!signInDisplayName.trim()) {
      setSignInError('Display name is required.');
      return;
    }
    setSignInError('');

    if (isMagicLinkPending) {
      await onCompleteMagicLink(signInEmail.trim(), signInDisplayName.trim());
      return;
    }

    try {
      await authService.signInMagicLink(signInEmail.trim(), signInDisplayName.trim());
      setSignInSent(true);
    } catch (err: any) {
      setSignInError(err.message || 'Failed to send sign-in link');
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-[var(--color-bg-deep)] text-[#adbac7]">
      <div className="w-full max-w-sm p-8 bg-[var(--color-bg-sidebar)] border border-[var(--color-border-main)] rounded-xl shadow-2xl">
        <h1 className="text-xl font-black uppercase tracking-widest mb-1 text-white">JackDAW</h1>
        <p className="text-xs text-[var(--color-text-muted)] mb-6">
          {isMagicLinkPending ? 'Confirm your email to complete sign-in' : 'Sign in to collaborate'}
        </p>

        {urlInviteContext && !signInSent && (
          <div className="mb-5 p-3 bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 rounded-lg">
            <p className="text-xs text-[var(--color-accent)] font-bold leading-relaxed">
              You have a pending invitation. Sign in to accept it and join the project.
            </p>
          </div>
        )}

        {signInSent ? (
          <p className="text-sm text-[var(--color-accent)] font-bold">
            Check your email — a sign-in link is on its way to {signInEmail}.
          </p>
        ) : (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <input
                type="email"
                value={signInEmail}
                onChange={e => setSignInEmail(e.target.value)}
                placeholder="your@email.com"
                required
                autoFocus
                className="w-full bg-[var(--color-bg-deep)] border border-[var(--color-border-inner)] rounded px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-accent)]"
              />
            </div>
            <div>
              <input
                type="text"
                value={signInDisplayName}
                onChange={e => setSignInDisplayName(e.target.value)}
                placeholder="Display name (required)"
                required
                className="w-full bg-[var(--color-bg-deep)] border border-[var(--color-border-inner)] rounded px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-accent)]"
              />
              <p className="text-[10px] text-[var(--color-text-muted)] mt-1">Shown to your collaborators</p>
            </div>
            {signInError && <p className="text-xs text-red-400">{signInError}</p>}
            <button
              type="submit"
              className="w-full bg-[var(--color-accent)] text-black font-black uppercase tracking-widest text-xs py-2.5 rounded hover:brightness-110 transition-all"
            >
              {isMagicLinkPending ? 'Complete Sign-in' : 'Send Sign-in Link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
