// frontend/src/components/ai/assistant/poses/OrbPose.tsx
'use client';
import { motion } from 'framer-motion';
import { useAssistantStore } from '@/stores/assistant';

/**
 * Orb pose — 44×44 collapsed pill at bottom-right. Click → sidebar.
 * Per design_handoff_ai_sidebar/README.md §C. No spinning halo (v0 simplification).
 */
export function OrbPose() {
  return (
    <motion.button
      layoutId="ai-assistant-shell"
      type="button"
      aria-label="Open assistant"
      onClick={() => useAssistantStore.getState().setPose('sidebar')}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        width: 44,
        height: 44,
        borderRadius: 999,
        background: 'var(--p-bar-base)',
        border: '1px solid var(--p-border)',
        backdropFilter: 'blur(20px) saturate(1.1)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.1)',
        boxShadow: '0 6px 18px rgba(0,0,0,0.30)',
        display: 'grid',
        placeItems: 'center',
        cursor: 'pointer',
        zIndex: 40,
      }}
    >
      <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="var(--p-accent-warm)" strokeWidth={1.5} aria-hidden>
        <polygon points="12 2 14.5 9.5 22 12 14.5 14.5 12 22 9.5 14.5 2 12 9.5 9.5" />
      </svg>
    </motion.button>
  );
}
