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
    if (!resume) {
      useConversationStore.getState().appendMessage({ kind: 'ai-text', content: 'AI 仅在加载简历后可用（resume 未在 store 中找到）。' });
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
    <motion.aside
      layoutId="ai-assistant-shell"
      role="complementary" aria-label="AI assistant sidebar"
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      style={{
        position: 'fixed', top: 56, right: 0, bottom: 0,
        width: 368, borderRadius: 0,
        // EXACT design-spec values — `.assist` bg is `oklch(0.22 0.028 34 / .55)`
        // and `backdrop-filter: blur(24px) saturate(1.3)`. The lighter base
        // (0.22 vs the v1 0.13) is what gives the panel its premium see-through
        // feel — too-dark bg flattens everything to murky glass.
        background: 'oklch(0.22 0.028 34 / 0.55)',
        backdropFilter: 'blur(24px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
        borderLeft: '1px solid var(--p-border)',
        zIndex: 40,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* WebGL three-color fluid (the original 三色小球). Two finishing
          touches make it feel like the design's premium frosted look:
            (1) `filter: blur(40px) saturate(1.3)` on the canvas itself —
                design's CSS shader has `blur(44px)` baked in; without
                blurring our WebGL output, the orbs read as crisp blobs
                instead of soft color washes. The blur turns them into a
                diffuse glow that bleeds into the bg.
            (2) `mix-blend-mode: screen` so dark vignette pixels drop out
                and only the brightened orb light "adds" to the lighter
                panel base. */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        mixBlendMode: 'screen',
        filter: 'blur(40px) saturate(1.3)',
      }}>
        <FluidCanvas className="absolute inset-0" forceAnimate speed={3} brightness={1.8} />
      </div>
      {/* Subtle scrim — design `.a-scrim` uses `linear-gradient(180deg,
          oklch(.14 .020 34 / .25), oklch(.14 .020 34 / .42))`. */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'linear-gradient(180deg, oklch(0.14 0.020 34 / 0.25) 0%, oklch(0.14 0.020 34 / 0.42) 100%)',
      }} />

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

      {/* Footer (hidden on history). Per design `.a-foot`:
            padding 14/18/16, gap 10, transparent bg, top border. */}
      {tab !== 'history' && (
        <div style={{ position: 'relative', zIndex: 3, padding: '14px 18px 16px', borderTop: '1px solid var(--p-border)', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
          <AgentChips />
          {/* `.side-input` — surface bg, hairline border, radius 11, padding 11/12 */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '11px 12px', borderRadius: 11, background: 'var(--p-surface)', border: '1px solid var(--p-border)' }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
              placeholder="Reply or @ an agent…"
              style={{
                flex: 1, border: 0, outline: 'none', background: 'transparent',
                font: '400 13px/1.5 Inter, sans-serif',
                color: 'var(--p-text-body)',
                caretColor: 'var(--p-accent-warm)',
                minWidth: 0,
              }}
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
