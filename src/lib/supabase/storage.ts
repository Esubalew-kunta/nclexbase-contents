import { getSupabaseAdmin } from "./server";

// Server-only helpers for the private `question-slides` Storage bucket.
//
// The bucket is not public, so nothing here ever hands a permanent URL to the
// browser: reads go through a short-lived signed URL minted per request. Every
// call needs the service-role key, so this file must never be imported from a
// "use client" component.

const BUCKET = "question-slides";

/** How long a signed slide URL stays valid. Long enough for a page of
 * thumbnails to load and for a download click to land, short enough that a
 * leaked URL is useless almost immediately. */
const SIGNED_URL_TTL_SECONDS = 60 * 30;

/** One PNG to store. The object path is derived from the question id and this
 * filename, so callers never build paths themselves. */
export interface SlideToStore {
  /** Human-facing slide name, e.g. "Q1.png" or "A1-2.png". */
  filename: string;
  buffer: Buffer;
}

/** Object path for one slide. Question ids are UUIDs so they are always safe as
 * a path segment, and the filename comes from our own renderer. */
export function slideObjectPath(questionId: string, filename: string): string {
  return `${questionId}/${filename}`;
}

export async function uploadQuestionSlides(questionId: string, files: SlideToStore[]): Promise<string[]> {
  if (files.length === 0) return [];
  const db = getSupabaseAdmin();

  // Replace the whole question folder in one call: re-rendering a question must
  // never leave orphaned slides behind, or a question that shrank from four
  // slides to two would still show four thumbnails (two of them stale).
  await removeQuestionSlidesByPrefix(questionId);

  const uploaded: string[] = [];
  for (const file of files) {
    const path = slideObjectPath(questionId, file.filename);
    const { error } = await db.storage.from(BUCKET).upload(path, file.buffer, {
      contentType: "image/png",
      cacheControl: "31536000",
      upsert: true,
    });
    if (error) throw new Error(`Failed to upload ${path}: ${error.message}`);
    uploaded.push(path);
  }
  return uploaded;
}

/** Removes every stored slide for a question. Tolerates a bucket that was
 * emptied out from under us — a missing prefix is not an error, because
 * deleting a question should never fail because its images were already gone. */
export async function removeQuestionSlidesByPrefix(questionId: string): Promise<void> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.storage.from(BUCKET).list(questionId, { limit: 1000 });
  if (error) return; // nothing to clean up
  const paths = (data ?? []).map((f) => `${questionId}/${f.name}`);
  if (paths.length === 0) return;

  const { error: removeErr } = await db.storage.from(BUCKET).remove(paths);
  if (removeErr) {
    console.error(`Failed to remove slides for ${questionId}:`, removeErr.message);
  }
}

export async function removeSlides(paths: string[] | null | undefined): Promise<void> {
  if (!paths || paths.length === 0) return;
  const db = getSupabaseAdmin();
  const { error } = await db.storage.from(BUCKET).remove(paths);
  if (error) console.error("Failed to remove slides:", error.message);
}

/** Mints one signed URL per slide. Paths that no longer exist come back as
 * nulls rather than failing the whole batch, so one missing file can't blank
 * out the entire bank view. The returned values are complete, expiring URLs —
 * never persist or long-term store them, only hand them to a browser. */
export async function signSlideUrls(paths: string[]): Promise<(string | null)[]> {
  if (paths.length === 0) return [];
  const db = getSupabaseAdmin();
  const { data, error } = await db.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error) {
    console.error("Failed to sign slide URLs:", error.message);
    return paths.map(() => null);
  }
  const byPath = new Map((data ?? []).map((entry) => [entry.path, entry.signedUrl]));
  return paths.map((path) => byPath.get(path) ?? null);
}
