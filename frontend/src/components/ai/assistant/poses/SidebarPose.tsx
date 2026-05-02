// frontend/src/components/ai/assistant/poses/SidebarPose.tsx
'use client';
import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FluidCanvas } from '@/components/landing/FluidCanvas';
import { useAssistantStore, type AssistantTab } from '@/stores/assistant';
import { useResumeStore } from '@/components/resume/v2/store/useResumeStore';
import { useConversationStore } from '@/stores/conversation';
import { startAssistantRun } from '@/components/ai/session';
import { Mark } from '../parts/Mark';
import { MiniButton } from '../parts/MiniButton';
import { ScopePill } from '../parts/ScopePill';
import { CopReviewBlock } from './CopReviewBlock';
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
  const agentMask = useAssistantStore((s) => s.agentMask);
  const [input, setInput] = useState('');

  // Custom scroll indicator — same approach as EditorShellCop. macOS
  // Chrome's OS-overlay scrollbar refuses to honor `::-webkit-scrollbar`
  // styling on `overflow: auto` flex children, so we hide the native one
  // and render a JS-driven thin pill. Color tied to body.cop-s-N stages
  // for fade-in/out alongside the editor scrollbar.
  const bodyRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const body = bodyRef.current;
    const indicator = indicatorRef.current;
    if (!body || !indicator) return;

    let fadeTimer: ReturnType<typeof setTimeout> | null = null;
    let isDraggingIndicator = false;

    const setOpacity = (v: string) => {
      indicator.style.setProperty('opacity', v);
    };

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = body;
      if (scrollHeight <= clientHeight + 1) {
        setOpacity('0');
        return;
      }
      const indicatorH = Math.max(28, (clientHeight / scrollHeight) * clientHeight);
      const maxTranslate = clientHeight - indicatorH;
      const translateY = (scrollTop / (scrollHeight - clientHeight)) * maxTranslate;
      indicator.style.height = `${indicatorH}px`;
      indicator.style.transform = `translateY(${translateY}px)`;
    };

    const showAndScheduleFade = () => {
      setOpacity('1');
      if (fadeTimer) clearTimeout(fadeTimer);
      fadeTimer = setTimeout(() => {
        if (!isDraggingIndicator) setOpacity('0');
      }, 700);
    };

    const onScroll = () => {
      update();
      showAndScheduleFade();
    };

    const onDown = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isDraggingIndicator = true;
      setOpacity('1');
      if (fadeTimer) clearTimeout(fadeTimer);
      const startY = e.clientY;
      const startScrollTop = body.scrollTop;
      const trackH = body.clientHeight - indicator.offsetHeight;
      const scrollRange = body.scrollHeight - body.clientHeight;
      const ratio = scrollRange / Math.max(1, trackH);
      const onMove = (ev: MouseEvent) => {
        ev.preventDefault();
        body.scrollTop = startScrollTop + (ev.clientY - startY) * ratio;
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.body.style.userSelect = '';
        isDraggingIndicator = false;
        showAndScheduleFade();
      };
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };
    const blockEvent = (e: Event) => { e.preventDefault(); e.stopPropagation(); };

    update();
    body.addEventListener('scroll', onScroll, { passive: true });
    indicator.addEventListener('mousedown', onDown);
    indicator.addEventListener('dblclick', blockEvent);
    indicator.addEventListener('contextmenu', blockEvent);
    const ro = new ResizeObserver(update);
    ro.observe(body);
    if (body.firstElementChild) ro.observe(body.firstElementChild as Element);
    return () => {
      body.removeEventListener('scroll', onScroll);
      if (fadeTimer) clearTimeout(fadeTimer);
      indicator.removeEventListener('mousedown', onDown);
      indicator.removeEventListener('dblclick', blockEvent);
      indicator.removeEventListener('contextmenu', blockEvent);
      ro.disconnect();
    };
  }, []);

  // Translate the agent mask into per-orb weights for FluidCanvas.
  // count===3 → all on at baseline (1.0). count===2 → those two slightly
  // emphasised (1.35). count===1 → keep it restrained; a single full-strength
  // color wash makes the whole glass panel too red/green/blue.
  // count===0 is prevented by the store (auto-promotes to 'all').
  const orbWeights = (() => {
    const count = (agentMask.recruit ? 1 : 0) + (agentMask.hm ? 1 : 0) + (agentMask.coach ? 1 : 0);
    const scale = count === 1 ? 1.05 : count === 2 ? 1.35 : 1.0;
    return {
      count,
      recruit: agentMask.recruit ? scale : 0,
      hm: agentMask.hm ? scale : 0,
      coach: agentMask.coach ? scale : 0,
    };
  })();

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
      // Slide-in / slide-out — pure horizontal translation, no fade. Reads
      // as a heavy floating glass slab gliding in from / out to the right.
      // Tween (not spring) so there's no wobble at the end; long-ish
      // duration + decelerating curve gives the "weighty" feel.
      initial={{ x: '110%' }}
      animate={{ x: 0 }}
      exit={{ x: '110%' }}
      transition={{ duration: 0.65, ease: [0.5, 0.5, 0.5, 1] }}
      style={{
        // Floating panel — inset from all edges, rounded corners, heavy
        // shadow so it reads as a card hovering above the editor surface.
        // Editor route overrides the inset / radius / shadow vars to make
        // it float; other routes get the default look (still inset but
        // less dramatic).
        position: 'fixed',
        top: 'var(--assistant-top-offset, 16px)',
        right: 'var(--assistant-right-offset, 16px)',
        bottom: 'var(--assistant-bottom-offset, 16px)',
        width: 'var(--assistant-width, 336px)',
        borderRadius: 'var(--assistant-radius, 20px)',
        background: 'oklch(0.13 0.022 34 / 0.55)',
        backdropFilter: 'blur(14px) saturate(1.25)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.25)',
        borderLeft: 'var(--assistant-border-left, 1px solid var(--p-border))',
        boxShadow: 'var(--assistant-shadow, 0 24px 60px -12px oklch(0.10 0.02 50 / 0.45), 0 8px 24px -8px oklch(0.10 0.02 50 / 0.30), 0 1px 2px oklch(0.10 0.02 50 / 0.15))',
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
        filter: 'blur(10px) saturate(1.2)',
        opacity: 0.6,
      }}>
        <FluidCanvas
          className="absolute inset-0"
          forceAnimate speed={3} brightness={orbWeights.count === 1 ? 1.85 : 2.4}
          recruitWeight={orbWeights.recruit}
          hmWeight={orbWeights.hm}
          coachWeight={orbWeights.coach}
        />
      </div>
      {/* Minimal scrim — kept very low so the sidebar reads as nearly
          transparent. Bumps slightly at the bottom where the input lives so
          placeholder/typing stays legible. */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'linear-gradient(180deg, oklch(0.10 0.018 34 / 0.05) 0%, oklch(0.10 0.018 34 / 0.3) 100%)',
      }} />

      {/* Header row */}
      <div style={{ position: 'relative', zIndex: 3, padding: '14px 18px 0', borderBottom: '1px solid var(--p-border)', paddingBottom: 14, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Mark size={24} />
            <span style={{ font: 'var(--ai-w-strong) 13px/1 var(--ai-font)', color: 'var(--p-text)', letterSpacing: '-0.01em' }}>AI assistant</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <MiniButton ariaLabel="New thread" onClick={() => useConversationStore.getState().clearConversation()}>
              <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M12 5v14M5 12h14" /></svg>
            </MiniButton>
            <MiniButton ariaLabel="Dock to bar" onClick={() => setPose('bar')}>
              <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M6 9l6 6 6-6" /></svg>
            </MiniButton>
            <MiniButton ariaLabel="Close assistant" onClick={() => setPose('orb')}>
              <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M6 6l12 12M18 6L6 18" /></svg>
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
                  font: 'var(--ai-w-ui) 12px/1 var(--ai-font)', letterSpacing: '-0.005em',
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

      {/* Body (scrollable). Wrapped in a position-relative container so
          the custom scroll indicator can overlay its right edge. */}
      <div style={{ position: 'relative', zIndex: 3, flex: 1, minHeight: 0 }}>
        <div
          ref={bodyRef}
          className="cop-sidebar-scroll"
          style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: '18px 18px 8px' }}
        >
          <CopReviewBlock />
          {tab === 'chat' && <ChatTab />}
          {tab === 'suggestions' && <SuggestionsTab />}
          {tab === 'history' && <HistoryTab />}
        </div>
        <div ref={indicatorRef} className="cop-sidebar-indicator"/>
      </div>

      {/* Footer (hidden on history). Per design `.a-foot`:
            padding 14/18/16, gap 10, transparent bg, top border. */}
      {tab !== 'history' && (
        <div style={{ position: 'relative', zIndex: 3, padding: '14px 18px 16px', borderTop: '1px solid var(--p-border)', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
          <AgentChips />
          {/* `.side-input` — surface bg, hairline border, radius 11, padding 11/12 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 12px', borderRadius: 11, background: 'var(--p-surface)', border: '1px solid var(--p-border)' }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
              placeholder="Reply or @ an agent…"
              style={{
                flex: 1, border: 0, outline: 'none', background: 'transparent',
                font: 'var(--ai-w-body) 13px/1.5 var(--ai-font)',
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
