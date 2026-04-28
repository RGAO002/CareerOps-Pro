// frontend/src/components/ai/AISidebar.tsx
'use client';
import { useEffect, useState } from 'react';
import { useAISidebarUIStore } from '@/stores/aiSidebarUI';
import { useSuggestionStore, type Suggestion, suggestionBlockId } from '@/stores/aiSuggestion';
import { useResumeStore } from '@/components/resume/v2/store/useResumeStore';
import { AISidebarRow } from './AISidebarRow';
import { applySuggestions } from './applySuggestion';

export function AISidebar() {
  const isOpen = useAISidebarUIStore((s) => s.isOpen);
  const close = useAISidebarUIStore((s) => s.close);
  const scope = useAISidebarUIStore((s) => s.scopedToBlockId);
  const byId = useSuggestionStore((s) => s.byId);
  const resume = useResumeStore((s) => s.resume);
  const [working, setWorking] = useState(false);

  // Responsive: when narrow + open, body class lets AppShell collapse the left nav.
  useEffect(() => {
    function update() {
      const narrow = window.innerWidth < 1400;
      document.body.classList.toggle('ai-sidebar-open-narrow', isOpen && narrow);
    }
    update();
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      document.body.classList.remove('ai-sidebar-open-narrow');
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const allItems: Suggestion[] = Object.values(byId);
  const visible = scope
    ? allItems.filter((s) => _scopeMatches(s, scope, resume))
    : allItems;
  const pending = visible.filter((s) => s.status !== 'rejected');

  async function onAcceptAll() {
    // ★ Scope-respecting Accept all: pass ONLY the currently-visible pending
    // ids. Without this, applyAllInRun(runId) would also accept Suggestions
    // that the current sidebar scope filters out — silent over-acceptance.
    const visiblePendingIds = pending
      .filter((s) => s.status === 'pending')
      .map((s) => s.id);
    setWorking(true);
    try { await applySuggestions(visiblePendingIds); }
    finally { setWorking(false); }
  }

  async function onRejectAll() {
    setWorking(true);
    try {
      for (const s of pending.filter((x) => x.status === 'pending')) {
        useSuggestionStore.getState().markStatusLocally(s.id, 'rejected');
        await useSuggestionStore.getState().postStatusToBackend(s.id, 'rejected');
      }
    } finally { setWorking(false); }
  }

  return (
    <aside
      data-testid="ai-sidebar"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 360,
        background: '#fbf6ee',
        borderLeft: '1px solid #c9c0b3',
        boxShadow: '-2px 0 8px rgba(0,0,0,0.08)',
        zIndex: 100,
        padding: 12,
        overflowY: 'auto',
        boxSizing: 'border-box',
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 600 }}>✦ AI · {pending.length} change{pending.length === 1 ? '' : 's'}</span>
        <button onClick={close} aria-label="Close sidebar" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
      </header>

      {pending.length === 0 && (
        <p style={{ color: '#6b6258', fontSize: 12 }}>No pending suggestions in scope.</p>
      )}

      {pending.map((s) => (
        <AISidebarRow key={s.id} suggestion={s} />
      ))}

      {pending.length > 0 && (
        <footer style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #e0d8c9', display: 'flex', gap: 6 }}>
          <button onClick={onAcceptAll} disabled={working} style={{ background: '#1c6b1c', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 3, cursor: 'pointer' }}>
            ✓ Accept all
          </button>
          <button onClick={onRejectAll} disabled={working} style={{ background: '#aa3333', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: 3, cursor: 'pointer' }}>
            ✗ Reject all
          </button>
        </footer>
      )}
    </aside>
  );
}

function _scopeMatches(s: Suggestion, scope: string, resume: ReturnType<typeof useResumeStore.getState>['resume']): boolean {
  const target = suggestionBlockId(s);
  if (target === scope) return true;
  // Also match if `scope` is an ancestor of the target (entry contains bullet, section contains entry).
  if (!resume) return false;
  for (const sec of resume.sections) {
    if (sec.id !== scope) continue;
    for (const e of sec.entries) {
      if (e.id === target) return true;
      for (const b of e.bullets) if (b.id === target) return true;
    }
  }
  for (const sec of resume.sections) for (const e of sec.entries) {
    if (e.id !== scope) continue;
    for (const b of e.bullets) if (b.id === target) return true;
  }
  return false;
}
