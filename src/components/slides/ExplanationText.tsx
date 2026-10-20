import { splitExplanationByOption } from "@/lib/slides/explanation";

/** Renders the "why" explanation, giving each option's verdict its own line.
 *
 *  Shared by all three templates so no template can go back to burying option
 *  C and D in the middle of a paragraph. The gap is in `em` rather than pixels
 *  because the slide shrinks its text through `--density-scale` when content
 *  is tight — a fixed gap would stay wide while the words around it got
 *  smaller.
 *
 *  Paragraph heights still come out of the same markup the paginator measures,
 *  so the extra lines are accounted for when it decides what fits on a slide. */
export function ExplanationText({ text, className }: { text: string; className?: string }) {
  const parts = splitExplanationByOption(text);
  if (parts.length < 2) return <p className={className}>{text}</p>;

  return (
    <>
      {parts.map((part, i) => (
        <p key={i} className={className} style={i > 0 ? { marginTop: "0.55em" } : undefined}>
          {part}
        </p>
      ))}
    </>
  );
}
