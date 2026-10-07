/** Starts Chrome as soon as the server boots, so the first export doesn't pay
 *  for a cold launch (20+ seconds on a small Render instance). Not awaited:
 *  `register` must finish before the server accepts requests, and a slow or
 *  failed launch must not hold up — or take down — the app. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { getBrowser } = await import("@/lib/export/browser");
  void getBrowser().catch((err) => console.error("Chrome pre-warm failed:", err));
}
