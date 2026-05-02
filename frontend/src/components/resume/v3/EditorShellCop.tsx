'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * EditorShellCop — IN-PAGE chrome wrapping the v3 editor canvas. Lives
 * INSIDE AppShell (so the global menu sidebar + TopBar + Assistant all stay
 * intact). Layout:
 *
 *   ┌─ AppleChrome (full width of editor area, with Scout dropdown row) ─┐
 *   ├─ FormatToolbar slot ──────────────────────────────────────────────┤
 *   ├─ TacticalRail │ paper                                              │
 *   └─────────────────────────────────────────────────────────────────────┘
 *
 * The right AI sidebar is the existing Assistant `SidebarPose` — review
 * content is injected there separately, not by this shell.
 */
import * as React from 'react';
import { getBrandTier, isHighMatch } from '@/lib/brands/marquee';
import { useAssistantStore } from '@/stores/assistant';

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

/* ──────── hardcoded data (Apple persona from COP) ──────── */
const BRAND = {
  name: 'Apple',
  role: 'Product Designer, Human Interface',
  team: 'HI Design',
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
// Agents / reviews / roundtable now live in SidebarPose injection — moved out

/* ──────── primitives ──────── */
function MonoLabel({ children, color, ls = 0.18, mb = 0 }: any) {
  return <div style={{ font: '500 9.5px/1 "JetBrains Mono", monospace', letterSpacing: `${ls}em`, color, textTransform: 'uppercase', marginBottom: mb }}>{children}</div>;
}
function AppleGlyph({ size = 22, color = '#fff' }: any) {
  return (
    <svg
      width={size}
      // Apple path actually extends slightly below the original 460 viewBox
      // bottom — bumping height ratio to 1.25 + viewBox to 480 + explicit
      // overflow:visible so the bottom curl of the body never gets clipped,
      // even at very small sizes where 1px of clip is visually obvious.
      height={size * 1.25}
      viewBox="0 0 384 480"
      fill={color}
      style={{ overflow: 'visible', display: 'block', flexShrink: 0 }}
    >
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7-56.5.9-117 44.7-117 134.6 0 26.5 4.8 53.9 14.5 82.2 12.9 37 59.2 127.7 107.5 126.2 25.3-.6 43.2-18 76.1-18 31.9 0 48.5 18 76.7 18 48.7-.7 90.6-83.2 102.9-120.3-65.5-30.9-61.1-90.6-61.1-94.3zM261.3 100.6c27.7-32.9 25.2-62.8 24.4-73.6-24.5 1.4-52.8 16.7-68.9 35.5-17.7 20.2-28.1 45.2-25.9 73.1 26.5 2 50.8-11.6 70.4-35z"/>
    </svg>
  );
}
function MatchDial({ score, size = 68, startDelay = 0, animate = true }: { score: number; size?: number; startDelay?: number; animate?: boolean }) {
  // Animate from 0 → score with the SVG ring filling proportionally.
  // Triggered after `startDelay` ms so it lines up with banner-drop-1
  // appearing on screen.
  //
  // `animate=false` (low-match path): render the final score statically.
  // Per spec — generic <80 stays fully static; marquee <80 also skips
  // dial animation (the celebration is reserved for ≥80).
  const [shown, setShown] = React.useState(animate ? 0 : score);
  React.useEffect(() => {
    if (!animate) {
      setShown(score);
      return;
    }
    let raf = 0;
    const startAt = performance.now() + startDelay;
    const duration = 1100;
    const tick = (now: number) => {
      if (now < startAt) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, (now - startAt) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setShown(Math.round(score * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score, startDelay, animate]);

  const r = (size - 16) / 2, c = 2 * Math.PI * r;
  const dash = (shown / 100) * c;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.15)" strokeWidth="3" fill="none"/>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#fff" strokeWidth="3" fill="none" strokeDasharray={`${dash} ${c}`} strokeLinecap="round"/>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ font: '600 22px/1 "JetBrains Mono", monospace', color: '#fff', letterSpacing: '-0.02em' }}>{shown}</span>
        <span style={{ font: '500 8px/1 "JetBrains Mono", monospace', color: '#fff', opacity: 0.55, letterSpacing: '0.16em', marginTop: 3 }}>MATCH</span>
      </div>
    </div>
  );
}
/* ──────── TacticalRail (collapsible, embedded inside editor area) ──────── */
const iconBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 6, border: 0, background: 'transparent', color: T.fgM, display: 'grid', placeItems: 'center', cursor: 'pointer' };
const RAIL_MAX = 280;
// Material standard easing — gentle S-curve, no abrupt start or end.
const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
const DUR = '560ms';

function TacticalRail({ width, animate }: { width: number; animate: boolean }) {
  // Width comes from parent — either snapped to 0/RAIL_MAX (state) or
  // tracking cursor position during drag. `animate` is false while
  // dragging so the rail follows the finger 1:1 with no easing lag.
  const overall = BRAND.matchScore;
  return (
    <aside style={{
      width,
      flexShrink: 0,
      overflow: 'hidden',
      position: 'relative',
      borderRight: width > 0 ? `1px solid ${T.border}` : 'none',
      // Slightly darker than editor bg + multi-layer inset shadows so the
      // rail reads as a recessed channel sunken into the page surface.
      // Top + left edges have stronger inner shadow (light is overhead),
      // right + bottom have softer rim — gives the "well/groove" feel.
      background: 'oklch(0.962 0.004 70)',
      boxShadow: `
        inset 6px 0 14px -6px oklch(0.18 0.01 50 / 0.18),
        inset 0 6px 12px -6px oklch(0.18 0.01 50 / 0.16),
        inset -3px 0 10px -4px oklch(0.18 0.01 50 / 0.08),
        inset 0 -4px 10px -4px oklch(0.18 0.01 50 / 0.06)
      `,
      transition: animate ? `width ${DUR} ${EASE}` : 'none',
    }}>
      {/* Collapse handle was here. Now unified into a single sliding pill
          rendered by the parent Shell so the same component represents
          both the open and close trigger — only the arrow direction
          changes. */}
      <div style={{ height: '100%', overflowY: 'auto', width: 280 }}>
        <div className="cop-rail-drop cop-rail-drop-1" style={{ padding: '20px 18px 18px', borderBottom: `1px solid ${T.border}` }}>
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
        <div className="cop-rail-drop cop-rail-drop-2" style={{ padding: '18px 18px 16px', borderBottom: `1px solid ${T.border}` }}>
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
        <div className="cop-rail-drop cop-rail-drop-3" style={{ padding: '18px 18px 28px' }}>
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

/* ──────── Brand chrome with scout dropdown row ──────── */
const chromeBtn: React.CSSProperties = { width: 26, height: 26, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' };
function ChromeStat({ label, v, sub, accent }: any) {
  return (
    <div style={{ minWidth: 0 }}>
      <MonoLabel color="rgba(255,255,255,0.50)" ls={0.20} mb={8}>{label}</MonoLabel>
      <div style={{ font: '500 15px/1 Inter', color: accent || '#fff', letterSpacing: '-0.01em', marginBottom: 4 }}>{v}</div>
      {sub && <div style={{ font: '400 11px/1.2 Inter', color: 'rgba(255,255,255,0.50)' }}>{sub}</div>}
    </div>
  );
}
/**
 * AppleChrome — scroll-driven shrinkable banner.
 *
 *   progress: 0 = fully expanded (220px), 1 = fully collapsed (50px)
 *   stretch:  extra px added on top (used for over-scroll-up bounce). When
 *             user wheels up at scrollTop=0, stretch jumps positive then
 *             springs back to 0.
 *
 * Both expanded and collapsed layouts are rendered, stacked absolutely.
 * Opacity crossfades on `progress`. No CSS height transition — height is
 * driven directly by scroll position so the shrink tracks the wheel
 * sub-frame.
 */
function AppleChrome() {
  const scoutPills = ATS.slice(0, 6);
  return (
    <div style={{
      position: 'relative', color: '#fff', overflow: 'hidden', flexShrink: 0,
      fontFamily: '"SF Pro Display", -apple-system, Inter, sans-serif',
      // Geometry driven by CSS vars written from useShrinkScroll's RAF —
      // bypasses React reconciliation for buttery 60fps.
      height: 'var(--banner-h, 220px)',
      // Layered background: deep base + very subtle top→bottom gradient.
      // Top is slightly cooler (#0c0c0e), bottom slightly warmer (#040404)
      // so the banner reads as having depth, not a flat black slab.
      background: `
        linear-gradient(180deg,
          oklch(0.16 0.008 270) 0%,
          oklch(0.10 0.005 260) 45%,
          oklch(0.06 0.003 250) 100%
        )
      `,
      // Inset rim light on top + soft inset bottom shadow for depth, no
      // visible 1px line.
      boxShadow: `
        inset 0 1px 0 rgba(255, 255, 255, 0.045),
        inset 0 -1px 24px rgba(0, 0, 0, 0.55)
      `,
    }}>
      {/* Reveal cover — sits on top of the banner content; animates
          off to the right when [data-cop-ready] is set on the host. */}
      <div className="cop-banner-cover" aria-hidden="true"/>
      {/* Two static ambient color washes — cool blue from upper-left,
          warm peach from upper-right. Establishes baseline glow. */}
      <div style={{ position: 'absolute', left: '4%', top: '-60%', width: 620, height: 620, pointerEvents: 'none',
                    filter: 'blur(2px)',
                    background: 'radial-gradient(circle, rgba(110,170,255,0.07), transparent 60%)' }}/>
      <div style={{ position: 'absolute', right: '6%', top: '-50%', width: 540, height: 540, pointerEvents: 'none',
                    filter: 'blur(3px)',
                    background: 'radial-gradient(circle, rgba(255,160,130,0.045), transparent 60%)' }}/>

      {/* Slow drifting cinematic spotlight — one oversized warm light that
          gently arcs across the banner over ~24s. Not orbs, not fluid —
          reads as late-afternoon sunlight through a window. */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden',
        mixBlendMode: 'screen',
      }}>
        <div className="cop-banner-drift" style={{
          position: 'absolute', top: '-40%', left: '20%', width: 760, height: 380,
          background: 'radial-gradient(ellipse at center, rgba(255,210,170,0.085) 0%, rgba(255,180,140,0.04) 35%, transparent 70%)',
          filter: 'blur(6px)',
          willChange: 'transform',
        }}/>
      </div>

      {/* Ultra-slow specular sheen — a single soft diagonal highlight that
          travels across once every ~22s. Reads as the kind of subtle
          reflection on a polished surface in a product render. */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden',
      }}>
        <div className="cop-banner-sheen" style={{
          position: 'absolute', top: 0, bottom: 0, width: 320,
          background: 'linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.05) 45%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.05) 55%, transparent 100%)',
          filter: 'blur(2px)',
          willChange: 'transform',
        }}/>
      </div>

      {/* Keyframes for the drift + sheen — scoped via a single <style> tag
          so we don't have to touch global CSS. */}
      <style>{`
        @keyframes copBannerDrift {
          0%, 100% { transform: translate(-12%, 0) scale(1.0); }
          50%      { transform: translate(14%, -4%) scale(1.08); }
        }
        @keyframes copBannerSheen {
          0%   { transform: translateX(-340px) skewX(-12deg); opacity: 0; }
          15%  { opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translateX(120vw) skewX(-12deg); opacity: 0; }
        }
        /* Glyph breath — slow size pulse with subtle opacity tied in.
           transform-origin (set inline) is at 0% 50% so the visible icon
           portion expands radially from its own left edge, no sideways drift. */
        @keyframes copGlyphBreath {
          0%, 100% { opacity: 0.045; transform: scale(1.000); }
          50%      { opacity: 0.075; transform: scale(1.06); }
        }
        .cop-banner-drift { animation: copBannerDrift 24s ease-in-out infinite; }
        .cop-banner-sheen { animation: copBannerSheen 22s ease-in-out infinite; animation-delay: 4s; }
        /* Logo breath: marquee only — generic companies stay static. */
        .cop-glyph-breath { will-change: opacity, transform; }
        [data-banner-tier="marquee"] .cop-glyph-breath { animation: copGlyphBreath 9s ease-in-out infinite; }

        /* ─── Choreographed entrance ─────────────────────────────
           Phase A (0 → 900ms):   Hero Apple glyph at viewport center,
                                    scaling + irregular wobble rotation.
           Phase B (900 → 1500ms): Hero flies to banner's top-left logo
                                    slot, scales down to final size.
                                    Banner cover finishes sliding right
                                    EXACTLY at 1500ms — banner unfurled.
           Phase C (1500 → 2200ms): Hero fades out as banner-drop-1
                                    brings in the real logo + identity
                                    text. Then drop-2, drop-3 stagger.
        */

        /* Banner unfurl — cover slides off right via pure GPU transform. */
        @keyframes copBannerCoverSlide {
          from { transform: translateX(0); }
          to   { transform: translateX(100%); }
        }
        .cop-banner-cover {
          position: absolute; inset: 0;
          background: oklch(0.962 0.004 70);
          z-index: 20;
          pointer-events: none;
          transform: translateX(0);
          will-change: transform;
        }
        /* Scroll unfurl ("画卷展开") — gated by tier:
             marquee:           always plays
             generic + high-match: plays (still feels earned)
             generic + <80:        skipped (cover never animates → stays
                                    in place blocking; we suppress the
                                    cover element entirely below). */
        [data-cop-ready][data-banner-tier="marquee"] .cop-banner-cover,
        [data-cop-ready][data-banner-tier="generic"][data-high-match] .cop-banner-cover {
          /* Cover starts moving once hero is mid-flight, finishes when
             hero lands at logo position. */
          animation: copBannerCoverSlide 900ms cubic-bezier(0.32, 0.72, 0, 1) 600ms both;
        }
        /* Generic + low-match: hide the cover entirely so the banner is
           visible from frame 0 (only text drops animate). */
        [data-banner-tier="generic"]:not([data-high-match]) .cop-banner-cover {
          display: none;
        }

        /* Hero glyph — anchored inside host (position:absolute, host is
           position:relative). Center coords use banner geometry:
             top: 110px = banner half-height (220 / 2)
             left: 50%  = banner center horizontally (banner spans host)
           Final coords match where banner-drop-1's logo lands:
             top: 36px = banner padding-top + flex centering offset
             left: 28px = banner padding-left  */
        @keyframes copHeroFlight {
          0% {
            top: 110px; left: 50%;
            transform: translate(-50%, -50%) scale(7) rotate(-12deg);
            opacity: 0;
          }
          8% { opacity: 1; }
          22% {
            top: 110px; left: 50%;
            transform: translate(-50%, -50%) scale(8) rotate(9deg);
          }
          40% {
            top: 110px; left: 50%;
            transform: translate(-50%, -50%) scale(7.4) rotate(-5deg);
          }
          58% {
            top: 110px; left: 50%;
            transform: translate(-50%, -50%) scale(7.8) rotate(14deg);
          }
          /* Phase B: travel to logo slot. */
          75% {
            top: 110px; left: 50%;
            transform: translate(-50%, -50%) scale(5.5) rotate(8deg);
            opacity: 1;
          }
          93% {
            top: 36px; left: 28px;
            transform: translate(0, 0) scale(1.15) rotate(-3deg);
            opacity: 1;
          }
          100% {
            top: 36px; left: 28px;
            transform: translate(0, 0) scale(1) rotate(0deg);
            opacity: 0;
          }
        }
        .cop-hero-glyph {
          position: absolute;
          top: 110px; left: 50%;
          transform: translate(-50%, -50%) scale(7);
          z-index: 50;
          pointer-events: none;
          opacity: 0;
          filter: drop-shadow(0 12px 32px rgba(0,0,0,0.45));
          will-change: transform, top, left, opacity;
        }
        /* Hero glyph flight — only the marquee + high-match quadrant.
           Everyone else: hero element stays opacity 0 (its initial value)
           and never animates; the real banner logo fades in normally. */
        [data-cop-ready][data-banner-tier="marquee"][data-high-match] .cop-hero-glyph {
          animation: copHeroFlight 1500ms cubic-bezier(0.65, 0, 0.25, 1) both;
        }
        /* Suppress hero entirely when not animating (no orphan element
           lingering above the banner). */
        [data-banner-tier="generic"] .cop-hero-glyph,
        [data-banner-tier="marquee"]:not([data-high-match]) .cop-hero-glyph {
          display: none;
        }

        /* Banner logo (real one in drop-1's row) — only fades in,
           NEVER translates. Times the fade-in to the hero's fade-out so
           the handoff is invisible: at the moment hero hits 0 opacity,
           this one is already at 1. The sibling text in the same row
           still translates (cop-banner-drop-1) — only the logo stays
           still. */
        @keyframes copBannerLogoFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .cop-banner-logo-fade {
          opacity: 0;
        }
        [data-cop-ready] .cop-banner-logo-fade {
          animation: copBannerLogoFade 200ms ease 1380ms forwards;
        }

        /* Rail sections drop in top-down after the banner text settles —
           same drop keyframe, staggered delays. */
        .cop-rail-drop {
          opacity: 1;
          will-change: transform, opacity;
        }
        [data-cop-ready] .cop-rail-drop {
          animation: copBannerDrop 720ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        [data-cop-ready] .cop-rail-drop-1 { animation-delay: 1980ms; }
        [data-cop-ready] .cop-rail-drop-2 { animation-delay: 2160ms; }
        [data-cop-ready] .cop-rail-drop-3 { animation-delay: 2340ms; }

        /* Content rows drop down onto the unfurled banner, staggered.
           Dropped the filter:blur — blur during translation forced a
           per-frame compositing pass that visibly stuttered on slower
           machines. Pure transform + opacity stays on the GPU layer. */
        @keyframes copBannerDrop {
          from { transform: translateY(-20px); opacity: 0; }
          to   { transform: translateY(0);     opacity: 1; }
        }
        /* Default: rows already at final state (no animation). Animation
           runs only after [data-cop-ready] flips true so we don't compete
           with first-paint for compositing budget. */
        .cop-banner-drop {
          opacity: 1;
          will-change: transform, opacity;
        }
        [data-cop-ready] .cop-banner-drop {
          animation: copBannerDrop 780ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        /* Drops start when the hero lands (1500ms) — drop-1 brings in
           the real logo + identity, masking hero's fade-out. */
        [data-cop-ready] .cop-banner-drop-1 { animation-delay: 1480ms; }
        [data-cop-ready] .cop-banner-drop-2 { animation-delay: 1640ms; }
        [data-cop-ready] .cop-banner-drop-3 { animation-delay: 1800ms; }

        /* Generic + low-match: no cover, no hero, no breath, no dial —
           text drops kick off almost immediately so the screen isn't
           sitting on an empty banner for 1.5s. Rail also pulls in. */
        [data-cop-ready][data-banner-tier="generic"]:not([data-high-match]) .cop-banner-drop-1 { animation-delay: 200ms; }
        [data-cop-ready][data-banner-tier="generic"]:not([data-high-match]) .cop-banner-drop-2 { animation-delay: 360ms; }
        [data-cop-ready][data-banner-tier="generic"]:not([data-high-match]) .cop-banner-drop-3 { animation-delay: 520ms; }
        [data-cop-ready][data-banner-tier="generic"]:not([data-high-match]) .cop-rail-drop-1 { animation-delay: 700ms; }
        [data-cop-ready][data-banner-tier="generic"]:not([data-high-match]) .cop-rail-drop-2 { animation-delay: 880ms; }
        [data-cop-ready][data-banner-tier="generic"]:not([data-high-match]) .cop-rail-drop-3 { animation-delay: 1060ms; }
        /* Logo-fade for generic+low: piggyback on drop-1 timing. */
        [data-cop-ready][data-banner-tier="generic"]:not([data-high-match]) .cop-banner-logo-fade {
          animation: copBannerLogoFade 200ms ease 100ms forwards;
        }

        @media (prefers-reduced-motion: reduce) {
          .cop-banner-drift, .cop-banner-sheen, .cop-glyph-breath,
          .cop-banner-reveal, .cop-banner-drop { animation: none; }
        }
      `}</style>

      {/* Ghosted glyph — outer wrapper does scroll-driven scale (origin
          top-right so the icon shrinks INTO its anchored right edge as the
          banner collapses). Inner wrapper does the slow breath with origin
          on the LEFT-CENTER of the icon: since most of the icon sits off-
          screen to the right and only the left portion is visible, anchoring
          the breath at the visible left edge means the visible region
          expands/contracts symmetrically around its OWN center, with no
          perceived sideways drift. */}
      <div style={{ position: 'absolute', right: -30, top: -40, pointerEvents: 'none',
                    transform: 'scale(var(--glyph-scale, 1))', transformOrigin: 'top right' }}>
        <div className="cop-glyph-breath" style={{ transformOrigin: '0% 50%' }}>
          <AppleGlyph size={250} color="#fff"/>
        </div>
      </div>

      {/* SVG noise grain — barely visible, breaks up the gradient banding.
          Inline data URI keeps it dependency-free. */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.035,
        mixBlendMode: 'overlay',
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`,
      }}/>

      {/* Bottom edge feather — fades into the white toolbar with no hard
          1px line. */}
      <div aria-hidden style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: 16,
        background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.35))',
        pointerEvents: 'none',
      }}/>

      {/* Collapsed layout — pinned to top, fades in late */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 50,
        display: 'flex', alignItems: 'center', gap: 16, padding: '0 28px',
        opacity: 'var(--col-op, 0)' as unknown as number /* React opacity is typed as number, but browsers accept any CSS value */,
      }}>
        <AppleGlyph size={18}/>
        <span style={{ font: '400 14px/1 inherit' }}>{BRAND.role}</span>
        <span style={{ font: '400 12px/1 inherit', color: 'rgba(255,255,255,0.45)' }}>{BRAND.team}</span>
        <div style={{ flex: 1 }}/>
        <span style={{ font: '500 10px/1 "JetBrains Mono", monospace', color: 'rgba(255,255,255,0.55)', letterSpacing: '0.16em' }}>T-{BRAND.daysLeft}D</span>
        <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.18)' }}/>
        <span style={{ font: '500 13px/1 "JetBrains Mono", monospace' }}>{BRAND.matchScore}</span>
        <span style={{ font: '500 9px/1 "JetBrains Mono", monospace', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.18em' }}>MATCH</span>
      </div>

      {/* Expanded layout — fades out first */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        opacity: 'var(--exp-op, 1)' as unknown as number,
      }}>
          {/* Logo is split out of the drop-1 animation: hero glyph hands off
              to it via a pure opacity fade (no translateY), so it doesn't
              flash/jolt with the rest of the row.  All other children of
              row 1 still get the unified drop animation. */}
          <div style={{ position: 'relative', padding: '20px 28px 12px', display: 'flex', alignItems: 'center', gap: 22 }}>
            <span className="cop-banner-logo-fade" style={{ display: 'inline-flex' }}>
              <AppleGlyph size={32}/>
            </span>
            <div className="cop-banner-drop cop-banner-drop-1" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 22 }}>
              <div>
                <MonoLabel color="rgba(255,255,255,0.45)" mb={8}>Now Applying</MonoLabel>
                <div style={{ font: '300 26px/1.05 inherit', letterSpacing: '-0.025em', marginBottom: 4 }}>{BRAND.role}</div>
                <div style={{ font: '400 12.5px/1 inherit', color: 'rgba(255,255,255,0.55)' }}>{BRAND.team} · {BRAND.location}</div>
              </div>
              <div style={{ flex: 1 }}/>
              <ChromeStat label="Deadline" v={BRAND.deadline} sub={`${BRAND.daysLeft}d left`} accent={BRAND.daysLeft <= 7 ? '#ff8c5a' : null}/>
              <ChromeStat label="Comp" v={BRAND.salary.split(' + ')[0]} sub={`+ ${BRAND.salary.split(' + ')[1] || ''}`}/>
              <ChromeStat label="Loop" v={BRAND.loop} sub={BRAND.recruiter}/>
              <MatchDial score={BRAND.matchScore} startDelay={1480} animate={isHighMatch(BRAND.matchScore)}/>
            </div>
          </div>
          <div className="cop-banner-drop cop-banner-drop-2" style={{ position: 'relative', padding: '0 28px 12px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{ font: '300 italic 13px/1 "Times New Roman", serif', color: 'rgba(255,255,255,0.42)' }}>{BRAND.motto}</span>
            <span style={{ font: '500 10px/1 "JetBrains Mono", monospace', letterSpacing: '0.16em', color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase' }}>Posted {BRAND.posted}</span>
          </div>
          <div className="cop-banner-drop cop-banner-drop-3" style={{ position: 'relative', padding: '12px 28px 14px', borderTop: '1px solid rgba(255,255,255,0.08)',
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
      </div>
    </div>
  );
}

/* ──────── Shell ──────── */
export interface EditorShellCopProps {
  /** Slot for the FormatToolbarV3 buttons (B/I/U, font, alignment, link). */
  formatToolbar?: React.ReactNode;
  /** TipTap editor canvas + overlays. */
  children: React.ReactNode;
  /** Status pieces taken from the old V3TopBar — folded into the toolbar row. */
  title: string;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  pageCount: number;
  onExport: () => void;
}

/**
 * Embedded chrome inside the editor page. Layout:
 *
 *   ┌─ AppleChrome (full width) ──────────────────────────────┐
 *   ├─ Rail │ FormatToolbar (centered buttons + Saved + Pages + Export) ─┤
 *   │      ├──────────────────────────────────────────────────┤
 *   │      │ paper canvas                                     │
 *   └──────┴──────────────────────────────────────────────────┘
 *
 * Rail height extends from below AppleChrome to the bottom of the editor
 * area, so it sits *next to* the toolbar (not below it).
 */
// Suppress unused-export warning — kept for trivial revert path
void chromeBtn;

/**
 * Scroll-driven shrink hook with two phases.
 *
 *   Phase 1 (banner < half collapsed): wheel events are CAPTURED — preventDefault
 *     stops real scroll. Banner virtual progress fills until it's half-collapsed.
 *   Phase 2 (banner >= half): wheel falls through to native scroll, AND we keep
 *     accumulating virtual progress so the banner continues collapsing toward
 *     full as the resume scrolls.
 *   Reverse: scrolling up at scrollTop=0 first drains virtual back to 0
 *     (banner re-expands), then triggers rubber-band stretch.
 */
const SHRINK_RANGE = 220;     // virtual px to fully collapse banner (more = slower collapse)
const VIRTUAL_LOCK = 220;     // virtual threshold under which real scroll is blocked

// iOS-style rubber band — direct DOM writes (no React re-render per frame).
const MAX_STRETCH = 130;
const PULL_RESISTANCE = 7;
const PULL_GAIN = 0.18;          // lower = pulls slower per wheel tick (light + heavy feel)
const RELEASE_DURATION = 1100;   // ms — long, unhurried return
const WHEEL_END_DELAY = 130;     // ms before release kicks in
const EXPANDED_FOR_HOOK = 220;
const COLLAPSED_FOR_HOOK = 50;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * useShrinkScroll — drives banner geometry via CSS variables on a host element,
 * NOT React state. setState only fires when banner enters/leaves the
 * fully-expanded state (for ARIA + edge-case logic). The 60fps animation runs
 * entirely through direct DOM writes, so the banner stays smooth even when
 * the rest of the tree is heavy.
 *
 * Writes to host element style:
 *   --banner-h         px      total banner height (drives container)
 *   --banner-progress  0..1    used for content opacity crossfade math
 *   --exp-op           0..1    expanded-layer opacity
 *   --col-op           0..1    collapsed-layer opacity
 *   --glyph-scale      0..1    ghosted Apple glyph transform scale
 */
function useShrinkScroll() {
  const scrollRef = React.useRef<HTMLElement>(null);
  const hostRef = React.useRef<HTMLDivElement>(null);

  // Mutable state — refs only, no React state for animation values.
  //
  // Smoothing model: wheel writes only to `virtualTargetRef`. A rAF loop
  // lerps `virtualRef` (the displayed value) toward target with damping,
  // and ALL CSS var writes are driven by `virtualRef`. This decouples
  // banner motion from wheel-event rate, so:
  //   - Mouse wheels (large, sparse deltas) feel eased instead of jumpy
  //   - Trackpad swipes (small, dense deltas) coalesce per-frame instead
  //     of writing CSS vars 6× per frame
  //   - Stopping the wheel doesn't snap the banner — it glides to rest
  const virtualRef = React.useRef(0);        // currently DISPLAYED value
  const virtualTargetRef = React.useRef(0);  // value wheel is steering toward
  const pullRef = React.useRef(0);
  const lastWheelRef = React.useRef(0);
  const releasingRef = React.useRef(false);
  const releaseStartRef = React.useRef(0);
  const releaseFromRef = React.useRef(0);
  const rafRef = React.useRef(0);
  const rafActive = React.useRef(false);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const writeVars = () => {
      const host = hostRef.current;
      if (!host) return;
      const progress = Math.min(1, Math.max(0, virtualRef.current / SHRINK_RANGE));
      const height = EXPANDED_FOR_HOOK - (EXPANDED_FOR_HOOK - COLLAPSED_FOR_HOOK) * progress + pullRef.current;
      const expOp = Math.max(0, 1 - progress / 0.7);
      const colOp = Math.max(0, (progress - 0.5) / 0.5);
      const s = host.style;
      s.setProperty('--banner-h', `${height}px`);
      s.setProperty('--banner-progress', String(progress));
      s.setProperty('--exp-op', String(expOp));
      s.setProperty('--col-op', String(colOp));
      s.setProperty('--glyph-scale', String(1 - progress * 0.52));
    };

    // Damping factor for lerp. 0.22 ≈ ~6-frame settle (60fps) — fast enough
    // to feel responsive to wheel input, slow enough to mask wheel jitter.
    const LERP = 0.22;
    // Below this gap we snap to target so we don't sit forever doing
    // sub-pixel lerps that don't visibly change anything.
    const SNAP_EPSILON = 0.25;

    const ensureRaf = () => {
      if (rafActive.current) return;
      rafActive.current = true;
      const tick = () => {
        const now = performance.now();
        let needNext = false;

        // 1) Banner virtual: lerp current → target. This is what makes
        //    every wheel-driven motion feel buttery instead of stepped.
        const diff = virtualTargetRef.current - virtualRef.current;
        if (Math.abs(diff) > SNAP_EPSILON) {
          virtualRef.current += diff * LERP;
          needNext = true;
        } else if (virtualRef.current !== virtualTargetRef.current) {
          virtualRef.current = virtualTargetRef.current;
        }

        // 2) Rubber-band release for over-scroll-up bounce (unchanged).
        if (releasingRef.current) {
          const t = (now - releaseStartRef.current) / RELEASE_DURATION;
          if (t >= 1) {
            pullRef.current = 0;
            releasingRef.current = false;
          } else {
            const ease = easeOutCubic(t);
            pullRef.current = releaseFromRef.current * (1 - ease);
            needNext = true;
          }
        } else if (now - lastWheelRef.current > WHEEL_END_DELAY && pullRef.current > 0) {
          releasingRef.current = true;
          releaseStartRef.current = now;
          releaseFromRef.current = pullRef.current;
          needNext = true;
        }

        writeVars();
        if (needNext) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          rafActive.current = false;
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    // Wheel writes to TARGET only. Display follows via rAF lerp above.
    const setVTarget = (next: number) => {
      virtualTargetRef.current = next;
      ensureRaf();
    };

    const onWheel = (e: WheelEvent) => {
      const dy = e.deltaY;
      const atTop = el.scrollTop <= 0;

      // BOUNCE
      if (atTop && dy < 0 && virtualTargetRef.current === 0 && virtualRef.current < 1) {
        e.preventDefault();
        releasingRef.current = false;
        const tension = 1 + (pullRef.current / MAX_STRETCH) * PULL_RESISTANCE;
        const contribution = (Math.abs(dy) * PULL_GAIN) / tension;
        pullRef.current = Math.min(MAX_STRETCH, pullRef.current + contribution);
        lastWheelRef.current = performance.now();
        ensureRaf();
        return;
      }

      // PHASE 1: scrolling down, banner less than half-collapsed AND resume at top.
      if (dy > 0 && virtualTargetRef.current < VIRTUAL_LOCK && atTop) {
        e.preventDefault();
        setVTarget(Math.min(SHRINK_RANGE, virtualTargetRef.current + dy));
        return;
      }

      // REVERSE: scrolling up while at scrollTop=0 and target > 0 — re-expand banner.
      if (dy < 0 && atTop && virtualTargetRef.current > 0) {
        e.preventDefault();
        setVTarget(Math.max(0, virtualTargetRef.current + dy));
        return;
      }

      // PHASE 2: wheel passes through to real scroll. Also continue collapsing
      // banner toward full so the transition feels continuous.
      if (dy > 0 && virtualTargetRef.current < SHRINK_RANGE) {
        setVTarget(Math.min(SHRINK_RANGE, virtualTargetRef.current + dy));
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    // Initial paint
    writeVars();
    return () => {
      el.removeEventListener('wheel', onWheel);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { scrollRef, hostRef };
}

export function EditorShellCop({ formatToolbar, children, title, saveStatus, pageCount, onExport }: EditorShellCopProps) {
  const [railCollapsed, setRailCollapsed] = React.useState(false);
  // Delay entrance animations until the page has finished its initial paint
  // (font load + React hydration + TipTap mount). Without this gate, the
  // animation runs in parallel with heavy first-paint work and visibly
  // stutters on hard reloads. bfcache nav (back/forward) doesn't have this
  // contention so feels smooth — proves the timing is the issue.
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    let raf1 = 0, raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        // Tiny extra wait so font swap (FOUT) lands before motion starts.
        const t = setTimeout(() => setReady(true), 80);
        return () => clearTimeout(t);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);
  // dragX is the live pill x-offset (in editor coords) while dragging.
  // Allowed range during drag: [-PILL_W, RAIL_MAX - 18] — pill can be
  // dragged ~one pill width past the editor's left edge (visually tucked
  // behind the menu sidebar boundary). The flip to "closed" shape only
  // happens when the pill reaches that fully-tucked position, NOT at 0.
  // After release, the pill snaps to a STATIC position (0 = visible at
  // boundary, or RAIL_MAX-18 = nested in rail's right edge).
  const PILL_W = 18;
  const [dragX, setDragX] = React.useState<number | null>(null);
  const isDragging = dragX !== null;
  const dragStartedCollapsedRef = React.useRef(false);

  // Pill x position (in editor coords) — during drag follows cursor with overshoot.
  const pillLeft = isDragging
    ? dragX!
    : (railCollapsed ? 0 : RAIL_MAX - PILL_W);
  // During drag, attach the rail edge to the long edge that is doing the work:
  // - opening from collapsed: pill's LEFT long edge pulls the rail out
  // - closing from open: pill's RIGHT long edge pushes the rail back
  // Using one edge for both directions makes one direction feel like the short
  // end of the bookmark is shoving the panel around.
  const railWidth = isDragging
    ? Math.max(0, Math.min(RAIL_MAX, dragStartedCollapsedRef.current ? dragX! : dragX! + PILL_W))
    : (railCollapsed ? 0 : RAIL_MAX);

  // Visual collapsed = COMMITTED state. Pill shape never flips during drag —
  // only when state commits on release.
  const visualCollapsed = railCollapsed;

  const { scrollRef, hostRef } = useShrinkScroll();
  const indicatorRef = React.useRef<HTMLDivElement>(null);

  // When AI sidebar is open, the resume page card translates -180px (see
  // EditorPageV3.tsx ~line 523). The format toolbar lives in the chrome
  // ABOVE the page card, so it doesn't move automatically — we mirror the
  // exact same translate on its center column so the formatting buttons
  // stay visually centered over the resume paper, not over the (now wider
  // on the right) toolbar row.
  const aiSidebarOpen = useAssistantStore((s) => s.pose === 'sidebar');
  const toolbarShift = aiSidebarOpen ? 'translateX(-180px)' : 'translateX(0)';

  // Custom scroll indicator — tracks `scrollRef`'s scrollTop, resizes the
  // pill, lets the user drag it. Visibility is now LOCAL to this scroll
  // container (set inline opacity) so scrolling the AI sidebar doesn't
  // also light up the resume's indicator.
  React.useEffect(() => {
    const main = scrollRef.current;
    const indicator = indicatorRef.current;
    if (!main || !indicator) return;

    let fadeTimer: ReturnType<typeof setTimeout> | null = null;
    let isDraggingIndicator = false;

    const setOpacity = (v: string) => {
      // Use a small map of opacity → color alpha so the existing color
      // mixing works without globals.css body.cop-s-N classes.
      indicator.style.setProperty('opacity', v);
    };

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = main;
      if (scrollHeight <= clientHeight + 1) {
        setOpacity('0');
        return;
      }
      const indicatorH = Math.max(28, (clientHeight / scrollHeight) * clientHeight);
      const maxTranslate = clientHeight - indicatorH;
      const translateY = (scrollTop / (scrollHeight - clientHeight)) * maxTranslate;
      indicator.style.height = `${indicatorH}px`;
      indicator.style.transform = `translateY(${translateY}px)`;
    };

    const showAndScheduleFade = () => {
      setOpacity('1');
      if (fadeTimer) clearTimeout(fadeTimer);
      fadeTimer = setTimeout(() => {
        if (!isDraggingIndicator) setOpacity('0');
      }, 700);
    };

    const onScroll = () => {
      update();
      showAndScheduleFade();
    };

    // Drag: mousedown on indicator captures pointer, mousemove translates
    // delta into scrollTop. stopPropagation/preventDefault block the
    // double-click → text-selection behaviour that was leaking through.
    const onDown = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isDraggingIndicator = true;
      setOpacity('1');
      if (fadeTimer) clearTimeout(fadeTimer);
      const startY = e.clientY;
      const startScrollTop = main.scrollTop;
      const trackH = main.clientHeight - indicator.offsetHeight;
      const scrollRange = main.scrollHeight - main.clientHeight;
      const ratio = scrollRange / Math.max(1, trackH);

      const onMove = (ev: MouseEvent) => {
        ev.preventDefault();
        main.scrollTop = startScrollTop + (ev.clientY - startY) * ratio;
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.body.style.userSelect = '';
        isDraggingIndicator = false;
        showAndScheduleFade();
      };
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };
    const blockEvent = (e: Event) => { e.preventDefault(); e.stopPropagation(); };

    update();
    main.addEventListener('scroll', onScroll, { passive: true });
    indicator.addEventListener('mousedown', onDown);
    indicator.addEventListener('dblclick', blockEvent);
    indicator.addEventListener('contextmenu', blockEvent);
    const ro = new ResizeObserver(update);
    ro.observe(main);
    if (main.firstElementChild) ro.observe(main.firstElementChild as Element);
    return () => {
      main.removeEventListener('scroll', onScroll);
      if (fadeTimer) clearTimeout(fadeTimer);
      indicator.removeEventListener('mousedown', onDown);
      indicator.removeEventListener('dblclick', blockEvent);
      indicator.removeEventListener('contextmenu', blockEvent);
      ro.disconnect();
    };
  }, [scrollRef]);

  const savedLabel = saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Save error' : saveStatus === 'saved' ? 'Saved' : '';
  const savedColor = saveStatus === 'error' ? T.miss : saveStatus === 'saving' ? T.warn : T.good;

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Source+Serif+Pro:ital,wght@0,400;0,600;1,400&display=swap"/>
      <div ref={hostRef}
           data-cop-ready={ready ? '' : undefined}
           data-banner-tier={getBrandTier(BRAND.name)}
           data-high-match={isHighMatch(BRAND.matchScore) ? '' : undefined}
           style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%',
                     background: T.bg, color: T.fg, fontFamily: 'Inter, system-ui, sans-serif',
                     overflow: 'visible', position: 'relative' }}>
        {/* Hero Apple glyph — appears at viewport center, scales + rotates,
            then flies into the banner's top-left logo slot just as the
            unfurl finishes. After landing it fades out and the banner's
            actual logo (in cop-banner-drop-1) takes over. position: fixed
            so it ignores host's flex layout but stays under the same
            data-cop-ready gate. */}
        <div className="cop-hero-glyph" aria-hidden>
          <AppleGlyph size={32} color="#fff"/>
        </div>
        <AppleChrome/>
        <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
          {/* Single sliding pill — unified expand/collapse trigger.
              Click → toggle. Drag → direction commits state (no rebound).
              Hover → terracotta highlight (site primary). */}
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              const startX = e.clientX;
              const startPillLeft = pillLeft;
              dragStartedCollapsedRef.current = railCollapsed;
              let liveX = startPillLeft;
              let moved = false;
              const pointerId = e.pointerId;
              const target = e.currentTarget;
              const onMove = (ev: PointerEvent) => {
                if (ev.pointerId !== pointerId) return;
                ev.preventDefault();
                const dx = ev.clientX - startX;
                if (Math.abs(dx) > 3) moved = true;
                const maxX = dragStartedCollapsedRef.current ? RAIL_MAX : RAIL_MAX - PILL_W;
                liveX = Math.max(-PILL_W, Math.min(maxX, startPillLeft + dx));
                setDragX(liveX);
              };
              const finish = (ev: PointerEvent) => {
                if (ev.pointerId !== pointerId) return;
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', finish);
                window.removeEventListener('pointercancel', finish);
                if (target.hasPointerCapture(pointerId)) {
                  target.releasePointerCapture(pointerId);
                }
                if (moved) {
                  const liveWidth = Math.max(
                    0,
                    Math.min(RAIL_MAX, dragStartedCollapsedRef.current ? liveX : liveX + PILL_W),
                  );
                  setRailCollapsed(liveWidth < RAIL_MAX / 2);
                } else {
                  setRailCollapsed(!railCollapsed);
                }
                setDragX(null);
              };
              window.addEventListener('pointermove', onMove, { passive: false });
              window.addEventListener('pointerup', finish);
              window.addEventListener('pointercancel', finish);
            }}
            title={railCollapsed ? 'Expand rail' : 'Collapse rail'}
            style={{
              position: 'absolute',
              left: pillLeft,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 18, height: 56,
              // Closed: rounded right (`0 12 12 0`) — bookmark sticking
              //   out toward the editor area.
              // Open: completely mirrored — rounded left (`12 0 0 12`) so
              //   the bookmark side faces the rail content (inside rail).
              // Driven by committed state — no flip during drag.
              borderRadius: visualCollapsed ? '0 12px 12px 0' : '12px 0 0 12px',
              border: `1px solid ${T.border}`,
              background: T.paper,
              color: T.fgM,
              display: 'grid', placeItems: 'center',
              cursor: isDragging ? 'grabbing' : 'grab',
              userSelect: 'none',
              // zIndex high enough to render OVER the menu sidebar (which
              // typically sits at z 30-40 for fixed nav elements).
              zIndex: 60,
              // Drop shadow — pill is "elevated" above the recessed rail.
              // Inverse of the rail's inset-shadow language. Two-layer:
              // tight near-shadow for definition, soft far-shadow for lift.
              // While dragging the shadow grows slightly (picked up off the
              // surface) and the inset highlight strengthens.
              boxShadow: isDragging
                ? '0 6px 14px oklch(0.18 0.01 50 / 0.18), 0 2px 4px oklch(0.18 0.01 50 / 0.12)'
                : '0 3px 8px oklch(0.18 0.01 50 / 0.12), 0 1px 2px oklch(0.18 0.01 50 / 0.10)',
              // No transition during drag — pill follows cursor 1:1 like a curtain.
              // After release, snap animation runs with the same easing as the rail.
              transition: isDragging
                ? 'none'
                : `left ${DUR} ${EASE}, border-radius ${DUR} ${EASE}, ` +
                  'background-color 160ms ease, color 160ms ease, border-color 160ms ease, ' +
                  'box-shadow 200ms ease',
            }}
            onMouseEnter={(e) => {
              // Site primary terracotta highlight on hover
              e.currentTarget.style.backgroundColor = T.apple;
              e.currentTarget.style.borderColor = T.apple;
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = T.paper;
              e.currentTarget.style.borderColor = T.border;
              e.currentTarget.style.color = T.fgM;
            }}
          >
            <svg
              width="11" height="11" viewBox="0 0 24 24"
              fill="none" stroke="currentColor"
              strokeWidth="1.7" strokeLinecap="round"
              style={{
                // Arrow direction follows `visualCollapsed` — only flips
                // when pill HITS an end during drag, not at midpoint.
                transform: visualCollapsed ? 'none' : 'scaleX(-1)',
                transition: isDragging ? 'none' : `transform ${DUR} ${EASE}`,
              }}
            >
              <path d="M9 6l6 6-6 6"/>
            </svg>
          </button>
          <TacticalRail width={railWidth} animate={!isDragging}/>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {/* Toolbar row — 3-column grid (1fr / auto / 1fr). Center column
                hugs its content; left/right columns claim equal flex weight,
                so the format buttons in the middle are TRULY centered in the
                visible row, regardless of how wide the title or status group
                are.  (Was a flex layout that put the toolbar in flex:1 between
                two unequal flex-shrink:0 spans, which biased it leftward.) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto 1fr',
              alignItems: 'center',
              padding: '0 18px',
              height: 44, flexShrink: 0,
              borderBottom: `1px solid ${T.border}`, background: T.paper,
            }}>
              {/* Left column — title, left-aligned */}
              <span style={{
                font: '500 12px/1 Inter', color: T.fgM,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                justifySelf: 'start', minWidth: 0,
              }}>
                {title || 'Untitled Resume'}
              </span>
              {/* Center column — format toolbar, centered. Shifts left in
                  lockstep with the resume page card when the AI sidebar
                  opens so the buttons stay over the paper, not over the
                  blank gutter that opens up to the right of the toolbar. */}
              <div style={{
                justifySelf: 'center', display: 'flex', alignItems: 'center',
                transform: toolbarShift,
                transition: 'transform 0.95s cubic-bezier(0.5, 0.5, 0.5, 1)',
                willChange: 'transform',
              }}>
                {formatToolbar}
              </div>
              {/* Right column — status + export, right-aligned */}
              <div style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ font: '500 10.5px/1 Inter', color: savedColor, display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                  <i style={{ width: 5, height: 5, borderRadius: 999, background: 'currentColor' }}/>
                  {savedLabel}
                </span>
                <span style={{ font: '500 10.5px/1 "JetBrains Mono", monospace', color: T.fgM, letterSpacing: '0.04em', flexShrink: 0 }}>
                  {pageCount} {pageCount === 1 ? 'PAGE' : 'PAGES'}
                </span>
                <button onClick={onExport} style={{
                  height: 28, padding: '0 12px', borderRadius: 6, background: 'rgb(20,20,20)',
                  font: '500 12px/1 Inter', color: '#fff', border: 0, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                  </svg>
                  Export PDF
                </button>
              </div>
            </div>
            {/* Wrapper for custom scroll indicator overlay — main fills it,
                indicator div is absolutely positioned over the right edge. */}
            <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
              <main
                ref={scrollRef as React.RefObject<HTMLElement>}
                className="cop-resume-scroll"
                style={{
                  position: 'absolute', inset: 0,
                  overflowY: 'auto',
                  background: `linear-gradient(180deg, ${T.bg} 0, oklch(.96 .005 60) 100%)`,
                }}
              >
                {children}
              </main>
              <div ref={indicatorRef} className="cop-resume-indicator"/>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
