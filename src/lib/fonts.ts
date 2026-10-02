import { Inter, Source_Serif_4 } from "next/font/google";

// Self-hosted at build time by next/font — no runtime Google Fonts request,
// so the live preview and the Playwright-rendered export always match.
export const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

export const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-source-serif",
  display: "swap",
});

export const fontVariables = `${inter.variable} ${sourceSerif.variable}`;
