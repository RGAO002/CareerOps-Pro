// frontend/src/components/resume/v2/store/flush-save.ts
import { useResumeStore } from './useResumeStore';
import type { ResumeDoc } from '../types';

const DEBOUNCE_MS = 1500;

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type FlushController = {
  pendingTimer: ReturnType<typeof setTimeout> | null;
  inflight: Promise<void> | null;
  // version of resume that backend last ACK'd
  lastSavedDocSnapshot: string;     // JSON string for cheap equality
  // version of resume currently dirty (changed since last ACK)
  dirtyDocSnapshot: string;
  status: SaveStatus;
  lastSavedAt: number | null;
  listeners: Set<(s: SaveStatus) => void>;
};

const ctrl: FlushController = {
  pendingTimer: null,
  inflight: null,
  lastSavedDocSnapshot: '',
  dirtyDocSnapshot: '',
  status: 'idle',
  lastSavedAt: null,
  listeners: new Set(),
};

function setStatus(next: SaveStatus): void {
  if (ctrl.status === next) return;
  ctrl.status = next;
  for (const l of ctrl.listeners) l(next);
}

export function getSaveStatus(): SaveStatus { return ctrl.status; }
export function getLastSavedAt(): number | null { return ctrl.lastSavedAt; }

export function subscribeSaveStatus(listener: (s: SaveStatus) => void): () => void {
  ctrl.listeners.add(listener);
  return () => { ctrl.listeners.delete(listener); };
}

export type SaveBackend = (doc: ResumeDoc) => Promise<void>;

let _backend: SaveBackend = async () => { /* default no-op for tests */ };

export function setSaveBackend(backend: SaveBackend): void {
  _backend = backend;
}

/** Default backend: PUT to /api/resume/[id] on the FastAPI backend. */
const API_BASE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_BASE) ||
  'http://localhost:8000';

export async function defaultBackendSave(doc: ResumeDoc): Promise<void> {
  const resp = await fetch(`${API_BASE}/api/resume/${encodeURIComponent(doc.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(doc),
  });
  if (!resp.ok) throw new Error(`Save failed: ${resp.status}`);
}

export function startAutoSave(): () => void {
  const unsub = useResumeStore.subscribe(
    s => s.resume,
    (resume) => {
      if (!resume) return;
      ctrl.dirtyDocSnapshot = JSON.stringify(resume);
      if (ctrl.dirtyDocSnapshot === ctrl.lastSavedDocSnapshot) return;
      schedule();
    },
  );
  return unsub;
}

function schedule(): void {
  if (ctrl.pendingTimer) clearTimeout(ctrl.pendingTimer);
  ctrl.pendingTimer = setTimeout(() => {
    ctrl.pendingTimer = null;
    void runSave();
  }, DEBOUNCE_MS);
}

async function runSave(): Promise<void> {
  if (ctrl.inflight) await ctrl.inflight;
  const resume = useResumeStore.getState().resume;
  if (!resume) return;
  const snapshot = JSON.stringify(resume);
  setStatus('saving');
  ctrl.inflight = (async () => {
    try {
      await _backend(resume);
      ctrl.lastSavedDocSnapshot = snapshot;
      ctrl.lastSavedAt = Date.now();
      setStatus('saved');
    } catch (err) {
      setStatus('error');
      throw err;
    }
  })();
  try { await ctrl.inflight; }
  finally { ctrl.inflight = null; }
}

/** Public: ensure backend has the latest resume. Resolves only after ACK. */
export async function flushSave(): Promise<void> {
  // Cancel pending debounce + force save now
  if (ctrl.pendingTimer) {
    clearTimeout(ctrl.pendingTimer);
    ctrl.pendingTimer = null;
  }
  await runSave();
  // If state changed during save, flush again until convergent
  let attempts = 0;
  while (
    JSON.stringify(useResumeStore.getState().resume) !== ctrl.lastSavedDocSnapshot
  ) {
    if (attempts++ > 5) {
      throw new Error('flushSave did not converge after 5 attempts');
    }
    await runSave();
  }
}

/** Test-only: reset internal state. */
export function _resetFlushController(): void {
  if (ctrl.pendingTimer) clearTimeout(ctrl.pendingTimer);
  ctrl.pendingTimer = null;
  ctrl.inflight = null;
  ctrl.lastSavedDocSnapshot = '';
  ctrl.dirtyDocSnapshot = '';
  ctrl.status = 'idle';
  ctrl.lastSavedAt = null;
  ctrl.listeners.clear();
}
