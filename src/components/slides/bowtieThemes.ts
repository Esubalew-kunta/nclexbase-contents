import type { TemplateId } from "@/lib/slides/types";

/** Per-template palettes for the shared bowtie diagram. The diagram's geometry
 * lives in one CSS module; only colour and type differ between templates, so
 * each template hands over its own custom properties rather than duplicating
 * the whole layout three times.
 *
 * Cast because TypeScript's CSSProperties doesn't model `--custom-property`
 * keys, even though they are valid in an inline style object. */
const THEMES = {
  "modern-study": {
    "--bt-font": "var(--font-inter), system-ui, sans-serif",
    "--bt-heading": "#0e5a5c",
    "--bt-text": "#173133",
    "--bt-line": "#9fb0ad",
    "--bt-line-dim": "#d6dedb",
    "--bt-chip-bg": "rgba(14, 90, 92, 0.06)",
    "--bt-chip-border": "transparent",
    "--bt-chip-label-bg": "#0e5a5c",
    "--bt-chip-label": "#ffffff",
    "--bt-center-bg": "#0e5a5c",
    "--bt-center-border": "#0e5a5c",
    "--bt-center-text": "#ffffff",
    "--bt-correct-bg": "rgba(201, 163, 78, 0.16)",
    "--bt-correct-border": "#c9a34e",
    "--bt-correct-label-bg": "#c9a34e",
    "--bt-correct-label": "#173133",
    "--bt-text-size": "23px",
    "--bt-heading-size": "20px",
    "--bt-gutter": "52px",
  },
  "clean-clinical": {
    "--bt-font": "var(--font-inter), system-ui, sans-serif",
    "--bt-heading": "#4a5c5e",
    "--bt-text": "#1d2426",
    "--bt-line": "#b7c2c0",
    "--bt-line-dim": "#dde3e2",
    "--bt-chip-bg": "#ffffff",
    "--bt-chip-border": "#d7dedc",
    "--bt-chip-label-bg": "#4a5c5e",
    "--bt-chip-label": "#ffffff",
    "--bt-center-bg": "#2c3b3d",
    "--bt-center-border": "#2c3b3d",
    "--bt-center-text": "#ffffff",
    "--bt-correct-bg": "#eef6f5",
    "--bt-correct-border": "#2f7d7f",
    "--bt-correct-label-bg": "#2f7d7f",
    "--bt-correct-label": "#ffffff",
    "--bt-text-size": "22px",
    "--bt-heading-size": "18px",
    "--bt-gutter": "56px",
  },
  "premium-editorial": {
    "--bt-font": "var(--font-source-serif), Georgia, serif",
    "--bt-heading": "#8a6d2f",
    "--bt-text": "#231f18",
    "--bt-line": "#c3b393",
    "--bt-line-dim": "#e2dac8",
    "--bt-chip-bg": "#f7f3ea",
    "--bt-chip-border": "#e0d7c2",
    "--bt-chip-label-bg": "#8a6d2f",
    "--bt-chip-label": "#ffffff",
    "--bt-center-bg": "#2a2419",
    "--bt-center-border": "#2a2419",
    "--bt-center-text": "#f7f3ea",
    "--bt-correct-bg": "#fbf4e2",
    "--bt-correct-border": "#c9a34e",
    "--bt-correct-label-bg": "#c9a34e",
    "--bt-correct-label": "#2a2419",
    "--bt-text-size": "22px",
    "--bt-heading-size": "18px",
    "--bt-gutter": "54px",
  },
} as unknown as Record<TemplateId, React.CSSProperties>;

export function bowtieTheme(templateId: TemplateId): React.CSSProperties {
  return THEMES[templateId];
}
