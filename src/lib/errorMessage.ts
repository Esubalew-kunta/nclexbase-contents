/** Extracts a readable message from anything a catch block might see —
 * native Errors, Supabase/PostgREST error objects (plain objects with a
 * `.message`, not actual Error instances), or anything else. */
export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  if (typeof err === "string") return err;
  return fallback;
}
