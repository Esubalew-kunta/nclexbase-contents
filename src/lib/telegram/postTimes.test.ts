import { describe, expect, it } from "vitest";
import { DEFAULT_POST_TIMES, postTimesSchema, postsPerDay, slotTimeAt, sortPostTimes } from "./postTimes";

describe("postTimesSchema", () => {
  it("accepts a normal 24-hour list", () => {
    expect(postTimesSchema.parse(["09:00", "21:00"])).toEqual(["09:00", "21:00"]);
  });

  it("rejects an empty list, because zero posts a day would silently stop scheduling", () => {
    expect(postTimesSchema.safeParse([]).success).toBe(false);
  });

  it("accepts a single slot", () => {
    expect(postTimesSchema.parse(["08:00"])).toEqual(["08:00"]);
  });

  it("caps at six posts a day", () => {
    const six = ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"];
    expect(postTimesSchema.safeParse(six).success).toBe(true);
    expect(postTimesSchema.safeParse([...six, "23:00"]).success).toBe(false);
  });

  it("rejects duplicate slots, which would make capacity lie", () => {
    expect(postTimesSchema.safeParse(["09:00", "09:00"]).success).toBe(false);
  });

  it.each(["9:00", "24:00", "09:60", "0900", "nine", "", "09:0", "9:0"])("rejects %p", (bad) => {
    expect(postTimesSchema.safeParse([bad]).success).toBe(false);
  });

  it.each(["00:00", "09:00", "23:59", "12:30"])("accepts %p", (good) => {
    expect(postTimesSchema.safeParse([good]).success).toBe(true);
  });

  it("rejects a non-string entry rather than coercing it", () => {
    expect(postTimesSchema.safeParse([900]).success).toBe(false);
  });
});

describe("sortPostTimes", () => {
  it("orders by clock time, not by the admin's input order", () => {
    expect(sortPostTimes(["21:00", "09:00", "13:00"])).toEqual(["09:00", "13:00", "21:00"]);
  });

  it("does not mutate its input", () => {
    const input = ["21:00", "09:00"];
    sortPostTimes(input);
    expect(input).toEqual(["21:00", "09:00"]);
  });

  it("passes an already-sorted list through unchanged", () => {
    expect(sortPostTimes(["09:00", "21:00"])).toEqual(["09:00", "21:00"]);
  });
});

describe("slotTimeAt", () => {
  it("returns the time for a slot index", () => {
    expect(slotTimeAt(["09:00", "21:00"], 0)).toBe("09:00");
    expect(slotTimeAt(["09:00", "21:00"], 1)).toBe("21:00");
  });

  it("clamps a past-the-end index to the last slot rather than yielding undefined", () => {
    // Auto-assign must never build a post with an undefined time, which would
    // throw deep inside the timezone maths.
    expect(slotTimeAt(["09:00", "21:00"], 5)).toBe("21:00");
  });

  it("returns null for an empty list", () => {
    expect(slotTimeAt([], 0)).toBeNull();
  });

  it("ignores input order", () => {
    expect(slotTimeAt(["21:00", "09:00"], 0)).toBe("09:00");
  });
});

describe("postsPerDay", () => {
  it("is the length of the list — one source of truth", () => {
    expect(postsPerDay(DEFAULT_POST_TIMES)).toBe(2);
    expect(postsPerDay(["09:00"])).toBe(1);
    expect(postsPerDay([])).toBe(0);
  });
});

describe("DEFAULT_POST_TIMES", () => {
  it("is itself a valid list, so a row written before the setting existed still schedules", () => {
    expect(postTimesSchema.safeParse(DEFAULT_POST_TIMES).success).toBe(true);
  });
});
