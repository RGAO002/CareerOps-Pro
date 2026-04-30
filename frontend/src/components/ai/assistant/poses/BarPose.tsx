// frontend/src/components/ai/assistant/poses/BarPose.tsx
'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useResumeStore } from '@/components/resume/v2/store/useResumeStore';
import { useConversationStore } from '@/stores/conversation';
import { useAssistantStore } from '@/stores/assistant';
import { startAssistantRun } from '@/components/ai/session';
import { FluidCanvas } from '@/components/landing/FluidCanvas';
import { Mark } from '../parts/Mark';
import { MiniButton } from '../parts/MiniButton';
import { AgentChips } from '../parts/AgentChips';
import { QuickChips } from '../parts/QuickChips';
import { ChatTab } from '../tabs/ChatTab';

const shellTransition = { type: 'spring' as const, stiffness: 300, damping: 30 };

function FluidBackdrop({ compact = false }: { compact?: boolean }) {
  // Read agent mask so the orbs in the bar/expanded poses match the same
  // selection state as the sidebar — chip click in any pose updates them
  // all consistently.
  const agentMask = useAssistantStore((s) => s.agentMask);
  const orbW = (() => {
    const count = (agentMask.recruit ? 1 : 0) + (agentMask.hm ? 1 : 0) + (agentMask.coach ? 1 : 0);
    const scale = count === 1 ? 1.7 : count === 2 ? 1.35 : 1.0;
    return {
      recruit: agentMask.recruit ? scale : 0,
      hm: agentMask.hm ? scale : 0,
      coach: agentMask.coach ? scale : 0,
    };
  })();
  if (!compact) {
    return (
      <>
        <div aria-hidden style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          mixBlendMode: 'screen',
          filter: 'blur(10px) saturate(1.2)',
          opacity: 0.6,
        }}>
          <FluidCanvas
            className="absolute inset-0"
            forceAnimate speed={3} brightness={2.4}
            recruitWeight={orbW.recruit} hmWeight={orbW.hm} coachWeight={orbW.coach}
          />
        </div>
        <div aria-hidden style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          pointerEvents: 'none',
          background: 'linear-gradient(180deg, oklch(0.10 0.018 34 / 0.05) 0%, oklch(0.10 0.018 34 / 0.3) 100%)',
        }} />
      </>
    );
  }

  return (
    <>
      <div aria-hidden style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        mixBlendMode: 'screen',
        filter: 'blur(14px) saturate(1.35)',
        opacity: 0.58,
      }}>
        <FluidCanvas
          className="absolute inset-0"
          forceAnimate speed={3.4} brightness={2.2}
          recruitWeight={orbW.recruit} hmWeight={orbW.hm} coachWeight={orbW.coach}
        />
      </div>
      <div aria-hidden style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1,
        pointerEvents: 'none',
        background: 'linear-gradient(90deg, oklch(0.11 0.020 34 / 0.50), oklch(0.13 0.024 34 / 0.30), oklch(0.10 0.018 34 / 0.54))',
      }} />
      <div aria-hidden style={{
        position: 'absolute',
        inset: 0,
        zIndex: 2,
        pointerEvents: 'none',
        background: 'linear-gradient(180deg, oklch(1 0 0 / 0.10), transparent 28%)',
        opacity: 0.42,
      }} />
    </>
  );
}

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
        transition={shellTransition}
        style={{
          position: 'fixed', bottom: 24, left: '50%', marginLeft: -180,
          width: 360, height: 44, borderRadius: 22,
          background: 'oklch(0.22 0.028 34 / 0.55)',
          border: '1px solid var(--p-border)',
          backdropFilter: 'blur(24px) saturate(1.25)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.25)',
          boxShadow: '0 10px 34px rgba(0,0,0,0.32), 0 1px 0 oklch(1 0 0 / 0.08) inset',
          display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px',
          color: 'var(--p-text-body)', cursor: 'pointer',
          font: 'var(--ai-w-ui) 12px/1 var(--ai-font)',
          zIndex: 40,
          overflow: 'hidden',
        }}
      >
        <FluidBackdrop compact />
        <span style={{ position: 'relative', zIndex: 3, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Mark size={20} />
          <span style={{ letterSpacing: '-0.01em' }}>Ask AI…</span>
        </span>
      </motion.button>
    );
  }

  // ─── COMPACT (520×48) ────────────────────────────────────────────────────
  if (barSize === 'compact') {
    return (
      <motion.div
        layoutId="ai-assistant-shell"
        role="complementary" aria-label="AI assistant"
        transition={shellTransition}
        style={{
          position: 'fixed', bottom: 24, left: '50%', marginLeft: -260,
          width: 520, height: 48, borderRadius: 12,
          background: 'oklch(0.22 0.028 34 / 0.55)',
          border: '1px solid var(--p-border)',
          backdropFilter: 'blur(24px) saturate(1.25)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.25)',
          boxShadow: '0 8px 28px rgba(0,0,0,0.30), 0 1px 0 oklch(1 0 0 / 0.08) inset',
          display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px 0 12px',
          zIndex: 40,
          overflow: 'hidden',
        }}
      >
        <FluidBackdrop compact />
        <div style={{ position: 'relative', zIndex: 3, display: 'flex', alignItems: 'center', gap: 10, width: '100%', height: '100%' }}>
          <button
            type="button" aria-label="Collapse to pill" onClick={collapseBar}
            style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', display: 'grid', placeItems: 'center' }}
          ><Mark /></button>
          <span style={{
            display: 'inline-flex', gap: 6, alignItems: 'center',
            font: 'var(--ai-w-ui) 10.5px/1 var(--ai-font)', color: 'var(--p-text-mute)',
            padding: '4px 8px', borderRadius: 6, border: '1px solid var(--p-border)',
            background: 'oklch(0.18 0.025 34 / 0.24)',
            letterSpacing: '0.01em',
          }}>
            <i style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--p-accent)' }} />
            Editor · CareerOps
          </span>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
              placeholder="Ask anything about your job search…"
              style={{ flex: 1, border: 0, outline: 'none', background: 'transparent', font: 'var(--ai-w-body) 13px/1.4 var(--ai-font)', color: 'var(--p-text)', minWidth: 0, caretColor: 'var(--p-accent-warm)' }}
            />
            <span style={{
              font: '500 9.5px/1 var(--ai-font-mono)', letterSpacing: '0.04em',
              color: 'var(--p-text-mute)', padding: '3px 5px', borderRadius: 5,
              background: 'oklch(0.18 0.025 34 / 0.55)', border: '1px solid var(--p-border)',
            }}>⌘K</span>
          </div>
          <MiniButton ariaLabel="Expand to chat" onClick={expandBar}>
            <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M18 15l-6-6-6 6" /></svg>
          </MiniButton>
          <MiniButton ariaLabel="Send" onClick={onSubmit} variant="solid">
            <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M22 2 11 13" /><path d="M22 2l-7 20-4-9-9-4z" />
            </svg>
          </MiniButton>
        </div>
      </motion.div>
    );
  }

  // ─── EXPANDED (720×440) — global chat card, visually aligned with sidebar
  return (
    <motion.div
      layoutId="ai-assistant-shell"
      role="complementary" aria-label="AI assistant expanded"
      transition={shellTransition}
      style={{
        position: 'fixed', bottom: 24, left: '50%', marginLeft: -360,
        width: 720, height: 440, borderRadius: 16,
        background: 'oklch(0.13 0.022 34 / 0.5)',
        border: '1px solid var(--p-border)',
        backdropFilter: 'blur(10px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
        boxShadow: '0 18px 52px rgba(0,0,0,0.42), 0 1px 0 oklch(1 0 0 / 0.08) inset',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        zIndex: 40,
      }}
    >
      <FluidBackdrop />
      {/* Header */}
      <div style={{ position: 'relative', zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--p-border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Mark />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ font: 'var(--ai-w-strong) 13px/1 var(--ai-font)', color: 'var(--p-text)', letterSpacing: '-0.005em' }}>AI assistant</span>
            <span style={{ font: '500 10px/1 var(--ai-font-mono)', color: 'var(--p-text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Global chat · CareerOps</span>
          </div>
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
      <div style={{ position: 'relative', zIndex: 3, flex: 1, overflowY: 'auto', padding: '18px 20px 10px' }}>
        <ChatTab />
      </div>

      {/* Footer input */}
      <div style={{ position: 'relative', zIndex: 3, padding: '12px 18px 16px', borderTop: '1px solid var(--p-border)', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
        <AgentChips />
        <div style={{ flex: 1, display: 'flex', gap: 8, alignItems: 'center', padding: '11px 12px', borderRadius: 11, background: 'var(--p-surface)', border: '1px solid var(--p-border)' }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
            placeholder="Ask anything about your job search…"
            style={{ flex: 1, border: 0, outline: 'none', background: 'transparent', font: 'var(--ai-w-body) 13px/1.5 var(--ai-font)', color: 'var(--p-text-body)', caretColor: 'var(--p-accent-warm)', minWidth: 0 }}
          />
          <MiniButton ariaLabel="Send" onClick={onSubmit} variant="solid">
            <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M22 2 11 13" /><path d="M22 2l-7 20-4-9-9-4z" />
            </svg>
          </MiniButton>
        </div>
        <QuickChips onPick={(c) => setInput((cur) => cur ? `${cur} ${c}` : c)} />
      </div>
    </motion.div>
  );
}
