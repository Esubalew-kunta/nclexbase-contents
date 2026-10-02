"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { utcToZonedDateStr, utcToZonedTimeStr } from "@/lib/telegram/timezone";
import type { ScheduledPostWithQuestion } from "@/components/calendar/types";

interface Settings {
  daily_time: string;
  timezone: string;
  channel: string | null;
  enabled: boolean;
  /** One entry per daily posting slot. Absent on rows written before the
   * setting existed, which is why the UI falls back to daily_time. */
  post_times?: string[];
}

const STATUS_BADGE: Record<string, string> = {
  scheduled: "bg-gray-100 text-gray-600",
  publishing: "bg-blue-100 text-blue-700",
  published: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

export function DashboardPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [posts, setPosts] = useState<ScheduledPostWithQuestion[] | null>(null);
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

  const { todayCounts, upcoming, recent, failed } = useMemo(() => {
    if (!posts) return { todayCounts: { scheduled: 0, published: 0, failed: 0 }, upcoming: [], recent: [], failed: [] };

    const todayCounts = { scheduled: 0, published: 0, failed: 0 };
    const upcoming: ScheduledPostWithQuestion[] = [];
    const recent: ScheduledPostWithQuestion[] = [];
    const failed: ScheduledPostWithQuestion[] = [];

    for (const p of posts) {
      const dateStr = utcToZonedDateStr(new Date(p.scheduled_at), p.timezone);
      if (dateStr === todayStr) {
        if (p.status === "scheduled" || p.status === "publishing") todayCounts.scheduled++;
        else if (p.status === "published") todayCounts.published++;
        else if (p.status === "failed") todayCounts.failed++;
      }
      if (p.status === "scheduled" && dateStr >= todayStr) upcoming.push(p);
      if (p.status === "published") recent.push(p);
      if (p.status === "failed") failed.push(p);
    }

    upcoming.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    recent.sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));

    return { todayCounts, upcoming: upcoming.slice(0, 8), recent: recent.slice(0, 8), failed };
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

      {/* Status strip: wraps rather than overflowing on a phone. break-words
          matters because body is a column flex container, so a long unbreakable
          token here sets the page's min-content width and stretches it. */}
      <div className="mb-6 flex min-w-0 flex-wrap items-center gap-x-6 gap-y-1 break-words rounded-xl border border-gray-200 bg-white p-4 text-sm">
        <span className={`font-semibold ${settings?.enabled ? "text-green-700" : "text-gray-400"}`}>{settings?.enabled ? "✓ Connected" : "○ Disabled"}</span>
        {settings && (
          <span className="text-gray-500">
            Posts a day: <span className="font-semibold text-brand-dark">{settings.post_times?.length ?? 1}</span> ({settings.post_times?.join(", ") ?? settings.daily_time})
          </span>
        )}
        {settings?.channel && <span className="text-gray-500">Channel: <span className="font-semibold text-brand-dark">{settings.channel}</span></span>}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Scheduled" value={todayCounts.scheduled} color="text-gray-600" />
        <StatCard label="Published" value={todayCounts.published} color="text-green-700" />
        <StatCard label="Failed" value={todayCounts.failed} color="text-red-600" />
      </div>
      <p className="-mt-4 mb-6 text-xs text-gray-400">Today ({todayStr})</p>

      <Section title="Upcoming">
        {!posts ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-gray-400">Nothing scheduled yet — use the Calendar to schedule a question.</p>
        ) : (
          upcoming.map((p) => <PostRow key={p.id} post={p} tz={tz} />)
        )}
      </Section>

      <Section title="Recently Published">
        {posts && recent.length === 0 ? <p className="text-sm text-gray-400">Nothing published yet.</p> : recent.map((p) => <PostRow key={p.id} post={p} tz={tz} />)}
      </Section>

      <Section title="Failed">
        {posts && failed.length === 0 ? (
          <p className="text-sm text-gray-400">No failures.</p>
        ) : (
          failed.map((p) => (
            <div key={p.id} className="flex items-center justify-between border-b border-gray-100 py-2.5 text-sm last:border-0">
              <div className="min-w-0">
                <p className="truncate font-semibold text-brand-dark">{p.nclex_questions?.category ?? p.nclex_questions?.type ?? "Question"}</p>
                <p className="truncate text-xs text-red-500">{p.error_message ?? "Telegram API error"}</p>
              </div>
              <button type="button" disabled={retrying === p.id} onClick={() => retry(p.id)} className="ml-3 flex-none rounded-lg bg-brand-gold px-3 py-1.5 text-xs font-bold text-brand-dark disabled:opacity-50">
                {retrying === p.id ? "Retrying…" : "Retry"}
              </button>
            </div>
          ))
        )}
      </Section>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">{title}</h2>
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-1">{children}</div>
    </div>
  );
}

function PostRow({ post, tz }: { post: ScheduledPostWithQuestion; tz: string }) {
  const d = new Date(post.scheduled_at);
  return (
    <div className="flex items-center justify-between border-b border-gray-100 py-2.5 text-sm last:border-0">
      <div className="min-w-0">
        <p className="truncate font-semibold text-brand-dark">{post.nclex_questions?.category ?? post.nclex_questions?.type ?? "Question"}</p>
        <p className="truncate text-xs text-gray-400">
          {utcToZonedDateStr(d, post.timezone)} {utcToZonedTimeStr(d, post.timezone)} ({tz})
        </p>
      </div>
      <span className={`ml-3 flex-none rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_BADGE[post.status] ?? "bg-gray-100 text-gray-500"}`}>{post.status}</span>
    </div>
  );
}
