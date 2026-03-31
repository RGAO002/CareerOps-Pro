"use client";

import { useEffect, useRef, useCallback } from "react";

interface Particle {
  x: number;
  y: number;
  progress: number; // 0-1 around perimeter
  speed: number;
  size: number;
  opacity: number;
  hue: number; // oklch hue
}

interface EdgeParticlesProps {
  /** Width of the container */
  width: number;
  /** Height of the container */
  height: number;
  /** Border radius of the container */
  radius: number;
  /** Number of particles */
  count?: number;
  /** Base speed multiplier (1 = normal, 2 = drag active) */
  speedMultiplier?: number;
  /** Overall intensity (0-1) */
  intensity?: number;
  /** Whether to show inner vortex glow */
  showVortex?: boolean;
}

/**
 * Canvas-based particle system that flows along a rounded-rect edge.
 * Particles follow the perimeter path and emit a soft glow.
 */
export function EdgeParticles({
  width,
  height,
  radius,
  count = 40,
  speedMultiplier = 1,
  intensity = 1,
  showVortex = true,
}: EdgeParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);
  const speedRef = useRef(speedMultiplier);
  const intensityRef = useRef(intensity);

  // Keep refs in sync
  speedRef.current = speedMultiplier;
  intensityRef.current = intensity;

  // Get point on rounded rect perimeter from progress (0-1)
  const getPerimeterPoint = useCallback(
    (progress: number) => {
      const r = Math.min(radius, width / 2, height / 2);
      // Perimeter: 4 straight edges + 4 quarter circles
      const straightH = width - 2 * r;
      const straightV = height - 2 * r;
      const cornerLen = (Math.PI * r) / 2;
      const totalLen = 2 * straightH + 2 * straightV + 4 * cornerLen;

      let dist = progress * totalLen;
      // Top edge (left to right)
      if (dist < straightH) {
        return { x: r + dist, y: 0 };
      }
      dist -= straightH;
      // Top-right corner
      if (dist < cornerLen) {
        const angle = -Math.PI / 2 + (dist / cornerLen) * (Math.PI / 2);
        return { x: width - r + Math.cos(angle) * r, y: r + Math.sin(angle) * r };
      }
      dist -= cornerLen;
      // Right edge (top to bottom)
      if (dist < straightV) {
        return { x: width, y: r + dist };
      }
      dist -= straightV;
      // Bottom-right corner
      if (dist < cornerLen) {
        const angle = 0 + (dist / cornerLen) * (Math.PI / 2);
        return { x: width - r + Math.cos(angle) * r, y: height - r + Math.sin(angle) * r };
      }
      dist -= cornerLen;
      // Bottom edge (right to left)
      if (dist < straightH) {
        return { x: width - r - dist, y: height };
      }
      dist -= straightH;
      // Bottom-left corner
      if (dist < cornerLen) {
        const angle = Math.PI / 2 + (dist / cornerLen) * (Math.PI / 2);
        return { x: r + Math.cos(angle) * r, y: height - r + Math.sin(angle) * r };
      }
      dist -= cornerLen;
      // Left edge (bottom to top)
      if (dist < straightV) {
        return { x: 0, y: height - r - dist };
      }
      dist -= straightV;
      // Top-left corner
      const angle = Math.PI + (dist / cornerLen) * (Math.PI / 2);
      return { x: r + Math.cos(angle) * r, y: r + Math.sin(angle) * r };
    },
    [width, height, radius],
  );

  // Initialize particles
  useEffect(() => {
    particlesRef.current = Array.from({ length: count }, () => ({
      x: 0,
      y: 0,
      progress: Math.random(),
      speed: 0.0004 + Math.random() * 0.0006,
      size: 1.5 + Math.random() * 2.5,
      opacity: 0.3 + Math.random() * 0.7,
      hue: 30 + Math.random() * 30, // 30-60: orange to amber range
    }));
  }, [count]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const spd = speedRef.current;
      const inten = intensityRef.current;

      // Inner vortex glow
      if (showVortex) {
        const cx = width / 2;
        const cy = height / 2;
        const vortexR = Math.min(width, height) * 0.3;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, vortexR);
        grad.addColorStop(0, `rgba(218, 119, 86, ${0.06 * inten})`);
        grad.addColorStop(0.5, `rgba(218, 119, 86, ${0.02 * inten})`);
        grad.addColorStop(1, "rgba(218, 119, 86, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      }

      // Update and draw particles
      for (const p of particlesRef.current) {
        p.progress = (p.progress + p.speed * spd) % 1;
        const pos = getPerimeterPoint(p.progress);
        p.x = pos.x;
        p.y = pos.y;

        const alpha = p.opacity * inten;

        // Outer glow
        const glowR = p.size * 4;
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR);
        glow.addColorStop(0, `rgba(218, 119, 86, ${alpha * 0.3})`);
        glow.addColorStop(1, "rgba(218, 119, 86, 0)");
        ctx.fillStyle = glow;
        ctx.fillRect(p.x - glowR, p.y - glowR, glowR * 2, glowR * 2);

        // Core dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(235, 150, 110, ${alpha})`;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [width, height, showVortex, getPerimeterPoint]);

  // Reduced motion: just render static dots, no animation
  // The useEffect above handles the animation; if we want to respect
  // prefers-reduced-motion, we'd skip the rAF loop. For now, the
  // particles are subtle enough to be acceptable.

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width, height }}
    />
  );
}
