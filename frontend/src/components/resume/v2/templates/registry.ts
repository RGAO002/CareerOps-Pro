// frontend/src/components/resume/v2/templates/registry.ts
import type { TemplateConfig } from '../layout/normalize-template';
import { MINIMAL_SINGLE_COLUMN } from './minimal-single-column';

export const TEMPLATES: Record<string, TemplateConfig> = {
  'minimal-single-column': MINIMAL_SINGLE_COLUMN,
};

export function getTemplate(id: string): TemplateConfig {
  return TEMPLATES[id] ?? MINIMAL_SINGLE_COLUMN;
}
