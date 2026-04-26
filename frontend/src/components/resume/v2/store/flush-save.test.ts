// frontend/src/components/resume/v2/store/flush-save.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useResumeStore } from './useResumeStore';
import { setSaveBackend, startAutoSave, flushSave, _resetFlushController } from './flush-save';
import type { ResumeDoc } from '../types';

const RESUME: ResumeDoc = {
  schema_version: 2, id: 'r', title: 't', template_id: 'minimal-single-column',
  header: { id: 'h', name: '', contact_lines: [] },
  sections: [],
  metadata: { created_at: '', updated_at: '', target_company: null, target_role: null, parent_id: null },
};

beforeEach(() => {
  vi.useFakeTimers();
  useResumeStore.setState({ resume: null, bulletMeta: {} });
  _resetFlushController();
});

describe('flushSave', () => {
  it('debounces multiple updates into one save', async () => {
    const backend = vi.fn<(doc: ResumeDoc) => Promise<void>>(async () => {});
    setSaveBackend(backend);
    const unsub = startAutoSave();
    useResumeStore.getState().hydrate(RESUME);
    useResumeStore.setState({ resume: { ...RESUME, title: 'x' } });
    useResumeStore.setState({ resume: { ...RESUME, title: 'xx' } });
    useResumeStore.setState({ resume: { ...RESUME, title: 'xxx' } });
    expect(backend).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1600);
    expect(backend).toHaveBeenCalledTimes(1);
    expect((backend.mock.calls[0][0] as any).title).toBe('xxx');
    unsub();
  });

  it('flushSave forces immediate save and awaits ACK', async () => {
    const backend = vi.fn<(doc: ResumeDoc) => Promise<void>>(async () => {});
    setSaveBackend(backend);
    const unsub = startAutoSave();
    useResumeStore.getState().hydrate(RESUME);
    useResumeStore.setState({ resume: { ...RESUME, title: 'flush-me' } });
    await flushSave();
    expect(backend).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('flushSave converges when state changes mid-save', async () => {
    let saveCount = 0;
    setSaveBackend(async () => {
      if (saveCount === 0) {
        // mutate during first save
        useResumeStore.setState({ resume: { ...RESUME, title: 'mid' } });
      }
      saveCount++;
    });
    const unsub = startAutoSave();
    useResumeStore.getState().hydrate(RESUME);
    useResumeStore.setState({ resume: { ...RESUME, title: 'first' } });
    await flushSave();
    expect(saveCount).toBeGreaterThanOrEqual(2);
    unsub();
  });
});
