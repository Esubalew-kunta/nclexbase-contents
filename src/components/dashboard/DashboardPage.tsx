"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { utcToZonedDateStr, utcToZonedTimeStr } from "@/lib/telegram/timezone";
import type { ScheduledPostWithQuestion } from "@/components/calendar/types";

interface Settings {
  dailyTime: string;
  timezone: string;
  channel: string | null;
  enabled: boolean;
  postsPerDay: number;
}

const STATUS_BADGE: Record<string, string> = {
  scheduled: "bg-gray-100 text-gray-600",
  publishing: "bg-blue-100 text-blue-700",
  published: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

type Bucket = "scheduled" | "published" | "failed";

const BUCKET_TITLE: Record<Bucket, string> = {
  scheduled: "Scheduled",
  published: "Published",
  failed: "Failed",
};

export function DashboardPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [posts, setPosts] = useState<ScheduledPostWithQuestion[] | null>(null);
  const [openBucket, setOpenBucket] = useState<Bucket | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const now = new Date();
    const from = new Date(now.getTime() - 14 * 86400000).toISOString();
    const to = new Date(now.getTime() + 60 * 86400000).toISOString();
    fetch(`/api/schedule?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((data) => setPosts(data.posts ?? []));
  }, []);

  useEffect(() => {
    fetch("/api/telegram/settings")
      .then((r) => r.json())
      .then((data) => setSettings(data.settings));
  }, []);

  useEffect(refresh, [refresh]);

  const tz = settings?.timezone ?? "UTC";
  const todayStr = utcToZonedDateStr(new Date(), tz);

  const buckets = useMemo(() => {
    const result: Record<Bucket, ScheduledPostWithQuestion[]> = { scheduled: [], published: [], failed: [] };
    if (!posts) return result;

    for (const p of posts) {
      const dateStr = utcToZonedDateStr(new Date(p.scheduled_at), p.timezone);
      if (dateStr !== todayStr) continue;
      if (p.status === "scheduled" || p.status === "publishing") result.scheduled.push(p);
      else if (p.status === "published") result.published.push(p);
      else if (p.status === "failed") result.failed.push(p);
    }

    result.scheduled.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    result.published.sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
    result.failed.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    return result;
  }, [posts, todayStr]);

  async function retry(id: string) {
    setRetrying(id);
    try {
      await fetch(`/api/schedule/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "retry" }) });
      refresh();
    } finally {
      setRetrying(null);
    }
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Image src="/brand/nclexbase-icon.png" alt="" width={32} height={32} unoptimized />
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-teal">NCLEXBase</p>
            <h1 className="text-xl font-bold text-brand-dark">Telegram Dashboard</h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/" className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-brand-dark hover:bg-gray-50">
            Generator
          </Link>
          <Link href="/questions" className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-brand-dark hover:bg-gray-50">
            Questions
          </Link>
          <Link href="/calendar" className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-brand-dark hover:bg-gray-50">
            Calendar
          </Link>
          <Link href="/schedule" className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-brand-dark hover:bg-gray-50">
            Schedule
          </Link>
          <Link href="/settings/telegram" className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-brand-dark hover:bg-gray-50">
            Settings
          </Link>
        </div>
      </div>

      {/* One-line status strip. break-words matters because body is a column
          flex container, so a long unbreakable token here would set the page's
          min-content width and stretch it. */}
      <div className="mb-6 flex min-w-0 flex-wrap items-center gap-x-6 gap-y-1 break-words rounded-xl border border-gray-200 bg-white p-4 text-sm">
        <span className={`font-semibold ${settings?.enabled ? "text-green-700" : "text-gray-400"}`}>{settings?.enabled ? "✓ Connected" : "○ Disabled"}</span>
        {settings && (
          <span className="text-gray-500">
            <span className="font-semibold text-brand-dark">{settings.postsPerDay}</span> a day at {settings.dailyTime} ({tz})
          </span>
        )}
        {settings?.channel && <span className="text-gray-500">Channel: <span className="font-semibold text-brand-dark">{settings.channel}</span></span>}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard bucket="scheduled" count={posts ? buckets.scheduled.length : null} onClick={() => setOpenBucket("scheduled")} />
        <StatCard bucket="published" count={posts ? buckets.published.length : null} onClick={() => setOpenBucket("published")} />
        <StatCard bucket="failed" count={posts ? buckets.failed.length : null} onClick={() => setOpenBucket("failed")} />
      </div>
      <p className="-mt-3 mb-6 text-xs text-gray-400">
        Today ({todayStr}) &mdash; click a card to see the questions behind it.
      </p>

      {openBucket && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="mt-10 w-full max-w-xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 p-5">
              <h2 className="text-lg font-bold text-brand-dark">
                {BUCKET_TITLE[openBucket]} &middot; {todayStr}
              </h2>
              <button type="button" onClick={() => setOpenBucket(null)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                Close
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-5">
              {!posts ? (
                <p className="text-sm text-gray-400">Loading…</p>
              ) : buckets[openBucket].length === 0 ? (
                <p className="text-sm text-gray-400">
                  {openBucket === "failed" ? "Nothing failed today." : openBucket === "published" ? "Nothing published today." : "Nothing scheduled for today."}
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {buckets[openBucket].map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-semibold text-brand-dark">{p.nclex_questions?.question ?? "(question deleted)"}</p>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {utcToZonedTimeStr(new Date(p.scheduled_at), p.timezone)} &middot; #{p.slot_index ?? 0} &middot;{" "}
                          {p.nclex_questions?.category ?? p.nclex_questions?.type ?? "Question"}
                        </p>
                        {openBucket === "failed" && p.error_message && <p className="mt-1 line-clamp-2 text-xs text-red-500">{p.error_message}</p>}
                      </div>
                      {openBucket === "failed" ? (
                        <button
                          type="button"
                          disabled={retrying === p.id}
                          onClick={() => retry(p.id)}
                          className="flex-none rounded-lg bg-brand-gold px-3 py-1.5 text-xs font-bold text-brand-dark disabled:opacity-50"
                        >
                          {retrying === p.id ? "Retrying…" : "Retry"}
                        </button>
                      ) : (
                        <span className={`flex-none rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_BADGE[p.status] ?? "bg-gray-100 text-gray-500"}`}>{p.status}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ bucket, count, onClick }: { bucket: Bucket; count: number | null; onClick: () => void }) {
  const tone: Record<Bucket, string> = { scheduled: "text-gray-600", published: "text-green-700", failed: "text-red-600" };
  return (
    <button type="button" onClick={onClick} className="rounded-xl border border-gray-200 bg-white p-4 text-center transition hover:border-brand-teal hover:shadow-sm">
      <p className={`text-2xl font-bold ${count === 0 ? "text-gray-300" : tone[bucket]}`}>{count ?? "–"}</p>
      <p className="text-xs text-gray-500">{BUCKET_TITLE[bucket]}</p>
    </button>
  );
}