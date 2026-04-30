import * as React from 'react';
import type { EditorView } from '@tiptap/pm/view';
import { isCommandEnabled, runSlashCommand, slashMenuPluginKey, SLASH_COMMANDS, type SlashCommand } from './SlashMenuPlugin';

// TODO(v3.1): style/color switches — scoped per § 3.7 to the 6 commands only.

const COMMAND_LABELS: Record<SlashCommand, string> = {
  heading: 'Section heading',
  entry:   'Entry',
  meta:    'Entry meta',
  bullet:  'Bullet',
  text:    'Plain text',
  link:    'Link',
};

interface Props {
  view: EditorView;
}

export function SlashMenuOverlay({ view }: Props): React.ReactElement | null {
  const [, force] = React.useReducer((n: number) => n + 1, 0);

  React.useEffect(() => {
    let last = slashMenuPluginKey.getState(view.state);
    const handler = () => {
      const cur = slashMenuPluginKey.getState(view.state);
      if (cur !== last) {
        last = cur;
        force();
      }
    };
    // Subscribe via a plugin view? For simplicity, listen on dom mutations / use a microtask.
    const id = window.setInterval(handler, 50);
    return () => window.clearInterval(id);
  }, [view]);

  const state = slashMenuPluginKey.getState(view.state);
  if (!state || !state.open) return null;

  return (
    <div className="slash-menu-overlay" role="menu" data-testid="slash-menu-overlay">
      {SLASH_COMMANDS.map((cmd) => {
        const enabled = isCommandEnabled(view, cmd);
        return (
          <button
            key={cmd}
            type="button"
            role="menuitem"
            data-cmd={cmd}
            aria-disabled={enabled ? 'false' : 'true'}
            disabled={!enabled}
            onClick={() => runSlashCommand(view, cmd)}
          >
            /{cmd} — {COMMAND_LABELS[cmd]}
          </button>
        );
      })}
    </div>
  );
}
