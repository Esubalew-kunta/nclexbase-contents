/** Explanations usually arrive as one run-on paragraph that works through the
 *  options in turn — "B is correct because … A is incorrect because … C is
 *  incorrect because …". Rendered as a single block of text the later options
 *  vanish into the middle of the paragraph, which is exactly where a reader
 *  goes looking for them, so each verdict is given its own line instead.
 *
 *  The split is textual on purpose: the sentences live in `explanation`, and
 *  the per-option `optionRationales` map is a different field that is already
 *  rendered as its own "why the other options are wrong" section. */

/** The start of a sentence passing verdict on one or more lettered options:
 *  "B is correct because…", "Options A and C are incorrect…".
 *
 *  The letter has to open a sentence. Without that anchor a capital inside a
 *  sentence would split it — "the client's vitamin D is incorrect for this
 *  dose" would become a new paragraph beginning "D is incorrect". */
const OPTION_VERDICT = /(?:^|(?<=[.!?]["')\]]?\s))(?:Options?\s+)?[A-Z](?:\s*(?:,|and|&)\s*[A-Z])*\s+(?:is|are)\s+(?:in)?correct\b/g;

/** Splits an explanation into one string per option verdict, in order, with
 *  any scene-setting sentences before the first verdict kept as their own
 *  leading paragraph. Text that does not walk the options comes back as a
 *  single entry, so an ordinary explanation renders exactly as it did before. */
export function splitExplanationByOption(text: string): string[] {
  const trimmed = text.trim();

  const starts: number[] = [];
  OPTION_VERDICT.lastIndex = 0;
  for (let match = OPTION_VERDICT.exec(trimmed); match !== null; match = OPTION_VERDICT.exec(trimmed)) {
    starts.push(match.index);
  }

  // A single verdict is just a sentence — splitting there would only orphan a
  // line, so the run-on shape has to be real before it is broken up.
  if (starts.length < 2) return [trimmed];

  const parts: string[] = [];
  if (starts[0] > 0) parts.push(trimmed.slice(0, starts[0]).trim());
  starts.forEach((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] : trimmed.length;
    parts.push(trimmed.slice(start, end).trim());
  });

  return parts.filter((part) => part.length > 0);
}
