// frontend/src/components/resume/v2/ResumeDocumentCanvas.tsx
'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { projectAtoms } from './layout/atoms-projection';
import { normalizeTemplate } from './layout/normalize-template';
import { LayoutEngine, type LayoutResult } from './layout/LayoutEngine';
import { AtomElementRegistry } from './layout/AtomElementRegistry';
import { totalCanvasHeight } from './layout/coords';
import { PageBackgroundLayer } from './layers/PageBackgroundLayer';
import { AtomContentLayer } from './layers/AtomContentLayer';
import { PrintFlowPlaceholders } from './layers/PrintFlowPlaceholders';
import { InteractionLayer } from './layers/InteractionLayer';
import { atomFocusManager } from './interaction/AtomFocusManager';
import type { ResumeDoc, CanvasMode, LayoutAtom, AtomId, EditableField } from './types';
import type { TemplateConfig } from './layout/normalize-template';

import './tokens/canvas.css';
import './canvas-print.css';

interface Props {
  resume: ResumeDoc;
  template: TemplateConfig;
  mode: CanvasMode;
  hideInteractionLayer?: boolean;
}

export function ResumeDocumentCanvas({ resume, template, mode, hideInteractionLayer = false }: Props) {
  const norm = useMemo(() => normalizeTemplate(template), [template]);
  const atoms = useMemo<LayoutAtom[]>(() => projectAtoms(resume), [resume]);

  const [layout, setLayout] = useState<LayoutResult>({ atomLayouts: new Map(), pageCount: 1 });
  const heightsRef = useRef(new Map<AtomId, number>());
  const engineRef = useRef<LayoutEngine | null>(null);
  const registryRef = useRef<AtomElementRegistry | null>(null);

  // Build engine once
  useEffect(() => {
    const engine = new LayoutEngine({ onLayout: setLayout });
    engineRef.current = engine;
    if (mode === 'edit') (window as any).__layoutEngine = engine;
    return () => {
      engine.setInputs([], new Map(), norm);
      engineRef.current = null;
      if (mode === 'edit') (window as any).__layoutEngine = undefined;
    };
  }, [norm, mode]);

  // Build registry once
  useEffect(() => {
    const reg = new AtomElementRegistry((atomId, height) => {
      heightsRef.current.set(atomId, height);
      const engine = engineRef.current;
      if (!engine) return;
      engine.setInputs(atoms, heightsRef.current, norm);
      engine.requestRepaginate();
    });
    registryRef.current = reg;
    return () => { reg.destroy(); registryRef.current = null; };
  }, [atoms, norm]);

  // Update focus order whenever atoms change
  useEffect(() => {
    if (mode !== 'edit') return;
    const fields: EditableField[] = [];
    fields.push({ kind: 'header.name' });
    resume.header.contact_lines.forEach((_, i) => fields.push({ kind: 'header.contact', index: i }));
    for (const s of resume.sections) {
      fields.push({ kind: 'section.heading', id: s.id });
      for (const e of s.entries) {
        fields.push({ kind: 'entry.title', id: e.id });
        fields.push({ kind: 'entry.meta', id: e.id });
        for (const b of e.bullets) {
          fields.push({ kind: 'bullet.content', id: b.id });
        }
      }
    }
    atomFocusManager.setOrder(fields);
  }, [resume, mode]);

  // Trigger layout pass when atoms/template change
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setInputs(atoms, heightsRef.current, norm);
    engine.requestRepaginate();
  }, [atoms, norm]);

  // data-paginated lifecycle (§ 6.8 — ALWAYS reset to false at effect start)
  const ready = layout.atomLayouts.size > 0 || atoms.length === 0;
  useEffect(() => {
    document.body.dataset.paginated = 'false';   // unconditional first
    if (!ready) return;
    let cancelled = false;
    (async () => {
      if ('fonts' in document) await (document as any).fonts.ready;
      await new Promise(r => requestAnimationFrame(r));
      await new Promise(r => requestAnimationFrame(r));
      if (cancelled) return;
      document.body.dataset.paginated = 'true';
    })();
    return () => { cancelled = true; };
  }, [ready, layout]);

  const totalHeight = totalCanvasHeight(layout.pageCount, mode, norm);

  return (
    <div
      data-canvas-root
      data-mode={mode}
      style={{ position: 'relative', width: norm.page.widthPx, height: totalHeight, margin: '0 auto' }}
    >
      <PrintFlowPlaceholders pageCount={layout.pageCount} mode={mode} template={norm} />
      <PageBackgroundLayer pageCount={layout.pageCount} mode={mode} template={norm} />
      <AtomContentLayer
        atoms={atoms}
        layouts={layout.atomLayouts}
        resume={resume}
        mode={mode}
        template={norm}
        registry={registryRef.current}
      />
      {mode === 'edit' && !hideInteractionLayer && (
        <InteractionLayer atoms={atoms} layouts={layout.atomLayouts} template={norm} />
      )}
    </div>
  );
}
