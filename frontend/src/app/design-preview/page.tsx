'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Design preview — combined COP layout inside the Next.js app.
 * Static, hardcoded data. Not wired to any store / API / TipTap.
 * Route: /design-preview
 *
 * Layout:
 *   [LeftNav 56] [TacticalRail 44|280] [main column] [AI sidebar 340]
 *   main: TopChrome (40) + AppleChrome (50|220 with scout dropdown row) + FormatToolbar (36) + ResumePaper
 */
import { useState, useMemo } from 'react';

/* ──────── tokens ──────── */
const T = {
  bg: 'oklch(0.985 0.004 70)',
  bgWarm: 'oklch(0.975 0.006 65)',
  paper: 'oklch(1 0 0)',
  s1: 'oklch(0.97 0.005 65)',
  s2: 'oklch(0.95 0.008 60)',
  border: 'oklch(0.92 0.006 60)',
  borderS: 'oklch(0.86 0.008 55)',
  fg: 'oklch(0.18 0.02 50)',
  fgM: 'oklch(0.50 0.010 50)',
  fgS: 'oklch(0.65 0.008 55)',
  apple: 'oklch(0.62 0.13 38)',
  good: 'oklch(0.55 0.12 150)',
  warn: 'oklch(0.65 0.13 70)',
  miss: 'oklch(0.60 0.14 28)',
  info: 'oklch(0.58 0.10 240)',
};

/* ──────── data (hardcoded, stripped from COP) ──────── */
const BRAND = {
  name: 'Apple',
  role: 'Product Designer, Human Interface',
  team: 'HI Design · Cupertino',
  location: 'Cupertino, CA · On-site',
  deadline: 'May 9',
  daysLeft: 9,
  salary: '$165–215k + RSUs',
  matchScore: 84,
  motto: 'Designed by Apple in California.',
  posted: 'Apr 22',
  loop: '6 rounds',
  recruiter: 'Sarah K. — replied in 2d',
  industry: 'Consumer Electronics',
  size: '164,000',
  founded: '1976',
  cap: '$3.4T',
  jdExcerpt:
    'You will design experiences that millions interact with daily. We are looking for designers with deep craft in motion, layout, and systems thinking — partnered with engineering and prototyping fluency.',
};

const ATS = [
  { kw: 'Design Systems', hit: true,  v: 92 },
  { kw: 'Motion',         hit: true,  v: 88 },
  { kw: 'iOS',            hit: true,  v: 95 },
  { kw: 'Prototyping',    hit: true,  v: 78 },
  { kw: 'Figma',          hit: true,  v: 86 },
  { kw: 'Visual Design',  hit: true,  v: 74 },
  { kw: 'Interaction',    hit: true,  v: 84 },
  { kw: 'Shipped at scale', hit: true, v: 88 },
  { kw: 'HIG',            hit: false, v: 0 },
  { kw: 'Origami',        hit: false, v: 0 },
  { kw: 'Spatial',        hit: false, v: 0 },
];

const RESUME = {
  name: 'Avery Chen',
  contact: 'avery.chen@gmail.com · sf · averychen.design',
  sections: [
    {
      id: 's-summary',
      title: 'Summary',
      body: 'Product designer with 7 years shipping consumer apps at scale. Strength: motion, system thinking, partnership with engineering on interaction craft.',
    },
    {
      id: 's-exp',
      title: 'Experience',
      entries: [
        {
          title: 'Senior Product Designer',
          company: 'Notion',
          meta: 'Apr 2022 – Present',
          sub: 'Editor & Mobile',
          bullets: [
            { id: 'b1', text: 'Drove migration of editor selection model to a unified ProseMirror schema, lifting first-paint speed 62% on 10k-doc tier.' },
            { id: 'b2', text: 'Owned mobile drag-and-drop interaction across iOS / Android / web; authored shared motion spec adopted by 4 surface teams.' },
            { id: 'b3', text: 'Reduced first-contentful-paint by 62% across iPad through coordinated layout + asset budget rewrite.' },
            { id: 'b4', text: 'Shipped 14 onboarding experiments; hit +18% activation against the H1 target with a single unified pattern.' },
          ],
        },
        {
          title: 'Product Designer',
          company: 'Figma',
          meta: 'Jun 2019 – Mar 2022',
          sub: 'Design Systems',
          bullets: [
            { id: 'b5', text: 'Authored the variables + tokens model that became the foundation of the public Variables API.' },
            { id: 'b6', text: 'Led visual refresh of the right-rail across 8 surfaces; cut WCAG-AA contrast misses to 0.' },
          ],
        },
      ],
    },
    {
      id: 's-edu',
      title: 'Education',
      entries: [
        { title: 'BFA, Interaction Design', company: 'CCA', meta: '2014 – 2018', bullets: [] },
      ],
    },
  ],
};

const AGENTS = [
  { id: 'strategist', name: 'Strategist', glyph: 'S', color: 'oklch(0.55 0.13 250)', role: 'narrative + scope', voice: 'Reads for impact compression and signal density.' },
  { id: 'recruiter',  name: 'Recruiter',  glyph: 'R', color: 'oklch(0.62 0.13 38)',  role: 'screening lens',   voice: 'Reads how a hiring manager skims in 20 seconds.' },
  { id: 'risk',       name: 'Risk',       glyph: '!', color: 'oklch(0.60 0.14 28)',  role: 'fact-check',       voice: 'Flags claims you cannot defend in interview.' },
  { id: 'auditor',    name: 'Auditor',    glyph: 'A', color: 'oklch(0.55 0.12 150)', role: 'craft + tone',     voice: 'Catches passive voice, weak verbs, fluff.' },
];

type Review = {
  id: string; agent: string; targetId?: string; sectionId?: string;
  severity: 'high' | 'medium' | 'low' | 'none';
  title: string; rationale: string;
  diff?: { before: string; after: string };
  impact?: { signal?: number; risk?: number; tone?: number };
};
const REVIEWS: Review[] = [
  {
    id: 'r1', agent: 'risk', targetId: 'b1', severity: 'high',
    title: 'Unverifiable claim — "62%"',
    rationale: 'You stated a specific perf number. Be ready to defend the methodology, or soften to a directional claim.',
    impact: { risk: -2 },
  },
  {
    id: 'r2', agent: 'strategist', targetId: 'b3', severity: 'medium',
    title: 'Compress — same metric appears twice',
    rationale: 'b1 already mentions the 62% paint number. b3 is redundant; collapse into b1 or replace with a different signal.',
    diff: {
      before: 'Reduced first-contentful-paint by 62% across iPad through coordinated layout + asset budget rewrite.',
      after:  'Owned the iPad layout + asset budget rewrite that the FCP gains rolled up into.',
    },
    impact: { signal: +3, risk: +1 },
  },
  {
    id: 'r3', agent: 'auditor', targetId: 'b3', severity: 'low',
    title: 'Verb tightening',
    rationale: '"Reduced X by Y%" reads as boilerplate. Lead with the system change, not the delta.',
    impact: { tone: +1 },
  },
];

const ROUNDTABLES = [
  {
    targetId: 'b4',
    title: 'Cut or compress the experiment line?',
    confidence: 0.72,
    a: { agentId: 'recruiter',  stance: 'Cut',  detail: '14 experiments without methodology reads as activity, not impact. Hiring screen will skim past.' },
    b: { agentId: 'strategist', stance: 'Keep', detail: '+18% activation is the strongest number on the page. Compress, don\'t cut.' },
    recommended: 'compress',
  },
];

/* ──────── primitives ──────── */
function MonoLabel({ children, color, ls = 0.18, mb = 0 }: any) {
  return <div style={{ font: '500 9.5px/1 "JetBrains Mono", monospace', letterSpacing: `${ls}em`, color, textTransform: 'uppercase', marginBottom: mb }}>{children}</div>;
}
function AppleGlyph({ size = 22, color = '#fff' }: any) {
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 384 460" fill={color}>
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7-56.5.9-117 44.7-117 134.6 0 26.5 4.8 53.9 14.5 82.2 12.9 37 59.2 127.7 107.5 126.2 25.3-.6 43.2-18 76.1-18 31.9 0 48.5 18 76.7 18 48.7-.7 90.6-83.2 102.9-120.3-65.5-30.9-61.1-90.6-61.1-94.3zM261.3 100.6c27.7-32.9 25.2-62.8 24.4-73.6-24.5 1.4-52.8 16.7-68.9 35.5-17.7 20.2-28.1 45.2-25.9 73.1 26.5 2 50.8-11.6 70.4-35z"/>
    </svg>
  );
}
function Spark({ size = 12, color = 'currentColor' }: any) {
  return <svg width={size} height={size} viewBox="0 0 24 24"><path d="M12 2 L13.6 9.4 L21 11 L13.6 12.6 L12 20 L10.4 12.6 L3 11 L10.4 9.4 Z" fill={color}/></svg>;
}
function MatchDial({ score, size = 68 }: any) {
  const r = (size - 16) / 2, c = 2 * Math.PI * r;
  const dash = (score / 100) * c;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.15)" strokeWidth="3" fill="none"/>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#fff" strokeWidth="3" fill="none" strokeDasharray={`${dash} ${c}`} strokeLinecap="round"/>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ font: '600 22px/1 "JetBrains Mono", monospace', color: '#fff', letterSpacing: '-0.02em' }}>{score}</span>
        <span style={{ font: '500 8px/1 "JetBrains Mono", monospace', color: '#fff', opacity: 0.55, letterSpacing: '0.16em', marginTop: 3 }}>MATCH</span>
      </div>
    </div>
  );
}
function AgentChip({ agent, size = 18 }: any) {
  return (
    <div style={{ width: size, height: size, borderRadius: 5,
                  background: `oklch(from ${agent.color} l c h / 0.12)`,
                  border: `1px solid oklch(from ${agent.color} l c h / 0.40)`,
                  display: 'grid', placeItems: 'center', flexShrink: 0 }}>
      <span style={{ font: `600 ${Math.round(size * 0.5)}px/1 "JetBrains Mono", monospace`, color: agent.color, letterSpacing: '-0.04em' }}>{agent.glyph}</span>
    </div>
  );
}

/* ──────── LeftNav ──────── */
function LeftNav() {
  const items = [
    { d: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z' },
    { d: 'M4 20V8m6 12V4m6 16v-8m6 8v-6' },
    { d: 'M4 20h4l10-10-4-4L4 16Z', active: true },
    { d: 'M4 6h16v12H4Zm0 0 8 7 8-7' },
    { d: 'M12 14a4 4 0 0 0 4-4V6a4 4 0 1 0-8 0v4a4 4 0 0 0 4 4Zm0 0v4m-4 0h8' },
    { d: 'M4 5h6v14H4Zm10 0h6v9h-6Z' },
  ];
  return (
    <aside style={{ width: 56, borderRight: `1px solid ${T.border}`, background: 'oklch(0.98 0.003 60)',
                    display: 'flex', flexDirection: 'column', flexShrink: 0, alignItems: 'center', padding: '14px 0' }}>
      <div style={{ width: 32, height: 32, borderRadius: 9,
                    background: `linear-gradient(135deg, ${T.apple}, oklch(0.50 0.14 35))`,
                    display: 'grid', placeItems: 'center', marginBottom: 18 }}>
        <span style={{ font: '700 14px/1 Inter', color: '#fff' }}>C</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((i, idx) => (
          <button key={idx} style={{ width: 36, height: 36, borderRadius: 8, border: 0,
            background: i.active ? 'oklch(.94 .02 45)' : 'transparent',
            color: i.active ? T.fg : T.fgM, display: 'grid', placeItems: 'center', position: 'relative' }}>
            {i.active && <span style={{ position: 'absolute', left: -10, top: 6, bottom: 6, width: 3, borderRadius: '0 3px 3px 0', background: T.apple }}/>}
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={i.d}/></svg>
          </button>
        ))}
      </div>
    </aside>
  );
}

/* ──────── TacticalRail (collapsible) ──────── */
function TacticalRail({ collapsed, onToggle }: any) {
  if (collapsed) {
    return (
      <aside style={{ width: 44, flexShrink: 0, borderRight: `1px solid ${T.border}`, background: 'oklch(0.985 0.004 70)',
                       display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 0', gap: 4 }}>
        <button onClick={onToggle} title="Expand" style={iconBtn}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M9 6l6 6-6 6"/></svg>
        </button>
        <div style={{ width: 24, height: 1, background: T.border, margin: '8px 0' }}/>
        {[
          'M4 21V8l8-5 8 5v13H4Zm6-6h4',
          'M4 20V8m6 12V4m6 16v-8m6 8v-6',
          'M5 4h14v16H5Zm3 4h8M8 12h8M8 16h5',
        ].map((d, i) => (
          <button key={i} style={iconBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>
          </button>
        ))}
        <div style={{ flex: 1 }}/>
        <div style={{ font: '500 13px/1 "JetBrains Mono", monospace', color: T.fg, letterSpacing: '-0.02em', marginBottom: 4 }}>84</div>
        <div style={{ font: '500 8px/1 "JetBrains Mono", monospace', color: T.fgS, letterSpacing: '0.18em' }}>FIT</div>
      </aside>
    );
  }
  const overall = 84;
  return (
    <aside style={{ width: 280, flexShrink: 0, overflow: 'hidden', position: 'relative',
                     borderRight: `1px solid ${T.border}`, background: 'oklch(0.985 0.004 70)' }}>
      <button onClick={onToggle} title="Collapse" style={{ position: 'absolute', top: 12, right: 8, ...iconBtn, zIndex: 2 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <div style={{ height: '100%', overflowY: 'auto' }}>
        {/* Company card */}
        <div style={{ padding: '20px 18px 18px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ width: 38, height: 38, borderRadius: 9, background: T.fg, display: 'grid', placeItems: 'center' }}>
              <AppleGlyph size={18} color="#fff"/>
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ font: '500 16px/1.15 Inter', color: T.fg, letterSpacing: '-0.02em' }}>{BRAND.name}</div>
              <span style={{ font: '400 11.5px/1.3 Inter', color: T.fgM }}>apple.com/careers</span>
            </div>
          </div>
          {[['Industry', BRAND.industry], ['Size', `${BRAND.size} employees`], ['Founded', `${BRAND.founded} · ${BRAND.cap}`]].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '3px 0' }}>
              <span style={{ font: '500 9.5px/1.4 Inter', color: T.fgS, letterSpacing: '0.10em', textTransform: 'uppercase', width: 60, flexShrink: 0 }}>{k}</span>
              <span style={{ font: '400 12px/1.4 Inter', color: T.fg }}>{v}</span>
            </div>
          ))}
        </div>
        {/* Scout report */}
        <div style={{ padding: '18px 18px 16px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
            <MonoLabel color={T.fgS}>Scout Report</MonoLabel>
            <span style={{ font: '400 10.5px/1 "JetBrains Mono", monospace', color: T.fgM }}>{ATS.filter(k => k.hit).length}/{ATS.length} matched</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${T.border}` }}>
            <span style={{ font: '300 44px/0.9 "JetBrains Mono", monospace', color: T.fg, letterSpacing: '-0.04em' }}>{overall}</span>
            <div style={{ flex: 1, paddingBottom: 4 }}>
              <div style={{ font: 'italic 400 13px/1.2 "Instrument Serif", Georgia, serif', color: T.fg, marginBottom: 2 }}>Promising.</div>
              <div style={{ font: '400 11px/1.3 Inter', color: T.fgM }}>Composite of {ATS.length} signals, weighted by JD emphasis.</div>
            </div>
          </div>
          <MonoLabel color={T.fgS} mb={8}>Top attributes</MonoLabel>
          {ATS.filter(k => k.hit).slice(0, 6).map(k => (
            <div key={k.kw} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
              <span style={{ font: '400 12.5px/1.3 Inter', color: T.fg, flex: 1 }}>{k.kw}</span>
              <div style={{ width: 84, height: 4, background: T.s2, borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${k.v}%`, background: T.fg, borderRadius: 2 }}/>
              </div>
              <span style={{ font: '400 12px/1 "JetBrains Mono", monospace', color: T.fg, width: 26, textAlign: 'right' }}>{k.v}</span>
            </div>
          ))}
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
              <MonoLabel color={T.fgS}>Gaps</MonoLabel>
              <span style={{ font: '400 10.5px/1 "JetBrains Mono", monospace', color: T.miss }}>3 below threshold</span>
            </div>
            {ATS.filter(k => !k.hit).map(k => (
              <div key={k.kw} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
                <span style={{ font: '400 12.5px/1.3 Inter', color: T.fg, flex: 1, opacity: 0.55 }}>{k.kw}</span>
                <div style={{ width: 84, height: 4, background: T.s2, borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, backgroundImage: `repeating-linear-gradient(90deg, ${T.borderS} 0, ${T.borderS} 3px, transparent 3px, transparent 6px)` }}/>
                </div>
                <span style={{ font: '400 12px/1 "JetBrains Mono", monospace', color: T.fgS, width: 26, textAlign: 'right' }}>—</span>
              </div>
            ))}
          </div>
        </div>
        {/* JD excerpt */}
        <div style={{ padding: '18px 18px 28px' }}>
          <MonoLabel color={T.fgS} mb={12}>From the brief</MonoLabel>
          <p style={{ font: '400 italic 14px/1.55 "Instrument Serif", Georgia, serif', color: T.fg, margin: 0, paddingLeft: 14, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0, top: 0, bottom: 4, width: 2, background: T.borderS }}/>
            {BRAND.jdExcerpt}
          </p>
        </div>
      </div>
    </aside>
  );
}
const iconBtn: any = { width: 30, height: 30, borderRadius: 6, border: 0, background: 'transparent', color: T.fgM, display: 'grid', placeItems: 'center', cursor: 'pointer' };

/* ──────── TopChrome (slim) ──────── */
function TopChrome() {
  return (
    <div style={{ height: 40, borderBottom: `1px solid ${T.border}`, background: 'rgba(255,255,255,0.86)',
                   display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px', flexShrink: 0 }}>
      <span style={{ font: '500 11.5px/1 Inter', color: T.fgM }}>
        Resume <span style={{ color: T.fgS }}>·</span>
        <span style={{ color: T.fg, marginLeft: 5 }}>Apple Product Designer</span>
        <span style={{ color: T.fgS, marginLeft: 5 }}>· v3</span>
      </span>
      <div style={{ flex: 1 }}/>
      <span style={{ font: '500 10px/1 Inter', color: T.good, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <i style={{ width: 5, height: 5, borderRadius: 999, background: 'currentColor' }}/>Saved
      </span>
      <span style={{ font: '500 10.5px/1 "JetBrains Mono", monospace', color: T.fgM, letterSpacing: '0.04em' }}>2 PAGES</span>
      <button style={{ height: 26, padding: '0 11px', borderRadius: 6, background: 'rgb(20,20,20)', font: '500 11.5px/1 Inter', color: '#fff', border: 0 }}>Export PDF</button>
    </div>
  );
}

/* ──────── Brand chrome with scout dropdown row ──────── */
function AppleChrome({ collapsed, onToggle }: any) {
  const scoutPills = ATS.slice(0, 6);
  return (
    <div style={{ position: 'relative', background: '#000', color: '#fff', overflow: 'hidden', flexShrink: 0,
                  fontFamily: '"SF Pro Display", -apple-system, Inter, sans-serif', borderBottom: '1px solid #1a1a1a',
                  height: collapsed ? 50 : 220, transition: 'height .35s cubic-bezier(.2,.7,.3,1)' }}>
      <div style={{ position: 'absolute', right: -30, top: -40, opacity: 0.07, pointerEvents: 'none' }}>
        <AppleGlyph size={collapsed ? 120 : 250} color="#fff"/>
      </div>
      {collapsed ? (
        <div style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center', gap: 16, padding: '0 28px' }}>
          <AppleGlyph size={18}/>
          <span style={{ font: '400 14px/1 inherit' }}>{BRAND.role}</span>
          <span style={{ font: '400 12px/1 inherit', color: 'rgba(255,255,255,0.45)' }}>{BRAND.team}</span>
          <div style={{ flex: 1 }}/>
          <span style={{ font: '500 10px/1 "JetBrains Mono", monospace', color: 'rgba(255,255,255,0.55)', letterSpacing: '0.16em' }}>T-{BRAND.daysLeft}D</span>
          <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.18)' }}/>
          <span style={{ font: '500 13px/1 "JetBrains Mono", monospace' }}>{BRAND.matchScore}</span>
          <span style={{ font: '500 9px/1 "JetBrains Mono", monospace', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.18em' }}>MATCH</span>
          <button onClick={onToggle} style={chromeBtn}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4l4 4 4-4"/></svg>
          </button>
        </div>
      ) : (
        <>
          <div style={{ position: 'relative', padding: '20px 28px 12px', display: 'flex', alignItems: 'center', gap: 22 }}>
            <AppleGlyph size={32}/>
            <div>
              <MonoLabel color="rgba(255,255,255,0.45)" mb={8}>Now Applying</MonoLabel>
              <div style={{ font: '300 26px/1.05 inherit', letterSpacing: '-0.025em', marginBottom: 4 }}>{BRAND.role}</div>
              <div style={{ font: '400 12.5px/1 inherit', color: 'rgba(255,255,255,0.55)' }}>{BRAND.team} · {BRAND.location}</div>
            </div>
            <div style={{ flex: 1 }}/>
            <ChromeStat label="Deadline" v={BRAND.deadline} sub={`${BRAND.daysLeft}d left`} accent={BRAND.daysLeft <= 7 ? '#ff8c5a' : null}/>
            <ChromeStat label="Comp" v={BRAND.salary.split(' + ')[0]} sub={`+ ${BRAND.salary.split(' + ')[1] || ''}`}/>
            <ChromeStat label="Loop" v={BRAND.loop} sub={BRAND.recruiter}/>
            <MatchDial score={BRAND.matchScore}/>
            <button onClick={onToggle} style={chromeBtn}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 8l4-4 4 4"/></svg>
            </button>
          </div>
          <div style={{ position: 'relative', padding: '0 28px 12px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{ font: '300 italic 13px/1 "Times New Roman", serif', color: 'rgba(255,255,255,0.42)' }}>{BRAND.motto}</span>
            <span style={{ font: '500 10px/1 "JetBrains Mono", monospace', letterSpacing: '0.16em', color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase' }}>Posted {BRAND.posted}</span>
          </div>
          {/* Scout dropdown strip */}
          <div style={{ position: 'relative', padding: '12px 28px 14px', borderTop: '1px solid rgba(255,255,255,0.08)',
                         display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ font: '500 9.5px/1 "JetBrains Mono", monospace', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.18em', textTransform: 'uppercase', flexShrink: 0 }}>Scout</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
              {scoutPills.map(p => (
                <span key={p.kw} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 9px', borderRadius: 999,
                  font: '500 11px/1 Inter', color: p.hit ? '#fff' : 'rgba(255,255,255,0.42)',
                  background: p.hit ? 'rgba(255,255,255,0.07)' : 'transparent',
                  border: p.hit ? '1px solid rgba(255,255,255,0.14)' : '1px dashed rgba(255,255,255,0.18)',
                }}>
                  {p.kw}
                  {p.hit ? (
                    <span style={{ font: '500 10px/1 "JetBrains Mono", monospace', color: 'rgba(255,255,255,0.55)' }}>{p.v}</span>
                  ) : (
                    <span style={{ font: '500 9px/1 "JetBrains Mono", monospace', color: 'rgba(255,255,255,0.40)', letterSpacing: '0.10em' }}>MISS</span>
                  )}
                </span>
              ))}
            </div>
            <span style={{ font: '500 10.5px/1 "JetBrains Mono", monospace', color: 'rgba(255,255,255,0.55)', flexShrink: 0 }}>
              {ATS.filter(k => k.hit).length}/{ATS.length} matched
            </span>
            <button style={{ padding: '5px 10px', borderRadius: 5, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff', font: '500 10.5px/1 Inter', cursor: 'pointer', flexShrink: 0 }}>
              Train gaps →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
const chromeBtn: any = { width: 26, height: 26, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' };
function ChromeStat({ label, v, sub, accent }: any) {
  return (
    <div style={{ minWidth: 0 }}>
      <MonoLabel color="rgba(255,255,255,0.50)" ls={0.20} mb={8}>{label}</MonoLabel>
      <div style={{ font: '500 15px/1 Inter', color: accent || '#fff', letterSpacing: '-0.01em', marginBottom: 4 }}>{v}</div>
      {sub && <div style={{ font: '400 11px/1.2 Inter', color: 'rgba(255,255,255,0.50)' }}>{sub}</div>}
    </div>
  );
}

/* ──────── Format toolbar ──────── */
function FormatToolbar() {
  const btn: any = { height: 24, padding: '0 8px', borderRadius: 5, color: T.fgM, font: '500 11px/1 Inter', border: `1px solid ${T.border}`, background: T.paper };
  return (
    <div style={{ height: 36, borderBottom: `1px solid ${T.border}`, background: T.paper, display: 'flex', alignItems: 'center', gap: 6, padding: '0 18px', flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: 1, border: `1px solid ${T.border}`, borderRadius: 6, padding: 1 }}>
        {['B', 'I', 'U'].map((t, i) => (
          <button key={i} style={{ width: 24, height: 24, borderRadius: 4, color: T.fgM,
            font: `${i === 0 ? 700 : 500} 11px/1 Inter`,
            fontStyle: i === 1 ? 'italic' : 'normal',
            textDecoration: i === 2 ? 'underline' : 'none',
            background: 'transparent', border: 0 }}>{t}</button>
        ))}
      </div>
      <button style={btn}>14px ▾</button>
      <button style={btn}>Inter ▾</button>
      <div style={{ width: 1, height: 18, background: T.border, margin: '0 6px' }}/>
      <button style={btn}>Bullet</button>
      <button style={btn}>Heading</button>
      <div style={{ flex: 1 }}/>
      <span style={{ font: '500 9.5px/1 "JetBrains Mono", monospace', color: T.fgM, letterSpacing: '0.10em' }}>TAILORED FOR APPLE</span>
    </div>
  );
}

/* ──────── Resume paper ──────── */
function ResumePaper({ activeRowId, onSelect }: any) {
  return (
    <main style={{ flex: 1, overflowY: 'auto', background: `linear-gradient(180deg, ${T.bg} 0, oklch(.96 .005 60) 100%)` }}>
      <div style={{ maxWidth: 820, margin: '28px auto 120px', background: T.paper, borderRadius: 6,
                    padding: '52px 64px', boxShadow: '0 1px 3px oklch(.15 .02 50 / .04), 0 16px 50px oklch(.40 .04 42 / .08)',
                    fontFamily: '"Source Serif Pro", Georgia, serif', color: T.fg }}>
        <div style={{ textAlign: 'center', borderBottom: `1px solid ${T.border}`, paddingBottom: 14, marginBottom: 18 }}>
          <div style={{ font: '600 28px/1.1 Inter', letterSpacing: '-0.02em', marginBottom: 5 }}>{RESUME.name}</div>
          <div style={{ font: '400 12.5px/1.5 Inter', color: T.fgM }}>{RESUME.contact}</div>
        </div>
        {RESUME.sections.map(s => (
          <Row key={s.id} id={s.id} active={activeRowId === s.id} onSelect={onSelect}>
            <div style={{ font: '600 11px/1 Inter', letterSpacing: '.18em', textTransform: 'uppercase',
                            color: T.fg, margin: '10px 0 8px', borderBottom: `1px solid ${T.border}`, paddingBottom: 5 }}>
              {s.title}
            </div>
            {s.body && <p style={{ font: '400 13px/1.6 "Source Serif Pro", Georgia, serif', color: T.fg, margin: '8px 0' }}>{s.body}</p>}
            {s.entries?.map((e: any, i: number) => (
              <div key={i} style={{ margin: '8px 0 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                  <span style={{ font: '600 13.5px/1.4 Inter' }}>{e.title}<span style={{ color: T.fgM, fontWeight: 500 }}> · {e.company}</span></span>
                  <span style={{ font: 'italic 400 12px/1.4 Inter', color: T.fgM }}>{e.meta}</span>
                </div>
                {e.sub && <div style={{ font: '500 12.5px/1.4 Inter', color: T.fgM, marginTop: 2 }}>{e.sub}</div>}
                {e.bullets?.length > 0 && (
                  <ul style={{ margin: '6px 0 0', padding: '0 0 0 16px', listStyle: 'none' }}>
                    {e.bullets.map((b: any) => (
                      <Row key={b.id} id={b.id} active={activeRowId === b.id} onSelect={onSelect}>
                        <li style={{ font: '400 13px/1.6 "Source Serif Pro", Georgia, serif', color: T.fg, margin: '3px 0', position: 'relative' }}>
                          <span style={{ position: 'absolute', left: -12, color: T.fgS }}>•</span>
                          {b.text}
                        </li>
                      </Row>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </Row>
        ))}
      </div>
    </main>
  );
}
function Row({ id, active, onSelect, children }: any) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => { e.stopPropagation(); onSelect(id); }}
      style={{
        position: 'relative', padding: '0 8px', margin: '0 -8px', borderRadius: 4,
        background: active ? 'oklch(0.94 0.025 38)' : hover ? 'oklch(0.97 0.01 60)' : 'transparent',
        boxShadow: active ? `inset 2px 0 0 ${T.apple}` : 'none',
        transition: 'background 0.15s', cursor: 'pointer',
      }}
    >
      {children}
    </div>
  );
}

/* ──────── AI sidebar (= COP contextual review panel) ──────── */
function AISidebar({ activeRowId, onClear, dismissed, onDismiss, onApply }: any) {
  const reviews = useMemo(
    () => REVIEWS.filter(r => !dismissed.includes(r.id) && r.targetId === activeRowId),
    [activeRowId, dismissed]
  );
  const roundtable = useMemo(
    () => activeRowId ? ROUNDTABLES.find(rt => rt.targetId === activeRowId) : null,
    [activeRowId]
  );
  const targetText = useMemo(() => {
    if (!activeRowId) return null;
    for (const s of RESUME.sections) {
      if (s.id === activeRowId) return { kind: 'section', text: s.title };
      if (s.entries) for (const e of s.entries) {
        if (e.bullets) for (const b of e.bullets) if (b.id === activeRowId) return { kind: 'bullet', text: b.text };
      }
    }
    return null;
  }, [activeRowId]);

  return (
    <aside style={{ width: 340, flexShrink: 0, background: T.bgWarm, borderLeft: `1px solid ${T.border}`,
                     display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Spark size={11} color={T.apple}/>
        <MonoLabel color={T.fgM}>Review</MonoLabel>
        <div style={{ flex: 1 }}/>
        {activeRowId && (
          <button onClick={onClear} style={{ font: '500 10.5px/1 Inter', color: T.fgM, background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 5, padding: '4px 8px' }}>
            Clear selection
          </button>
        )}
      </div>

      {!activeRowId && (
        <div style={{ flex: 1, padding: '22px 18px', overflowY: 'auto' }}>
          <div style={{ font: 'italic 14px/1.5 "Instrument Serif", Georgia, serif', color: T.fg, marginBottom: 6 }}>
            Select a section or bullet to see what the agents think.
          </div>
          <div style={{ font: '400 11.5px/1.5 Inter', color: T.fgM, marginBottom: 22 }}>
            Four reviewers are on standby. They only speak when you point at something.
          </div>
          <MonoLabel color={T.fgS} mb={10}>Standing by</MonoLabel>
          {AGENTS.map(a => {
            const open = REVIEWS.filter(r => r.agent === a.id).length;
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderTop: `1px solid ${T.border}` }}>
                <AgentChip agent={a} size={20}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ font: '500 12px/1 Inter', color: T.fg }}>{a.name}</span>
                    <span style={{ font: '400 11px/1 Inter', color: T.fgM, fontStyle: 'italic' }}>· {a.role}</span>
                  </div>
                  <div style={{ font: '400 11px/1.4 Inter', color: T.fgM, marginTop: 3 }}>{a.voice}</div>
                </div>
                <span style={{ font: '500 10.5px/1 "JetBrains Mono", monospace', color: open > 0 ? a.color : T.fgS, paddingTop: 3 }}>{open}</span>
              </div>
            );
          })}
        </div>
      )}

      {activeRowId && targetText && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 60px' }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ font: '500 9.5px/1 "JetBrains Mono", monospace', color: T.fgS, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 6 }}>
              Selected · {targetText.kind}
            </div>
            <div style={{ font: '400 italic 13px/1.4 "Instrument Serif", Georgia, serif', color: T.fg, paddingLeft: 10, borderLeft: `2px solid ${T.borderS}` }}>
              &ldquo;{targetText.text.length > 110 ? targetText.text.slice(0, 110) + '…' : targetText.text}&rdquo;
            </div>
          </div>

          {roundtable && <Roundtable rt={roundtable}/>}

          {reviews.length === 0 && !roundtable && (
            <div style={{ padding: '22px 14px', textAlign: 'center', color: T.fgM,
                           font: 'italic 13px/1.5 "Instrument Serif", serif',
                           background: T.paper, border: `1px solid ${T.border}`, borderRadius: 7 }}>
              No agent has flagged this row.
              <div style={{ marginTop: 6, font: '400 11.5px/1.4 Inter', color: T.fgS, fontStyle: 'normal' }}>Looks clean.</div>
            </div>
          )}

          {reviews.map(r => <ReviewCard key={r.id} r={r} onApply={() => onApply(r)} onDismiss={() => onDismiss(r.id)}/>)}
        </div>
      )}

      <div style={{ borderTop: `1px solid ${T.border}`, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8, background: T.paper }}>
        <button style={invokeBtn}><Spark size={10} color={T.apple}/> Run review</button>
        <button style={invokeBtn}>Defend</button>
        <button style={invokeBtn}>Rewrite</button>
        <div style={{ flex: 1 }}/>
        <span style={{ font: '500 10px/1 "JetBrains Mono", monospace', color: T.fgS, padding: '3px 5px', background: T.s2, borderRadius: 4, letterSpacing: '0.04em' }}>⌘R</span>
      </div>
    </aside>
  );
}
const invokeBtn: any = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 5, font: '500 11.5px/1 Inter', color: T.fg, background: T.paper, border: `1px solid ${T.border}`, cursor: 'pointer' };

function ReviewCard({ r, onApply, onDismiss }: any) {
  const agent = AGENTS.find(a => a.id === r.agent)!;
  const sevColor = r.severity === 'high' ? T.miss : r.severity === 'medium' ? T.warn : r.severity === 'low' ? T.info : T.good;
  return (
    <div style={{ background: T.paper, border: `1px solid ${T.border}`, borderLeft: `2px solid ${sevColor}`, borderRadius: 7, padding: '12px 14px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <AgentChip agent={agent} size={16}/>
        <span style={{ font: '500 11.5px/1 Inter', color: T.fg }}>{agent.name}</span>
        <span style={{ font: '500 9px/1 "JetBrains Mono", monospace', color: sevColor, letterSpacing: '0.14em', padding: '2px 5px', borderRadius: 3, background: `oklch(from ${sevColor} l c h / 0.10)`, border: `1px solid oklch(from ${sevColor} l c h / 0.28)` }}>
          {r.severity.toUpperCase()}
        </span>
      </div>
      <div style={{ font: '500 13px/1.4 Inter', color: T.fg, marginBottom: 6 }}>{r.title}</div>
      <div style={{ font: '400 12px/1.55 Inter', color: T.fgM, marginBottom: r.diff ? 10 : 8 }}>{r.rationale}</div>
      {r.diff && (
        <div style={{ background: T.s1, border: `1px solid ${T.border}`, borderRadius: 5, padding: '9px 11px',
                       font: '400 11.5px/1.5 "Source Serif Pro", Georgia, serif', marginBottom: 10 }}>
          <div style={{ color: T.miss, opacity: 0.75, textDecoration: 'line-through' }}>{r.diff.before}</div>
          <div style={{ color: T.fg, marginTop: 5 }}><span style={{ color: T.good, marginRight: 4 }}>↳</span>{r.diff.after}</div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        {r.diff ? (
          <button onClick={onApply} style={{ flex: 1, padding: '6px 10px', borderRadius: 5, background: T.fg, border: 0, color: '#fff', font: '500 11.5px/1 Inter', cursor: 'pointer' }}>Apply diff</button>
        ) : (
          <button style={{ flex: 1, padding: '6px 10px', borderRadius: 5, background: T.paper, border: `1px solid ${T.borderS}`, color: T.fg, font: '500 11.5px/1 Inter', cursor: 'pointer' }}>Discuss</button>
        )}
        <button onClick={onDismiss} style={{ padding: '6px 10px', borderRadius: 5, background: T.paper, border: `1px solid ${T.border}`, color: T.fgM, font: '500 11.5px/1 Inter', cursor: 'pointer' }}>Dismiss</button>
      </div>
    </div>
  );
}

function Roundtable({ rt }: any) {
  const aA = AGENTS.find(x => x.id === rt.a.agentId)!;
  const aB = AGENTS.find(x => x.id === rt.b.agentId)!;
  return (
    <div style={{ background: T.paper, border: `1px solid ${T.borderS}`, borderTop: `2px solid ${T.apple}`, borderRadius: 7, padding: '12px 14px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
        <MonoLabel color={T.apple} ls={0.16}>Disagreement</MonoLabel>
        <div style={{ flex: 1 }}/>
        <span style={{ font: '500 10px/1 "JetBrains Mono", monospace', color: T.fgM }}>{Math.round(rt.confidence * 100)}% confident</span>
      </div>
      <div style={{ font: '500 13px/1.35 Inter', color: T.fg, marginBottom: 11 }}>{rt.title}</div>
      {[{ a: aA, s: rt.a }, { a: aB, s: rt.b }].map(({ a, s }, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: i > 0 ? `1px solid ${T.border}` : 0 }}>
          <AgentChip agent={a} size={18}/>
          <div style={{ flex: 1 }}>
            <div style={{ font: '500 12px/1 Inter', color: T.fg, marginBottom: 3 }}>{a.name} · <span style={{ fontWeight: 500 }}>{s.stance}</span></div>
            <div style={{ font: '400 11.5px/1.45 Inter', color: T.fgM }}>{s.detail}</div>
          </div>
        </div>
      ))}
      <div style={{ paddingTop: 10, marginTop: 4, borderTop: `1px dashed ${T.border}`, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ font: '500 10.5px/1 Inter', color: T.fgM }}>Recommended ·</span>
        <span style={{ font: '500 11.5px/1.4 Inter', color: T.fg, flex: 1 }}>Compress, do not cut</span>
        <button style={{ padding: '5px 10px', font: '500 11px/1 Inter', color: '#fff', background: T.fg, border: 0, borderRadius: 5, cursor: 'pointer' }}>Apply recommended</button>
      </div>
    </div>
  );
}

/* ──────── Page ──────── */
export default function DesignPreviewPage() {
  const [chromeCollapsed, setChromeCollapsed] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [activeRowId, setActiveRowId] = useState<string | null>('b3');
  const [dismissed, setDismissed] = useState<string[]>([]);

  return (
    <>
      {/* Force fonts even if app's globals don't load them */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Source+Serif+Pro:ital,wght@0,400;0,600;1,400&display=swap"/>
      <div style={{ display: 'flex', height: '100vh', background: T.bg, color: T.fg, fontFamily: 'Inter, system-ui, sans-serif', overflow: 'hidden' }}>
        <LeftNav/>
        <TacticalRail collapsed={railCollapsed} onToggle={() => setRailCollapsed(!railCollapsed)}/>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <TopChrome/>
          <AppleChrome collapsed={chromeCollapsed} onToggle={() => setChromeCollapsed(!chromeCollapsed)}/>
          <FormatToolbar/>
          <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
            <ResumePaper activeRowId={activeRowId} onSelect={setActiveRowId}/>
            <AISidebar
              activeRowId={activeRowId}
              onClear={() => setActiveRowId(null)}
              dismissed={dismissed}
              onApply={(r: any) => setDismissed([...dismissed, r.id])}
              onDismiss={(id: string) => setDismissed([...dismissed, id])}
            />
          </div>
        </div>
      </div>
    </>
  );
}
