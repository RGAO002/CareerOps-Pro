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
import { ChatTab } from '../tabs/ChatTab';

/**
 * Bar pose — three-tier sizing per user request (revives the legacy
 * AIChatPanel collapsed/compact/expanded model on top of the new design).
 *
 * - collapsed: 360×44 — slim pill, click to grow
 * - compact:   520×48 — quiet command bar (default, design_handoff §A)
 * - expanded:  720×400 — chat card with conversation history above the input
 */
export function BarPose() {
  const [input, setInput] = useState('');
  const isStreaming = useAssistantStore((s) => s.activeRunId !== null);
  const barSize = useAssistantStore((s) => s.barSize);
  const expandBar = useAssistantStore((s) => s.expandBar);
  const collapseBar = useAssistantStore((s) => s.collapseBar);
  const setBarSize = useAssistantStore((s) => s.setBarSize);

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
    if (barSize === 'collapsed') setBarSize('expanded');
    try {
      await startAssistantRun({ resumeId: resume.id, userInput: text, selection: [], chatHistory: [] });
    } catch (e) {
      useConversationStore.getState().appendMessage({ kind: 'ai-text', content: `AI 调用失败：${String(e)}` });
    }
  };

  // ─── COLLAPSED (360×44) ──────────────────────────────────────────────────
  if (barSize === 'collapsed') {
    return (
      <motion.button
        layoutId="ai-assistant-shell"
        type="button"
        onClick={() => setBarSize('compact')}
        aria-label="Expand AI assistant"
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{
          position: 'fixed', bottom: 24, left: '50%', marginLeft: -180,
          width: 360, height: 44, borderRadius: 22,
          background: 'var(--p-bar-base)',
          border: '1px solid var(--p-border)',
          backdropFilter: 'blur(20px) saturate(1.1)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.1)',
          boxShadow: '0 8px 28px rgba(0,0,0,0.35), 0 1px 0 oklch(1 0 0 / 0.04) inset',
          display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px',
          color: 'var(--p-text-mute)', cursor: 'pointer',
          font: '500 12px/1 Inter, sans-serif',
          zIndex: 40,
        }}
      >
        <Mark size={20} />
        <span>Ask AI…</span>
      </motion.button>
    );
  }

  // ─── COMPACT (520×48) ────────────────────────────────────────────────────
  if (barSize === 'compact') {
    return (
      <motion.div
        layoutId="ai-assistant-shell"
        role="complementary" aria-label="AI assistant"
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{
          position: 'fixed', bottom: 24, left: '50%', marginLeft: -260,
          width: 520, height: 48, borderRadius: 12,
          background: 'var(--p-bar-base)',
          border: '1px solid var(--p-border)',
          backdropFilter: 'blur(20px) saturate(1.1)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.1)',
          boxShadow: '0 8px 28px rgba(0,0,0,0.35), 0 1px 0 oklch(1 0 0 / 0.04) inset',
          display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px 0 12px',
          zIndex: 40,
        }}
      >
        <button
          type="button" aria-label="Collapse to pill" onClick={collapseBar}
          style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', display: 'grid', placeItems: 'center' }}
        ><Mark /></button>
        <span style={{
          display: 'inline-flex', gap: 6, alignItems: 'center',
          font: '500 10.5px/1 Inter, sans-serif', color: 'var(--p-text-mute)',
          padding: '4px 8px', borderRadius: 6, border: '1px solid var(--p-border)',
        }}>
          <i style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--p-accent)' }} />
          Editor · v0
        </span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
          placeholder="Ask anything about your job search…"
          style={{ flex: 1, border: 0, outline: 'none', background: 'transparent', font: '400 13px/1.4 Inter, sans-serif', color: 'var(--p-text)', minWidth: 0 }}
        />
        <MiniButton ariaLabel="Expand to chat" onClick={expandBar}>
          <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M18 15l-6-6-6 6" /></svg>
        </MiniButton>
        <span style={{
          font: '500 9.5px/1 "JetBrains Mono", monospace', letterSpacing: '0.04em',
          color: 'var(--p-text-mute)', padding: '3px 5px', borderRadius: 5,
          background: 'oklch(0.18 0.025 34 / 0.55)', border: '1px solid var(--p-border)',
        }}>⌘K</span>
        <MiniButton ariaLabel="Send" onClick={onSubmit} variant="solid">
          <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M22 2 11 13" /><path d="M22 2l-7 20-4-9-9-4z" />
          </svg>
        </MiniButton>
      </motion.div>
    );
  }

  // ─── EXPANDED (720×440) — chat card with history ─────────────────────────
  return (
    <motion.div
      layoutId="ai-assistant-shell"
      role="complementary" aria-label="AI assistant expanded"
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      style={{
        position: 'fixed', bottom: 24, left: '50%', marginLeft: -360,
        width: 720, height: 440, borderRadius: 16,
        background: 'var(--p-sidebar-base)',
        border: '1px solid var(--p-border)',
        backdropFilter: 'blur(24px) saturate(1.15)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.15)',
        boxShadow: '0 12px 36px rgba(0,0,0,0.40), 0 1px 0 oklch(1 0 0 / 0.05) inset',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        zIndex: 40,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--p-border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Mark />
          <span style={{ font: '600 13px/1 Inter, sans-serif', color: 'var(--p-text)' }}>AI assistant</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <MiniButton ariaLabel="Collapse to bar" onClick={collapseBar}>
            <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M6 9l6 6 6-6" /></svg>
          </MiniButton>
          <MiniButton ariaLabel="Collapse to pill" onClick={() => setBarSize('collapsed')}>
            <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M5 12h14" /></svg>
          </MiniButton>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
        <ChatTab />
      </div>

      {/* Footer input */}
      <div style={{ padding: '10px 12px 12px', borderTop: '1px solid var(--p-border)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <div style={{ flex: 1, display: 'flex', gap: 8, alignItems: 'center', padding: '6px 6px 6px 12px', borderRadius: 10, background: 'var(--p-surface)', border: '1px solid var(--p-border)' }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
            placeholder="Ask anything about your job search…"
            style={{ flex: 1, border: 0, outline: 'none', background: 'transparent', font: '400 13px/1.4 Inter, sans-serif', color: 'var(--p-text)', minWidth: 0 }}
          />
          <MiniButton ariaLabel="Send" onClick={onSubmit} variant="solid">
            <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M22 2 11 13" /><path d="M22 2l-7 20-4-9-9-4z" />
            </svg>
          </MiniButton>
        </div>
      </div>
    </motion.div>
  );
}
