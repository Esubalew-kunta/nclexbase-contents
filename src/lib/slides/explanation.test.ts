import { describe, expect, it } from "vitest";
import { splitExplanationByOption } from "./explanation";

describe("splitExplanationByOption", () => {
  it("gives each option verdict its own line", () => {
    const text =
      "B is correct because severe hyperkalemia with peaked T waves indicates a risk of life-threatening cardiac dysrhythmias. IV insulin shifts potassium from the blood into the cells. " +
      "A is incorrect because daily weight monitors fluid balance but does not immediately address the cardiac risk. " +
      "C is incorrect because oral fluids do not treat the dangerous ECG changes. " +
      "D is incorrect because dietary modification does not rapidly correct severe hyperkalemia.";

    const parts = splitExplanationByOption(text);

    expect(parts).toHaveLength(4);
    expect(parts[0]).toMatch(/^B is correct because severe hyperkalemia/);
    // The sentences that belong to B stay with B rather than starting a line.
    expect(parts[0]).toMatch(/IV insulin shifts potassium from the blood into the cells\.$/);
    expect(parts[1]).toMatch(/^A is incorrect because daily weight/);
    expect(parts[2]).toMatch(/^C is incorrect because oral fluids/);
    expect(parts[3]).toMatch(/^D is incorrect because dietary modification/);
  });

  it("keeps an ordinary explanation as a single paragraph", () => {
    const text =
      "Hyperglycemia with ketones, deep rapid respirations and a fruity breath odor indicate diabetic ketoacidosis. Treatment starts with IV fluids, followed by IV insulin.";
    expect(splitExplanationByOption(text)).toEqual([text]);
  });

  it("does not split on a single verdict", () => {
    const text = "A is correct because the airway always comes first. Everything else waits until it is patent.";
    expect(splitExplanationByOption(text)).toEqual([text]);
  });

  it("keeps scene-setting sentences before the first verdict as their own line", () => {
    const text =
      "This client is in septic shock. A is correct because fluids restore perfusion. B is incorrect because antipyretics do not treat hypotension.";
    const parts = splitExplanationByOption(text);
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("This client is in septic shock.");
    expect(parts[1]).toMatch(/^A is correct/);
    expect(parts[2]).toMatch(/^B is incorrect/);
  });

  it("handles verdicts covering several options at once", () => {
    const text =
      "Options A and C are correct because both restore perfusion. Options B and D are incorrect because neither addresses the volume deficit.";
    const parts = splitExplanationByOption(text);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatch(/^Options A and C are correct/);
    expect(parts[1]).toMatch(/^Options B and D are incorrect/);
  });

  it("does not split on a capital letter inside a sentence", () => {
    // "D is incorrect" appears mid-sentence here and must not start a line;
    // with only one real verdict left, the text stays whole.
    const text = "A is correct because the dose is safe. Supplementing vitamin D is incorrect for this client at this time.";
    expect(splitExplanationByOption(text)).toEqual([text]);
  });

  it("trims surrounding whitespace", () => {
    expect(splitExplanationByOption("   A single thought.   ")).toEqual(["A single thought."]);
  });
});
