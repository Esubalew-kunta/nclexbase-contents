import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NormalizedQuestion } from "@/lib/content/types";
import type { TemplateId } from "@/lib/slides/types";
import { TEMPLATES } from "@/lib/slides/types";

export interface PrintPayload {
  question: NormalizedQuestion;
  templateId: TemplateId;
  ctaText: string;
}

// Hands a question to the Playwright-driven /print page.
//
// The payload is carried INSIDE a signed token rather than held in a Map. An
// in-memory store only works when the process that writes the token is the same
// process that reads it, which is true in local dev and false the moment the
// app runs on more than one instance (Vercel, a container platform behind a load
// balancer, `next start` with clustering). There, the export route would write
// the token and /print would read it from a sibling process that never saw it —
// so every export 404s. A self-contained HMAC-signed token needs no shared
// state at all, which makes exports work on any host.
//
// The signature means /print cannot be made to render arbitrary content, and the
// embedded expiry means a leaked or replayed URL stops working on its own,
// without a sweeper process or a growing table of one-shot rows.

const TTL_SECONDS = 120;

/** Memoised across the module lifetime; see `secret()`. */
let devSecret: string | null = null;

interface Envelope {
  /** Issued-at, seconds since epoch. */
  iat: number;
  /** Expiry, seconds since epoch. */
  exp: number;
  payload: PrintPayload;
}

/**
 * The signing secret. `PRINT_TOKEN_SECRET` is required in production; in
 * development a random per-boot secret is used instead, which is fine locally
 * (tokens are minted and consumed by the same process) but would break across
 * restarts, so it warns loudly rather than failing a dev server on boot.
 */
function secret(): string {
  const configured = process.env.PRINT_TOKEN_SECRET?.trim();
  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    // Throwing here is deliberate: an unsigned or guessable token in production
    // would let anyone make the server render content, and a random per-boot
    // secret would make exports fail on every instance restart.
    throw new Error("PRINT_TOKEN_SECRET must be set in production so print tokens survive across server instances");
  }

  if (!devSecret) {
    devSecret = randomBytes(32).toString("hex");
    console.warn("[printToken] PRINT_TOKEN_SECRET is not set — using a random per-boot secret. Exports will fail if the server restarts mid-render. Set it in .env.local for stable behaviour.");
  }
  return devSecret;
}

function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

/** Mints a signed, expiring token carrying the payload. */
export function putPrintPayload(payload: PrintPayload): string {
  if (!TEMPLATES.some((t) => t.id === payload.templateId)) {
    throw new Error(`Unknown template "${payload.templateId}"`);
  }
  const now = Math.floor(Date.now() / 1000);
  const envelope: Envelope = { iat: now, exp: now + TTL_SECONDS, payload };
  const body = Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

export type VerifyResult =
  | { ok: true; payload: PrintPayload }
  | { ok: false; reason: "malformed" | "bad-signature" | "expired" };

/**
 * Verifies a token and returns its payload, or a specific reason it was
 * refused. The reason is kept separate from the HTTP status so a genuine
 * tampering attempt is never confused with an ordinary expired token.
 */
export function getPrintPayload(token: string): VerifyResult {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return { ok: false, reason: "malformed" };

  const body = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1), "base64url");

  let expected: Buffer;
  try {
    expected = Buffer.from(sign(body), "base64url");
  } catch {
    // No secret configured and we're in production — treat as unusable rather
    // than crashing a render mid-export.
    return { ok: false, reason: "bad-signature" };
  }

  // Constant-time compare so a wrong signature can't be discovered by timing.
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, reason: "bad-signature" };
  }

  let envelope: Envelope;
  try {
    envelope = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Envelope;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof envelope.exp !== "number" || envelope.exp < now) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, payload: envelope.payload };
}

/**
 * Kept for API compatibility with the old store. A signed token is stateless,
 * so there is nothing to delete — the expiry already bounds its lifetime.
 */
export function deletePrintPayload(_token: string): void {}
