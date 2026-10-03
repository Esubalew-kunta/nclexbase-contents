import { describe, expect, it } from "vitest";
import { clampPostsPerDay, DEFAULT_POST_TIME, postTimeSchema, postsPerDaySchema, slotStaggerMs, SLOT_STAGGER_SECONDS } from "./postTimes";

describe("postTimeSchema", () => {
  it("accepts normal 24-hour times", () => {
    expect(postTimeSchema.parse("09:00")).toBe("09:00");
    expect(postTimeSchema.parse("23:59")).toBe("23:59");
  });

  it.each(["9:00", "24:00", "09:60", "0900", "nine", "", "09:0"])("rejects %p", (bad) => {
    expect(postTimeSchema.safeParse(bad).success).toBe(false);
  });
});

describe("postsPerDaySchema", () => {
  it("accepts a sensible count", () => {
    expect(postsPerDaySchema.parse(1)).toBe(1);
    expect(postsPerDaySchema.parse(2)).toBe(2);
    expect(postsPerDaySchema.parse(6)).toBe(6);
  });

  it("rejects zero, which would silently stop all scheduling", () => {
    expect(postsPerDaySchema.safeParse(0).success).toBe(false);
  });

  it("rejects more than six", () => {
    expect(postsPerDaySchema.safeParse(7).success).toBe(false);
  });

  it("rejects a fraction", () => {
    expect(postsPerDaySchema.safeParse(2.5).success).toBe(false);
  });
});

describe("clampPostsPerDay", () => {
  it("passes a legal number through", () => {
    expect(clampPostsPerDay(2)).toBe(2);
    expect(clampPostsPerDay(6)).toBe(6);
  });

  it("pulls an out-of-range value back into range instead of disabling scheduling", () => {
    expect(clampPostsPerDay(0)).toBe(1);
    expect(clampPostsPerDay(-4)).toBe(1);
    expect(clampPostsPerDay(99)).toBe(6);
  });

  it("falls back to the default for junk rather than producing NaN", () => {
    expect(clampPostsPerDay(null)).toBe(2);
    expect(clampPostsPerDay(undefined)).toBe(2);
    expect(clampPostsPerDay("nonsense")).toBe(2);
  });

  it("rounds a fractional value so it still satisfies the DB constraint", () => {
    expect(clampPostsPerDay(2.4)).toBe(2);
    expect(clampPostsPerDay(2.6)).toBe(3);
  });
});

describe("slotStaggerMs", () => {
  it("gives every slot of the day a distinct offset", () => {
    const offsets = [0, 1, 2].map(slotStaggerMs);
    expect(new Set(offsets).size).toBe(3);
  });

  it("leaves the first slot at the exact chosen time", () => {
    expect(slotStaggerMs(0)).toBe(0);
  });

  it("spreads slots far enough apart to order them by timestamp", () => {
    expect(slotStaggerMs(1)).toBe(SLOT_STAGGER_SECONDS * 1000);
  });

  it("never produces a negative offset for a negative index", () => {
    expect(slotStaggerMs(-1)).toBe(0);
  });
});

describe("DEFAULT_POST_TIME", () => {
  it("is itself valid, so a row written before the setting existed still schedules", () => {
    expect(postTimeSchema.safeParse(DEFAULT_POST_TIME).success).toBe(true);
  });
});