'use client';

import * as React from 'react';
import type { ResumeDoc as ResumeDocV2 } from '../v2/types';
import { PrintCanvasV3 } from './PrintCanvasV3';
import { v2ToV3 } from './schema/v2Adapter';

interface Props {
  resume: ResumeDocV2;
}

export function PrintCanvasClientV3({ resume }: Props) {
  const doc = React.useMemo(() => v2ToV3(resume), [resume]);
  return <PrintCanvasV3 doc={doc} />;
}
