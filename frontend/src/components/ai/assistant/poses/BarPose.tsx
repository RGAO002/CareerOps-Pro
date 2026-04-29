// frontend/src/components/ai/assistant/poses/BarPose.tsx
'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useResumeStore } from '@/components/resume/v2/store/useResumeStore';
import { useConversationStore } from '@/stores/conversation';
import { useAssistantStore } from '@/stores/assistant';
import { startAssistantRun } from '@/components/ai/session';
import { Mark } from '../parts/Mark';
import { MiniButton } from '../parts/MiniButton';

/**
 * Bar pose — 520×48 quiet command bar at bottom-center.
 * Per design_handoff_ai_sidebar/README.md §A.
 *
 * No FluidCanvas in this pose — the bar is intentionally a flat dark surface.
 */
export function BarPose() {
  const [input, setInput] = useState('');
  const isStreaming = useAssistantStore((s) => s.activeRunId !== null);

  const onSubmit = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    const resume = useResumeStore.getState().resume;
    if (!resume) {
      useConversationStore.getState().appendMessage({ kind: 'ai-text', content: 'AI 仅在加载简历后可用。' });
      return;
    }
    useConversationStore.getState().appendMessage({ kind: 'user', content: text });
    setInput('');
    try {
      await startAssistantRun({ resumeId: resume.id, userInput: text, selection: [], chatHistory: [] });
    } catch (e) {
      useConversationStore.getState().appendMessage({ kind: 'ai-text', content: `AI 调用失败：${String(e)}` });
    }
  };

  return (
    <motion.div
      layoutId="ai-assistant-shell"
      role="complementary"
      aria-label="AI assistant"
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 520,
        height: 48,
        borderRadius: 12,
        background: 'var(--p-bar-base)',
        border: '1px solid var(--p-border)',
        backdropFilter: 'blur(20px) saturate(1.1)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.1)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.35), 0 1px 0 oklch(1 0 0 / 0.04) inset',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 10px 0 12px',
        zIndex: 40,
      }}
    >
      <Mark />
      <span
        style={{
          display: 'inline-flex', gap: 6, alignItems: 'center',
          font: '500 10.5px/1 Inter, sans-serif',
          color: 'var(--p-text-mute)',
          padding: '4px 8px',
          borderRadius: 6,
          border: '1px solid var(--p-border)',
        }}
      >
        <i style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--p-accent)' }} />
        Editor · v0
      </span>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
        placeholder="Ask anything about your job search…"
        style={{
          flex: 1, border: 0, outline: 'none', background: 'transparent',
          font: '400 13px/1.4 Inter, sans-serif',
          color: 'var(--p-text)',
          minWidth: 0,
        }}
      />
      <span
        style={{
          font: '500 9.5px/1 "JetBrains Mono", monospace',
          letterSpacing: '0.04em',
          color: 'var(--p-text-mute)',
          padding: '3px 5px',
          borderRadius: 5,
          background: 'oklch(0.18 0.025 34 / 0.55)',
          border: '1px solid var(--p-border)',
        }}
      >⌘K</span>
      <MiniButton ariaLabel="Send" onClick={onSubmit} variant="solid">
        <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M22 2 11 13" /><path d="M22 2l-7 20-4-9-9-4z" />
        </svg>
      </MiniButton>
    </motion.div>
  );
}
