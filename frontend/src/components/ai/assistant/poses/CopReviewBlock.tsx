'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * CopReviewBlock — review-style cards rendered inside the existing Assistant
 * SidebarPose body, using the SAME design system as the existing DiffCard /
 * SuggestionsTab (`--p-surface` semi-transparent dark, `--p-accent` warm
 * terracotta, `var(--ai-font)` Plus Jakarta family). Sits naturally on the
 * sidebar's FluidCanvas bg — no cream override.
 *
 * Hardcoded data; uses the v0 plan's 3-agent roster: Coordinator + Polish + Experience.
 */
import * as React from 'react';

const AGENTS = [
  { id: 'coordinator', name: 'Coordinator', glyph: 'C' },
  { id: 'polish',      name: 'Polish',      glyph: 'P' },
  { id: 'experience',  name: 'Experience',  glyph: 'X' },
];

const REVIEWS = [
  { id: 'r1', agent: 'experience', severity: 'medium' as const,
    title: 'Compress — metric appears twice',
    rationale: 'The 62% paint number shows up in two bullets. Collapse to one or replace one with a different signal.',
    diff: { before: 'Reduced first-contentful-paint by 62% across iPad through coordinated layout + asset budget rewrite.',
             after:  'Owned the iPad layout + asset budget rewrite that the FCP gains rolled up into.' } },
  { id: 'r2', agent: 'polish', severity: 'low' as const,
    title: 'Verb tightening',
    rationale: '"Reduced X by Y%" reads as boilerplate. Lead with the system change, not the delta.' },
];

const ROUNDTABLE = {
  title: 'Cut or compress the experiment line?',
  confidence: 0.72,
  a: { agentId: 'experience',  stance: 'Cut',  detail: '14 experiments without methodology reads as activity, not impact.' },
  b: { agentId: 'coordinator', stance: 'Keep', detail: '+18% activation is the strongest number on the page. Compress, don\'t cut.' },
};

/* Severity → label only (no colored stripe); the existing AI sidebar
 * vocabulary uses op-tag chips, so we follow that. */
const SEV_LABEL: Record<string, string> = { high: 'HIGH', medium: 'MEDIUM', low: 'LOW' };

/* ─────── Agent chip — small mono badge using --p-accent for fill ─────── */
function AgentChip({ glyph, size = 18 }: { glyph: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 5,
      background: 'var(--p-accent-muted)',
      border: '1px solid oklch(from var(--p-accent) l c h / 0.40)',
      display: 'grid', placeItems: 'center', flexShrink: 0,
    }}>
      <span style={{
        font: `var(--ai-w-strong) ${Math.round(size * 0.5)}px/1 var(--ai-font-mono)`,
        color: 'var(--p-accent-warm)', letterSpacing: '-0.04em',
      }}>{glyph}</span>
    </div>
  );
}

/* ─────── Review card — DiffCard-compatible visual language ─────── */
function ReviewCard({ r }: any) {
  const agent = AGENTS.find(a => a.id === r.agent)!;
  return (
    <div style={{
      background: 'var(--p-surface)', border: '1px solid var(--p-border)',
      borderRadius: 10, overflow: 'hidden', marginBottom: 10,
    }}>
      {/* Header — agent + severity chip (DiffCard-style) */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderBottom: '1px solid var(--p-border)',
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center',
                       font: 'var(--ai-w-ui) 11px/1 var(--ai-font)', color: 'var(--p-text-body)' }}>
          <AgentChip glyph={agent.glyph} size={16}/>
          <span>{agent.name}</span>
        </div>
        <span style={{
          font: 'var(--ai-w-strong) 9.5px/1 var(--ai-font)',
          padding: '3px 7px', borderRadius: 999,
          letterSpacing: '0.04em', textTransform: 'uppercase',
          background: 'var(--p-accent-muted)', color: 'var(--p-accent-warm)',
        }}>
          {SEV_LABEL[r.severity]}
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: '11px 12px',
                     font: 'var(--ai-w-body) 12.5px/1.55 var(--ai-font)',
                     color: 'var(--p-text-body)' }}>
        <div style={{ font: 'var(--ai-w-ui) 13px/1.4 var(--ai-font)', color: 'var(--p-text)', marginBottom: 6 }}>
          {r.title}
        </div>
        <div style={{ color: 'var(--p-text-mute)', marginBottom: r.diff ? 9 : 0 }}>
          {r.rationale}
        </div>
        {r.diff && (
          <div style={{ marginTop: 4 }}>
            <span style={{
              display: 'block', color: 'var(--p-text-dim)',
              textDecorationLine: 'line-through',
              textDecorationColor: 'var(--p-text-dim)',
              textDecorationThickness: 1, marginBottom: 6,
            }}>{r.diff.before}</span>
            <span style={{ display: 'block', color: 'var(--p-text)' }}>{r.diff.after}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6,
        padding: '8px 12px', borderTop: '1px solid var(--p-border)',
      }}>
        {r.diff ? (
          <button type="button" style={{
            background: 'var(--p-accent)', color: 'oklch(0.99 0.003 70)', border: 0,
            padding: '5px 12px', borderRadius: 6,
            font: 'var(--ai-w-ui) 11.5px/1 var(--ai-font)', cursor: 'pointer',
          }}>Accept</button>
        ) : (
          <button type="button" style={{
            background: 'transparent', color: 'var(--p-text-body)',
            border: '1px solid var(--p-border)',
            padding: '5px 12px', borderRadius: 6,
            font: 'var(--ai-w-ui) 11.5px/1 var(--ai-font)', cursor: 'pointer',
          }}>Discuss</button>
        )}
        <button type="button" style={{
          background: 'transparent', color: 'var(--p-text-mute)',
          border: '1px solid var(--p-border)',
          padding: '5px 12px', borderRadius: 6,
          font: 'var(--ai-w-ui) 11.5px/1 var(--ai-font)', cursor: 'pointer',
        }}>Dismiss</button>
      </div>
    </div>
  );
}

/* ─────── Roundtable — same visual language, with --p-accent top border ─────── */
function Roundtable() {
  const aA = AGENTS.find(x => x.id === ROUNDTABLE.a.agentId)!;
  const aB = AGENTS.find(x => x.id === ROUNDTABLE.b.agentId)!;
  return (
    <div style={{
      background: 'var(--p-surface-hi)', border: '1px solid var(--p-border2)',
      borderTop: '2px solid var(--p-accent)',
      borderRadius: 10, overflow: 'hidden', marginBottom: 12,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px', borderBottom: '1px solid var(--p-border)',
      }}>
        <span style={{
          font: 'var(--ai-w-strong) 9.5px/1 var(--ai-font)',
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--p-accent-warm)',
        }}>Disagreement</span>
        <div style={{ flex: 1 }}/>
        <span style={{
          font: 'var(--ai-w-ui) 10px/1 var(--ai-font-mono)',
          color: 'var(--p-text-mute)',
        }}>{Math.round(ROUNDTABLE.confidence * 100)}% confident</span>
      </div>

      <div style={{ padding: '10px 12px' }}>
        <div style={{
          font: 'var(--ai-w-ui) 13px/1.35 var(--ai-font)',
          color: 'var(--p-text)', marginBottom: 11,
        }}>{ROUNDTABLE.title}</div>

        {[{ a: aA, s: ROUNDTABLE.a }, { a: aB, s: ROUNDTABLE.b }].map(({ a, s }, i) => (
          <div key={i} style={{
            display: 'flex', gap: 10, padding: '8px 0',
            borderTop: i > 0 ? '1px solid var(--p-border)' : 0,
          }}>
            <AgentChip glyph={a.glyph} size={18}/>
            <div style={{ flex: 1 }}>
              <div style={{
                font: 'var(--ai-w-ui) 12px/1 var(--ai-font)',
                color: 'var(--p-text-body)', marginBottom: 3,
              }}>
                {a.name} · <span style={{ color: 'var(--p-text)' }}>{s.stance}</span>
              </div>
              <div style={{
                font: 'var(--ai-w-body) 11.5px/1.45 var(--ai-font)',
                color: 'var(--p-text-mute)',
              }}>{s.detail}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        padding: '9px 12px', borderTop: '1px dashed var(--p-border)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ font: 'var(--ai-w-ui) 10.5px/1 var(--ai-font)', color: 'var(--p-text-mute)' }}>
          Recommended ·
        </span>
        <span style={{ font: 'var(--ai-w-ui) 11.5px/1.4 var(--ai-font)', color: 'var(--p-text)', flex: 1 }}>
          Compress, do not cut
        </span>
        <button type="button" style={{
          background: 'var(--p-accent)', color: 'oklch(0.99 0.003 70)', border: 0,
          padding: '5px 11px', borderRadius: 6,
          font: 'var(--ai-w-ui) 11px/1 var(--ai-font)', cursor: 'pointer',
        }}>Apply</button>
      </div>
    </div>
  );
}

export function CopReviewBlock() {
  const targetText = 'Reduced first-contentful-paint by 62% across iPad through coordinated layout + asset budget rewrite.';
  return (
    <div style={{ marginBottom: 16 }}>
      {/* Selection breadcrumb — uses sidebar mute colors, not COP serif italic */}
      <div style={{ marginBottom: 12 }}>
        <div style={{
          font: 'var(--ai-w-strong) 9.5px/1 var(--ai-font)',
          color: 'var(--p-text-mute)',
          letterSpacing: '0.16em', textTransform: 'uppercase',
          marginBottom: 6,
        }}>
          Selected · bullet
        </div>
        <div style={{
          font: 'var(--ai-w-body) 12.5px/1.45 var(--ai-font)',
          color: 'var(--p-text-body)',
          paddingLeft: 10, borderLeft: '2px solid var(--p-border2)',
          fontStyle: 'italic',
        }}>
          &ldquo;{targetText}&rdquo;
        </div>
      </div>

      <Roundtable/>
      {REVIEWS.map(r => <ReviewCard key={r.id} r={r}/>)}
    </div>
  );
}
