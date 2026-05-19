"use client";

interface Props {
  company: string;
  logo: string;
  logoBg: string;
  logoFg: string;
  size?: number;
}

function AppleGlyph({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 170 200" fill={color}>
      <path d="M150.37 130.29c-2.34 5.4-5.1 10.36-8.3 14.92-4.36 6.22-7.92 10.52-10.67 12.9-4.27 3.92-8.84 5.93-13.74 6.05-3.52 0-7.76-1-12.7-3.04-4.96-2.02-9.51-3.03-13.67-3.03-4.36 0-9.04 1-14.04 3.03-5.01 2.04-9.05 3.1-12.13 3.21-4.69.2-9.37-1.87-14.04-6.21-2.97-2.59-6.69-7.04-11.16-13.36-4.79-6.74-8.73-14.55-11.81-23.45C5.81 111.7 4 102.27 4 93.13c0-10.48 2.27-19.51 6.81-27.07 3.57-6.07 8.32-10.86 14.27-14.39 5.95-3.52 12.38-5.32 19.32-5.43 3.74 0 8.65 1.16 14.74 3.44 6.08 2.29 9.97 3.45 11.69 3.45 1.28 0 5.62-1.36 13-4.07 6.97-2.51 12.85-3.55 17.66-3.14 13.04 1.05 22.83 6.2 29.34 15.46-11.66 7.07-17.42 16.97-17.31 29.7.1 9.91 3.66 18.16 10.69 24.74 3.18 3.02 6.74 5.36 10.7 7.03-.86 2.49-1.77 4.87-2.74 7.15zM119.27 7.05c0 7.83-2.86 15.14-8.55 21.92-6.87 8.06-15.18 12.72-24.19 12-.11-.94-.18-1.93-.18-2.97 0-7.51 3.27-15.57 9.08-22.16 2.9-3.34 6.6-6.11 11.07-8.32 4.46-2.18 8.68-3.38 12.66-3.59.11 1.04.11 2.08.11 3.12z" />
    </svg>
  );
}

export function CompanyLogo({ company, logo, logoBg, logoFg, size = 36 }: Props) {
  const radius = Math.round(size * 0.25);

  if (company === "Apple") {
    return (
      <div
        style={{
          width: size, height: size, borderRadius: radius,
          background: "#000", display: "grid", placeItems: "center", flexShrink: 0,
        }}
      >
        <AppleGlyph size={size * 0.5} color="#fff" />
      </div>
    );
  }

  return (
    <div
      style={{
        width: size, height: size, borderRadius: radius,
        background: logoBg || "var(--surface-1)",
        border: logoBg === "#fff" ? "1px solid var(--border)" : "none",
        display: "grid", placeItems: "center", flexShrink: 0,
        font: `600 ${Math.round(size * 0.42)}px/1 Inter, system-ui, sans-serif`,
        color: logoFg || "var(--foreground)",
        letterSpacing: "-0.02em",
      }}
    >
      {logo}
    </div>
  );
}
