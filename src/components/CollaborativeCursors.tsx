import React from 'react';
import { useStore } from '../store';
import { motion } from 'motion/react';
import { User } from 'lucide-react';

export const CollaborativeCursors: React.FC = () => {
  const { remotePresences, zoom } = useStore();

  return (
    <div className="absolute inset-0 pointer-events-none z-50">
      {remotePresences.map((presence) => (
        <motion.div
          key={presence.userId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, x: presence.cursorPosition * zoom }}
          transition={{ type: 'spring', damping: 25, stiffness: 120 }}
          className="absolute top-0 bottom-0 w-[2px] bg-[var(--color-accent)]/40 flex flex-col items-center"
        >
          <div className="bg-[var(--color-accent)] text-black text-[9px] px-1.5 py-0.5 rounded-full font-black whitespace-nowrap -translate-y-1/2 flex items-center gap-1 shadow-lg border border-black/20">
            <User size={10} />
            {presence.userName}
          </div>
        </motion.div>
      ))}
    </div>
  );
};
