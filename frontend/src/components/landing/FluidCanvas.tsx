"use client";

import { useEffect, useRef, useCallback } from "react";

/* ── Agent colors in linear RGB (from oklch approximations) ── */
const COLORS = {
  recruiter: [0.75, 0.35, 0.22],  // warm terracotta
  manager: [0.28, 0.55, 0.35],    // sage green
  coach: [0.25, 0.30, 0.60],      // deep blue
} as const;

const VERTEX_SRC = `
  attribute vec2 a_position;
  void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

const FRAGMENT_SRC = `
  precision highp float;

  uniform float u_time;
  uniform vec2 u_resolution;
  uniform vec2 u_mouse;
  uniform float u_speed;

  // Agent colors
  const vec3 c1 = vec3(${COLORS.recruiter.join(", ")});
  const vec3 c2 = vec3(${COLORS.manager.join(", ")});
  const vec3 c3 = vec3(${COLORS.coach.join(", ")});

  // Simplex-style noise
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // Fractional Brownian Motion
  float fbm(vec2 p) {
    float val = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 5; i++) {
      val += amp * snoise(p * freq);
      freq *= 2.0;
      amp *= 0.5;
    }
    return val;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    float aspect = u_resolution.x / u_resolution.y;
    vec2 p = vec2(uv.x * aspect, uv.y);

    // Blob motion scales with speed; noise time stays slow to avoid jittery grain
    // when speed > 1 (which would otherwise read as "moving dots" in smaller panels).
    float t = u_time * 0.15 * u_speed;
    float tn = u_time * 0.15;

    // Mouse influence — gentle attraction
    vec2 mouse = vec2(u_mouse.x * aspect, u_mouse.y);
    float mouseDist = length(p - mouse);
    float mouseInfluence = smoothstep(0.8, 0.0, mouseDist) * 0.3;

    // Three fluid blobs — each representing an agent
    // They drift organically using noise-displaced positions
    vec2 center1 = vec2(
      0.3 * aspect + 0.15 * sin(t * 1.2) + 0.1 * fbm(vec2(t * 0.5, 0.0)),
      0.7 + 0.12 * cos(t * 0.9) + 0.08 * fbm(vec2(0.0, t * 0.4))
    );
    vec2 center2 = vec2(
      0.7 * aspect + 0.12 * cos(t * 0.8) + 0.1 * fbm(vec2(t * 0.3, 3.0)),
      0.35 + 0.15 * sin(t * 1.1) + 0.08 * fbm(vec2(3.0, t * 0.5))
    );
    vec2 center3 = vec2(
      0.5 * aspect + 0.18 * sin(t * 0.6 + 2.0) + 0.1 * fbm(vec2(t * 0.4, 6.0)),
      0.5 + 0.12 * cos(t * 1.4 + 1.0) + 0.08 * fbm(vec2(6.0, t * 0.3))
    );

    // Push blobs toward mouse
    center1 += (mouse - center1) * mouseInfluence * 0.15;
    center2 += (mouse - center2) * mouseInfluence * 0.12;
    center3 += (mouse - center3) * mouseInfluence * 0.10;

    // Metaball-style field — smooth organic blending
    float field1 = 0.08 / (length(p - center1) + 0.001);
    float field2 = 0.07 / (length(p - center2) + 0.001);
    float field3 = 0.06 / (length(p - center3) + 0.001);

    // Noise distortion on fields — sampled in unit UV space (not aspect-stretched p),
    // so narrow/wide panels don't get over-sampled noise that reads as grain.
    float noise = fbm(uv * 2.5 + tn * 0.5) * 0.3;
    field1 += noise * 0.15;
    field2 += noise * 0.12;
    field3 += noise * 0.10;

    float totalField = field1 + field2 + field3;

    // Color blending based on field dominance
    vec3 color = vec3(0.0);
    float w1 = field1 / totalField;
    float w2 = field2 / totalField;
    float w3 = field3 / totalField;

    color = c1 * w1 + c2 * w2 + c3 * w3;

    // Vignette — darker at edges
    float vignette = 1.0 - smoothstep(0.3, 1.2, length(uv - 0.5) * 1.4);
    color *= mix(0.15, 0.45, vignette);

    // Subtle specular highlight near mouse
    float specular = smoothstep(0.4, 0.0, mouseDist) * 0.06;
    color += specular;

    // NOTE: the prior luminanceNoise and pixel-based grain terms were removed
    // here — they read as visible flickering dots in the smaller AI panel.
    // The blobs + vignette alone give enough organic feel without grain.

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function FluidCanvas({
  className,
  forceAnimate = false,
  speed = 1.0,
}: {
  className?: string;
  forceAnimate?: boolean;
  /** Time-scale multiplier for shader animation. Default 1.0 (landing speed). Higher = faster blob motion. */
  speed?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const startTimeRef = useRef(Date.now());

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mouseRef.current = {
      x: (e.clientX - rect.left) / rect.width,
      y: 1.0 - (e.clientY - rect.top) / rect.height, // flip Y for GL
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Check reduced motion preference (forceAnimate overrides it)
    const prefersReducedMotion = !forceAnimate && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const gl = canvas.getContext("webgl", { alpha: false, antialias: false });
    if (!gl) return; // Fallback: CSS gradient will show through

    // Compile shaders
    function createShader(type: number, src: string) {
      const s = gl!.createShader(type)!;
      gl!.shaderSource(s, src);
      gl!.compileShader(s);
      if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) {
        /* shader compile failed — CSS fallback will show */
        gl!.deleteShader(s);
        return null;
      }
      return s;
    }

    const vs = createShader(gl.VERTEX_SHADER, VERTEX_SRC);
    const fs = createShader(gl.FRAGMENT_SHADER, FRAGMENT_SRC);
    if (!vs || !fs) return;

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      /* program link failed — CSS fallback will show */
      return;
    }

    gl.useProgram(program);

    // Full-screen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const posLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Uniforms
    const uTime = gl.getUniformLocation(program, "u_time");
    const uRes = gl.getUniformLocation(program, "u_resolution");
    const uMouse = gl.getUniformLocation(program, "u_mouse");
    const uSpeed = gl.getUniformLocation(program, "u_speed");

    // Resize handler
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Mouse
    canvas.addEventListener("mousemove", handleMouseMove);

    // Render loop — respect reduced motion
    startTimeRef.current = Date.now();
    const render = () => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      gl.uniform1f(uTime, prefersReducedMotion ? 0 : elapsed);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform2f(uMouse, mouseRef.current.x, mouseRef.current.y);
      gl.uniform1f(uSpeed, speed);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (!prefersReducedMotion) {
        rafRef.current = requestAnimationFrame(render);
      }
    };
    render();

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      canvas.removeEventListener("mousemove", handleMouseMove);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, [handleMouseMove, forceAnimate, speed]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      style={{ width: "100%", height: "100%" }}
    />
  );
}
