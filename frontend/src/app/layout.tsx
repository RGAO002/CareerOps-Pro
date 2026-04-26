import type { Metadata } from "next";
import { Outfit, Instrument_Serif, Inter } from "next/font/google";
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
    <html lang="en" className={`${body.variable} ${display.variable} ${inter.variable}`}>
      <body className="font-[family-name:var(--font-body)] antialiased">
        {children}
      </body>
    </html>
  );
}
