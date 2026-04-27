// frontend/src/components/resume/v2/store/flush-save.ts
import { useResumeStore } from './useResumeStore';
import type { ResumeDoc } from '../types';

const DEBOUNCE_MS = 1500;

type FlushController = {
  pendingTimer: ReturnType<typeof setTimeout> | null;
  inflight: Promise<void> | null;
  // version of resume that backend last ACK'd
  lastSavedDocSnapshot: string;     // JSON string for cheap equality
  // version of resume currently dirty (changed since last ACK)
  dirtyDocSnapshot: string;
};

const ctrl: FlushController = {
  pendingTimer: null,
  inflight: null,
  lastSavedDocSnapshot: '',
  dirtyDocSnapshot: '',
};

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
  ctrl.inflight = (async () => {
    await _backend(resume);
    ctrl.lastSavedDocSnapshot = snapshot;
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
}
