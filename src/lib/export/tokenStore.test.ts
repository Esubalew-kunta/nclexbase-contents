import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { deletePrintPayload, getPrintPayload, putPrintPayload } from "./tokenStore";
import type { NormalizedQuestion } from "@/lib/content/types";

const SECRET = "test-secret-for-print-tokens";

function question(id = "q1"): NormalizedQuestion {
  return {
    id,
    index: 1,
    type: "sata",
    category: null,
    instructions: null,
    question: "Which findings require notification? (Select all that apply.)",
    options: [
      { label: "A", text: "Temperature 38.9 C" },
      { label: "B", text: "Heart rate 122" },
    ],
    correctAnswers: ["A", "B"],
    correctAnswerText: null,
    explanation: "Both indicate deteriorating perfusion.",
    optionRationales: { B: "Tachycardia needs escalation." },
    keyPoint: "Escalate on trends.",
    notes: null,
    format: "multiple",
    bowtie: null,
  };
}

function withSecret<T>(fn: () => T): T {
  const prev = process.env.PRINT_TOKEN_SECRET;
  process.env.PRINT_TOKEN_SECRET = SECRET;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.PRINT_TOKEN_SECRET;
    else process.env.PRINT_TOKEN_SECRET = prev;
  }
}

describe("putPrintPayload", () => {
  it("round-trips a payload through the token", () => {
    withSecret(() => {
      const token = putPrintPayload({ question: question(), templateId: "modern-study", ctaText: "Join us" });
      const result = getPrintPayload(token);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.payload.question.id).toBe("q1");
      expect(result.payload.templateId).toBe("modern-study");
      expect(result.payload.ctaText).toBe("Join us");
    });
  });

  it("needs no server-side state — a token minted before the call is still valid", () => {
    withSecret(() => {
      const token = putPrintPayload({ question: question(), templateId: "modern-study", ctaText: "" });
      // The old Map-based store required a put/get pair in one process; reading
      // repeatedly is what a multi-instance host does, so it must be stable.
      expect(getPrintPayload(token).ok).toBe(true);
      expect(getPrintPayload(token).ok).toBe(true);
      expect(getPrintPayload(token).ok).toBe(true);
    });
  });

  it("rejects an unknown template rather than signing an unrenderable request", () => {
    withSecret(() => {
      expect(() => putPrintPayload({ question: question(), templateId: "nope" as never, ctaText: "" })).toThrow(/Unknown template/);
    });
  });

  it("stays valid after deletePrintPayload, since nothing is stored", () => {
    withSecret(() => {
      const token = putPrintPayload({ question: question(), templateId: "modern-study", ctaText: "" });
      deletePrintPayload(token);
      expect(getPrintPayload(token).ok).toBe(true);
    });
  });
});

describe("getPrintPayload verification", () => {
  it("rejects a token signed with a different secret", () => {
    const token = withSecret(() => putPrintPayload({ question: question(), templateId: "modern-study", ctaText: "" }));
    process.env.PRINT_TOKEN_SECRET = "a-different-secret";
    try {
      const result = getPrintPayload(token);
      expect(result.ok).toBe(false);
      expect(!result.ok && result.reason).toBe("bad-signature");
    } finally {
      delete process.env.PRINT_TOKEN_SECRET;
    }
  });

  it("rejects a token whose payload was edited after signing", () => {
    withSecret(() => {
      const token = putPrintPayload({ question: question(), templateId: "modern-study", ctaText: "Join us" });
      const [body, sig] = token.split(".");
      const tampered = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
      tampered.payload.ctaText = "Buy my course";
      const forged = Buffer.from(JSON.stringify(tampered), "utf8").toString("base64url") + "." + sig;
      const result = getPrintPayload(forged);
      expect(result.ok).toBe(false);
      expect(!result.ok && result.reason).toBe("bad-signature");
    });
  });

  it("reports an expired token distinctly from a forged one", () => {
    withSecret(() => {
      const token = putPrintPayload({ question: question(), templateId: "modern-study", ctaText: "" });
      const [body, sig] = token.split(".");
      const env = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
      env.exp = Math.floor(Date.now() / 1000) - 10;
      const expired = Buffer.from(JSON.stringify(env), "utf8").toString("base64url") + "." + sig;
      // Re-sign so only the expiry is wrong.
      const reSig = createHmac("sha256", SECRET).update(expired.split(".")[0]).digest("base64url");
      const result = getPrintPayload(expired.split(".")[0] + "." + reSig);
      expect(result.ok).toBe(false);
      expect(!result.ok && result.reason).toBe("expired");
    });
  });

  it.each(["", "not-a-token", "abc.def", ".", "a."])("rejects the malformed token %p", (bad) => {
    withSecret(() => {
      const result = getPrintPayload(bad);
      expect(result.ok).toBe(false);
    });
  });

  it("rejects a token with no signature separator", () => {
    withSecret(() => {
      const token = putPrintPayload({ question: question(), templateId: "modern-study", ctaText: "" });
      const result = getPrintPayload(token.split(".")[0]);
      expect(result.ok).toBe(false);
      expect(!result.ok && result.reason).toBe("malformed");
    });
  });

  it("tolerates a huge question payload, which is what a long bowtie produces", () => {
    withSecret(() => {
      const big = question("big");
      big.question = "x".repeat(20000);
      big.options = Array.from({ length: 8 }, (_, i) => ({ label: String(i), text: "option ".repeat(200) }));
      const token = putPrintPayload({ question: big, templateId: "premium-editorial", ctaText: "Join us" });
      const result = getPrintPayload(token);
      expect(result.ok).toBe(true);
      expect(result.ok && result.payload.question.question.length).toBe(20000);
    });
  });
});
