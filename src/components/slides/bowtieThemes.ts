import type { TemplateId } from "@/lib/slides/types";

/** Per-template palettes for the shared bow-tie diagram. The diagram's geometry
 * lives in one CSS module; only colour and type differ between templates, so
 * each template hands over its own custom properties rather than duplicating the
 * whole layout three times.
 *
 * No `--bt-line*` values here any more: the connector lines they styled are gone.
 *
 * Cast because TypeScript's CSSProperties doesn't model `--custom-property`
 * keys, even though they are valid in an inline style object. */
const THEMES = {
  "modern-study": {
    "--bt-font": "var(--font-inter), system-ui, sans-serif",
    "--bt-heading": "#0e5a5c",
    "--bt-text": "#173133",
    "--bt-chip-bg": "rgba(14, 90, 92, 0.05)",
    "--bt-chip-border": "#b9c7c5",
    "--bt-chip-label-bg": "#0e5a5c",
    "--bt-chip-label": "#ffffff",
    "--bt-center-bg": "#0e5a5c",
    "--bt-center-border": "#0e5a5c",
    "--bt-center-text": "#ffffff",
    "--bt-center-letter-bg": "#ffffff",
    "--bt-correct-bg": "rgba(201, 163, 78, 0.16)",
    "--bt-correct-border": "#c9a34e",
    "--bt-correct-label-bg": "#c9a34e",
    "--bt-correct-label": "#173133",
    "--bt-blank-line": "rgba(14, 90, 92, 0.12)",
    "--bt-text-size": "23px",
    "--bt-option-text-size": "18px",
    "--bt-heading-size": "20px",
    "--bt-letter-size": "40px",
    "--bt-letter-font": "20px",
    "--bt-gutter": "52px",
  },
  "clean-clinical": {
    "--bt-font": "var(--font-inter), system-ui, sans-serif",
    "--bt-heading": "#4a5c5e",
    "--bt-text": "#1d2426",
    "--bt-chip-bg": "#ffffff",
    "--bt-chip-border": "#c3cdcb",
    "--bt-chip-label-bg": "#4a5c5e",
    "--bt-chip-label": "#ffffff",
    "--bt-center-bg": "#2c3b3d",
    "--bt-center-border": "#2c3b3d",
    "--bt-center-text": "#ffffff",
    "--bt-center-letter-bg": "#ffffff",
    "--bt-correct-bg": "#eef6f5",
    "--bt-correct-border": "#2f7d7f",
    "--bt-correct-label-bg": "#2f7d7f",
    "--bt-correct-label": "#ffffff",
    "--bt-blank-line": "rgba(44, 59, 61, 0.12)",
    "--bt-text-size": "22px",
    "--bt-option-text-size": "17px",
    "--bt-heading-size": "18px",
    "--bt-letter-size": "38px",
    "--bt-letter-font": "19px",
    "--bt-gutter": "56px",
  },
  "premium-editorial": {
    "--bt-font": "var(--font-source-serif), Georgia, serif",
    "--bt-heading": "#8a6d2f",
    "--bt-text": "#231f18",
    "--bt-chip-bg": "#f7f3ea",
    "--bt-chip-border": "#cdc3ab",
    "--bt-chip-label-bg": "#8a6d2f",
    "--bt-chip-label": "#ffffff",
    "--bt-center-bg": "#2a2419",
    "--bt-center-border": "#2a2419",
    "--bt-center-text": "#f7f3ea",
    "--bt-center-letter-bg": "#f7f3ea",
    "--bt-correct-bg": "#fbf4e2",
    "--bt-correct-border": "#c9a34e",
    "--bt-correct-label-bg": "#c9a34e",
    "--bt-correct-label": "#2a2419",
    "--bt-blank-line": "rgba(42, 36, 25, 0.12)",
    "--bt-text-size": "22px",
    "--bt-option-text-size": "17px",
    "--bt-heading-size": "18px",
    "--bt-letter-size": "38px",
    "--bt-letter-font": "19px",
    "--bt-gutter": "54px",
  },
} as unknown as Record<TemplateId, React.CSSProperties>;

export function bowtieTheme(templateId: TemplateId): React.CSSProperties {
  return THEMES[templateId];
}