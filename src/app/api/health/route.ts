import { checkFfmpeg } from "@/lib/export/ffmpeg";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
// Never cached: a health check that lies about a broken dependency is worse
// than no health check at all.
export const dynamic = "force-dynamic";

/**
 * Reports whether this instance can actually do the things the app needs.
 *
 * Returns 200 when everything the core workflow needs is present, and 503 when
 * something is missing, so a deploy platform or uptime check can tell the
 * difference between "the process is up" and "the process can work".
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; detail: string }> = {};

  // Env the app refuses to run without.
  const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  for (const key of required) {
    checks[key] = { ok: Boolean(process.env[key]?.trim()), detail: process.env[key]?.trim() ? "set" : "missing" };
  }

  // Supabase reachable — catches a wrong URL or a revoked key, which otherwise
  // only shows up as a 500 on whichever page happens to query first.
  try {
    const { error } = await getSupabaseAdmin().from("telegram_settings").select("id").limit(1);
    checks.supabase = { ok: !error, detail: error ? error.message : "reachable" };
  } catch (e) {
    checks.supabase = { ok: false, detail: e instanceof Error ? e.message : "unreachable" };
  }

  // Print tokens must be signed with a secret every instance shares, or exports
  // 404 when the render lands on a different process.
  const hasSecret = Boolean(process.env.PRINT_TOKEN_SECRET?.trim());
  checks.PRINT_TOKEN_SECRET = {
    ok: hasSecret || process.env.NODE_ENV !== "production",
    detail: hasSecret ? "set" : process.env.NODE_ENV === "production" ? "missing — exports will fail across instances" : "not set (dev fallback in use)",
  };

  // ffmpeg is a system binary, not an npm dependency, so nothing guarantees it.
  const ff = await checkFfmpeg();
  checks.ffmpeg = { ok: ff.ok, detail: ff.ok ? (ff.version ?? "available") : (ff.reason ?? "unavailable") };

  // Telegram credentials — reported separately because the app is still usable
  // (image export, the whole question bank) without them.
  const hasTelegram = Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHANNEL?.trim());
  checks.telegram = { ok: hasTelegram, detail: hasTelegram ? "configured" : "not configured — publishing disabled" };

  // Only the first four gate overall health; Telegram being unset is a
  // configuration choice, not an outage.
  const critical = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "supabase", "PRINT_TOKEN_SECRET"];
  const healthy = critical.every((k) => checks[k]?.ok);

  return Response.json(
    { ok: healthy, checks },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
