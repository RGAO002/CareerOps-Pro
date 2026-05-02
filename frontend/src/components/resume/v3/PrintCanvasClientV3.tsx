'use client';

import * as React from 'react';
import { PrintCanvasV3 } from './PrintCanvasV3';
import { type ResumeFileV3, v3FileToEditorBody } from './schema/v3Envelope';

interface Props {
  resume: ResumeFileV3;
}

export function PrintCanvasClientV3({ resume }: Props) {
  const doc = React.useMemo(() => v3FileToEditorBody(resume), [resume]);
  return <PrintCanvasV3 doc={doc} />;
}
