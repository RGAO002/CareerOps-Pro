// frontend/src/components/resume/v2/atoms/HeaderAtomRenderer.tsx
'use client';
import { useEffect, useState } from 'react';
import { PlainTextField } from '../fields/PlainTextField';
import { ContactLinesField } from '../fields/ContactLinesField';
import { HeaderRowInteractionOverlay } from './HeaderRowInteractionOverlay';
import { getHoverState, subscribeHover } from '../interaction/hover-state';
import { useResumeStore } from '../store/useResumeStore';
import { effectiveHeaderRowOrder } from '../store/header-order';
import type { Align } from '../fields/single-line-adapter';
import type { CanvasMode, ContactItem, HeaderBlock } from '../types';

interface Props {
  header: HeaderBlock;
  mode: CanvasMode;
}

/** A contact line is "empty" when it has no items, or every item is a text
 *  item with an empty value. Link items always count as non-empty (the user
 *  put work into the URL/label). */
function isContactLineEmpty(items: ContactItem[]): boolean {
  if (items.length === 0) return true;
  return items.every(i => i.type === 'text' && i.value.trim() === '');
}

export function HeaderAtomRenderer({ header, mode }: Props) {
  const nameAlign = useResumeStore(s => s.resume?.alignments?.['header.name']) as Align | undefined;
  const contactAlign = useResumeStore(s => s.resume?.alignments?.['header.contact:0']) as Align | undefined;

  // Same Y-band hover publisher used by entry rows + bullets — InteractionLayer
  // scans `[data-row-field-key]` so we get hover detection for free as long as
  // each row wrapper carries that attribute.
  const initial = getHoverState();
  const [hoveredFieldKey, setHoveredFieldKey] = useState<string | null>(initial.atomFieldKey);
  useEffect(() => subscribeHover((s) => setHoveredFieldKey(s.atomFieldKey)), []);

  const nameEmpty = (header.name?.trim().length ?? 0) === 0;
  const contactEmpty = isContactLineEmpty(header.contact_lines);

  // Resolve render order — defaults to ['name', 'contact:0', ...] for back-compat.
  let order = effectiveHeaderRowOrder(header);
  // Edit-mode affordance: if there are no contact lines yet, still render one
  // empty contact row so the user has a placeholder + ⋮⋮ to interact with.
  // (Mirrors the pre-row_order behavior where contact:0 was always rendered.)
  if (mode === 'edit' && header.contact_lines.length === 0 && !order.includes('contact:0')) {
    order = [...order, 'contact:0'];
  }

  return (
    <div className="resume-header" data-block-id={header.id} data-atom-content>
      {order.map((rowKey) => {
        if (rowKey === 'name') {
          // EDIT: always render so the placeholder + drag handle are visible.
          // EXPORT: skip empty name to avoid blank padding lines in PDF.
          if (mode !== 'edit' && nameEmpty) return null;
          const fullKey = 'header.name';
          return (
            <div
              key="name"
              style={{ position: 'relative' }}
              data-row-field-key={mode === 'edit' ? fullKey : undefined}
            >
              {mode === 'edit' && (
                <HeaderRowInteractionOverlay
                  headerId={header.id}
                  rowKey="name"
                  hovered={hoveredFieldKey === fullKey}
                />
              )}
              <PlainTextField
                fieldKey={{ kind: 'header.name' }}
                value={header.name}
                align={nameAlign}
                mode={mode}
                className="resume-name"
                placeholder="Your name"
              />
            </div>
          );
        }
        const m = /^contact:(\d+)$/.exec(rowKey);
        if (!m) return null;
        const idx = parseInt(m[1], 10);
        // Today there's only ever contact_lines[0] in the schema, but keep
        // the loop generic so future multi-line headers Just Work.
        if (mode !== 'edit' && contactEmpty) return null;
        const fullKey = `header.contact:${idx}`;
        return (
          <div
            key={`contact:${idx}`}
            style={{ position: 'relative' }}
            data-row-field-key={mode === 'edit' ? fullKey : undefined}
          >
            {mode === 'edit' && (
              <HeaderRowInteractionOverlay
                headerId={header.id}
                rowKey={`contact:${idx}`}
                hovered={hoveredFieldKey === fullKey}
              />
            )}
            <ContactLinesField
              index={idx}
              items={header.contact_lines}
              align={contactAlign}
              mode={mode}
            />
          </div>
        );
      })}
    </div>
  );
}
