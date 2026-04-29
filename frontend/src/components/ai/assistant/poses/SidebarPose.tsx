// frontend/src/components/ai/assistant/poses/SidebarPose.tsx
'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { FluidCanvas } from '@/components/landing/FluidCanvas';
import { useAssistantStore, type AssistantTab } from '@/stores/assistant';
import { useResumeStore } from '@/components/resume/v2/store/useResumeStore';
import { useConversationStore } from '@/stores/conversation';
import { startAssistantRun } from '@/components/ai/session';
import { Mark } from '../parts/Mark';
import { MiniButton } from '../parts/MiniButton';
import { ScopePill } from '../parts/ScopePill';
import { AgentChips } from '../parts/AgentChips';
import { QuickChips } from '../parts/QuickChips';
import { ChatTab } from '../tabs/ChatTab';
import { SuggestionsTab } from '../tabs/SuggestionsTab';
import { HistoryTab } from '../tabs/HistoryTab';

const TABS: AssistantTab[] = ['chat', 'suggestions', 'history'];
const TAB_LABEL: Record<AssistantTab, string> = { chat: 'Chat', suggestions: 'Suggestions', history: 'History' };

/**
 * Sidebar pose — 368px wide, pinned to the right edge from top:56 to bottom:0.
 * Per design_handoff_ai_sidebar/README.md §B.
 */
export function SidebarPose() {
  const tab = useAssistantStore((s) => s.tab);
  const setTab = useAssistantStore((s) => s.setTab);
  const setPose = useAssistantStore((s) => s.setPose);
  const isStreaming = useAssistantStore((s) => s.activeRunId !== null);
  const [input, setInput] = useState('');

  const onSubmit = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    const resume = useResumeStore.getState().resume;
    if (!resume) return;
    useConversationStore.getState().appendMessage({ kind: 'user', content: text });
    setInput('');
    try {
      await startAssistantRun({ resumeId: resume.id, userInput: text, selection: [], chatHistory: [] });
    } catch (e) {
      useConversationStore.getState().appendMessage({ kind: 'ai-text', content: `AI 调用失败：${String(e)}` });
    }
  };

  return (
    <motion.aside
      layoutId="ai-assistant-shell"
      role="complementary" aria-label="AI assistant sidebar"
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      style={{
        position: 'fixed', top: 56, right: 0, bottom: 0,
        width: 368, borderRadius: 0,
        background: 'var(--p-sidebar-base)',
        borderLeft: '1px solid var(--p-border)',
        zIndex: 40,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <FluidCanvas className="absolute inset-0 z-0" forceAnimate speed={1} brightness={1.0} />
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'oklch(0.08 0.015 34 / 0.55)', zIndex: 1, pointerEvents: 'none' }} />

      {/* Header row */}
      <div style={{ position: 'relative', zIndex: 3, padding: '14px 18px 0', borderBottom: '1px solid var(--p-border)', paddingBottom: 14, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Mark size={24} />
            <span style={{ font: '600 13px/1 Inter, sans-serif', color: 'var(--p-text)' }}>AI assistant</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <MiniButton ariaLabel="New thread" onClick={() => useConversationStore.getState().clearConversation()}>
              <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M12 5v14M5 12h14" /></svg>
            </MiniButton>
            <MiniButton ariaLabel="Dock to bar" onClick={() => setPose('bar')}>
              <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M6 9l6 6 6-6" /></svg>
            </MiniButton>
            <MiniButton ariaLabel="Minimize to orb" onClick={() => setPose('orb')}>
              <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M5 12h14" /></svg>
            </MiniButton>
          </div>
        </div>

        {/* Tabs (underline style) */}
        <div role="tablist" style={{ display: 'flex', position: 'relative' }}>
          {TABS.map((t) => {
            const active = t === tab;
            return (
              <button
                key={t}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t)}
                style={{
                  position: 'relative',
                  padding: '6px 0', marginRight: 18,
                  border: 0, background: 'transparent',
                  font: '500 12px/1 Inter, sans-serif',
                  color: active ? 'var(--p-text)' : 'var(--p-text-mute)',
                  cursor: 'pointer',
                }}
              >
                {TAB_LABEL[t]}
                {active && <i style={{ position: 'absolute', left: 0, right: 0, bottom: -14, height: 1, background: 'var(--p-accent)' }} />}
              </button>
            );
          })}
        </div>

        {/* Scope pill */}
        <div style={{ marginTop: 12 }}><ScopePill /></div>
      </div>

      {/* Body (scrollable) */}
      <div style={{ position: 'relative', zIndex: 3, flex: 1, overflowY: 'auto', padding: '18px 18px 8px' }}>
        {tab === 'chat' && <ChatTab />}
        {tab === 'suggestions' && <SuggestionsTab />}
        {tab === 'history' && <HistoryTab />}
      </div>

      {/* Footer (hidden on history) */}
      {tab !== 'history' && (
        <div style={{ position: 'relative', zIndex: 3, padding: '10px 14px 14px', borderTop: '1px solid var(--p-border)', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
          <AgentChips />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 6px 6px 12px', borderRadius: 10, background: 'var(--p-surface)', border: '1px solid var(--p-border)' }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
              placeholder="Reply or @ an agent…"
              style={{ flex: 1, border: 0, outline: 'none', background: 'transparent', font: '400 13px/1.4 Inter, sans-serif', color: 'var(--p-text)', minWidth: 0 }}
            />
            <MiniButton ariaLabel="Send" onClick={onSubmit} variant="solid">
              <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M22 2 11 13" /><path d="M22 2l-7 20-4-9-9-4z" />
              </svg>
            </MiniButton>
          </div>
          <QuickChips onPick={(c) => setInput((cur) => cur ? `${cur} ${c}` : c)} />
        </div>
      )}
    </motion.aside>
  );
}
