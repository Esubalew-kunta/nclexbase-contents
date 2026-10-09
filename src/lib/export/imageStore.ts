import { randomUUID } from "node:crypto";

// Hands a question's attached picture to the Playwright-driven /print page.
//
// The picture cannot ride inside the print token: the token is part of a URL
// (`/print?token=…`, `/api/print-data/<token>`), and a base64 image is far past
// any URL limit. Instead the bytes are parked here briefly and the question is
// rewritten to point at `/api/print-image/<id>`. This is process-local, which is
// correct for the same reason the render path already uses loopback in
// production: the Chromium that fetches the image is talking to this process.

const TTL_MS = 5 * 60 * 1000;

interface Entry {
  buffer: Buffer;
  contentType: string;
  expires: number;
}

// globalThis so Next's separate route-module instances share one map in dev.
const globalStore = globalThis as unknown as { __printImages?: Map<string, Entry> };
const store = (globalStore.__printImages ??= new Map<string, Entry>());

function sweep() {
  const now = Date.now();
  for (const [id, e] of store) if (e.expires < now) store.delete(id);
}

const DATA_URL = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/;

/** Stores a data: URL image and returns the id to fetch it by, or null when the
 *  string is not a supported image data URL (callers then drop the image rather
 *  than render something unverified). */
export function putPrintImage(dataUrl: string): string | null {
  const m = DATA_URL.exec(dataUrl);
  if (!m) return null;
  sweep();
  const id = randomUUID();
  store.set(id, { buffer: Buffer.from(m[2], "base64"), contentType: m[1], expires: Date.now() + TTL_MS });
  return id;
}

export function getPrintImage(id: string): Entry | null {
  const e = store.get(id);
  if (!e || e.expires < Date.now()) return null;
  return e;
}

export function deletePrintImage(id: string): void {
  store.delete(id);
}
