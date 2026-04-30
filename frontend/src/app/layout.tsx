import type { Metadata } from "next";
import { Outfit, Instrument_Serif, Inter, Manrope, Plus_Jakarta_Sans } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

// Inter is the resume canvas font. Loading it here ensures the editor
// uses the SAME font that the PDF endpoint loads via Google Fonts, so
// pagination matches between editor preview and exported PDF.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-resume",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const body = Outfit({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

// Manrope — kept loaded as a fallback (sidebar previously used it).
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

// Plus Jakarta Sans — current AI sidebar primary. Visibly thicker strokes
// than Manrope/Geist, very clear at small sizes, weight presence at 600/700
// reads as "premium product UI" (similar to what Plus Jakarta brand uses).
const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const display = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "CareerOps Pro",
  description: "AI-powered career optimization platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} ${inter.variable} ${manrope.variable} ${plusJakarta.variable} ${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-[family-name:var(--font-body)] antialiased">
        {children}
      </body>
    </html>
  );
}
