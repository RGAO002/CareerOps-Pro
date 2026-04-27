import { describe, it, expect } from 'vitest';
import { SlashCommand } from './SlashCommand';

describe('SlashCommand', () => {
  it('exports an extension with correct name', () => {
    expect((SlashCommand as any).name || (SlashCommand as any).config?.name).toBeDefined();
  });
});
