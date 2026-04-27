// frontend/src/components/resume/v2/atoms/HeaderAtomRenderer.tsx
'use client';
import { PlainTextField } from '../fields/PlainTextField';
import { ContactLinesField } from '../fields/ContactLinesField';
import { useResumeStore } from '../store/useResumeStore';
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

  // Unified row model (mirrors EntryAtomRenderer):
  //  - EDIT: always render every row (name, contact line). Empty rows show
  //    placeholders as template guidance.
  //  - EXPORT: skip rendering empty rows so the PDF doesn't carry blank
  //    padding lines.
  const nameEmpty = (header.name?.trim().length ?? 0) === 0;
  const contactEmpty = isContactLineEmpty(header.contact_lines);
  const renderName = mode === 'edit' || !nameEmpty;
  const renderContact = mode === 'edit' || !contactEmpty;

  return (
    <div className="resume-header" data-block-id={header.id} data-atom-content>
      {renderName && (
        <PlainTextField
          fieldKey={{ kind: 'header.name' }}
          value={header.name}
          align={nameAlign}
          mode={mode}
          className="resume-name"
          placeholder="Your name"
        />
      )}
      {renderContact && (
        <ContactLinesField index={0} items={header.contact_lines} align={contactAlign} mode={mode} />
      )}
    </div>
  );
}
