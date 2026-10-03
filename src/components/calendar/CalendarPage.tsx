"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, useCallback } from "react";
import { buildMonthGrid, MONTH_LABELS, WEEKDAY_LABELS } from "@/lib/calendar/grid";
import { utcToZonedDateStr, utcToZonedTimeStr } from "@/lib/telegram/timezone";
import { DayPanelModal } from "./DayPanelModal";
import type { ScheduledPostWithQuestion } from "./types";

const STATUS_DOT: Record<string, string> = {
  scheduled: "bg-gray-400",
  publishing: "bg-blue-500",
  published: "bg-green-500",
  failed: "bg-red-500",
};

interface Settings {
  dailyTime: string;
  timezone: string;
  channel: string | null;
  postsPerDay: number;
}

export function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getUTCFullYear());
  const [month, setMonth] = useState(today.getUTCMonth() + 1);
  const [posts, setPosts] = useState<ScheduledPostWithQuestion[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [openDate, setOpenDate] = useState<string | null>(null);

  const weeks = useMemo(() => buildMonthGrid(year, month), [year, month]);

  const refresh = useCallback(() => {
    const from = new Date(Date.UTC(year, month - 2, 25)).toISOString();
    const to = new Date(Date.UTC(year, month, 5)).toISOString();
    fetch(`/api/schedule?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((data) => setPosts(data.posts ?? []));
  }, [year, month]);

  useEffect(() => {
    fetch("/api/telegram/settings")
      .then((r) => r.json())
      .then((data) => setSettings(data.settings));
  }, []);

  useEffect(refresh, [refresh]);

  const postsByDate = useMemo(() => {
    const map = new Map<string, ScheduledPostWithQuestion[]>();
    if (!posts || !settings) return map;
    for (const p of posts) {
      const key = utcToZonedDateStr(new Date(p.scheduled_at), p.timezone);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [posts, settings]);

  function changeMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setMonth(m);
    setYear(y);
  }

  const todayStr = utcToZonedDateStr(new Date(), settings?.timezone ?? "UTC");

  return (
    <div className="mx-auto w-full min-w-0 max-w-4xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src="/brand/nclexbase-icon.png" alt="" width={32} height={32} unoptimized />
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-teal">NCLEXBase</p>
            <h1 className="text-xl font-bold text-brand-dark">Telegram Calendar</h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/" className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-brand-dark hover:bg-gray-50">
            &larr; Generator
          </Link>
          <Link href="/questions" className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-brand-dark hover:bg-gray-50">
            Questions
          </Link>
          <Link href="/settings/telegram" className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-brand-dark hover:bg-gray-50">
            Settings
          </Link>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <button type="button" onClick={() => changeMonth(-1)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold hover:bg-gray-50">
          &larr;
        </button>
        <h2 className="text-lg font-bold text-brand-dark">
          {MONTH_LABELS[month - 1]} {year}
        </h2>
        <button type="button" onClick={() => changeMonth(1)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold hover:bg-gray-50">
          &rarr;
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="bg-gray-50 py-2 text-center text-xs font-bold uppercase tracking-wide text-gray-500">
            {d}
          </div>
        ))}
        {weeks.flat().map((cell) => {
          const dayPosts = postsByDate.get(cell.date) ?? [];
          const isToday = cell.date === todayStr;
          const capacity = settings?.postsPerDay ?? 2;
          const freeSlots = Math.max(0, capacity - dayPosts.length);
          return (
            <button
              key={cell.date}
              type="button"
              onClick={() => setOpenDate(cell.date)}
              className={`flex min-h-[86px] flex-col items-start gap-1 bg-white p-2 text-left transition-colors ${cell.inMonth ? "hover:bg-gray-50" : "bg-gray-50/50 text-gray-300"} ${
                isToday ? "ring-2 ring-inset ring-brand-teal" : ""
              }`}
            >
              <span className={`text-xs font-semibold ${cell.inMonth ? "text-brand-dark" : "text-gray-300"}`}>{Number(cell.date.slice(8, 10))}</span>
              {dayPosts.map((p) => (
                // One row per post, in the day's slot order. The time is the same
                // for every post of a day now, so the position number is what
                // distinguishes them at a glance.
                <span key={p.id} className="flex w-full items-center gap-1 truncate rounded bg-gray-50 px-0.5 py-0.5 text-[10px] text-gray-600 sm:px-1">
                  <span className={`hidden h-1.5 w-1.5 flex-none rounded-full sm:block ${STATUS_DOT[p.status] ?? "bg-gray-300"}`} />
                  <span className="truncate tabular-nums">
                    {utcToZonedTimeStr(new Date(p.scheduled_at), p.timezone)} &middot; #{p.slot_index ?? 0}
                  </span>
                </span>
              ))}
              {cell.inMonth && dayPosts.length > 0 && freeSlots > 0 && (
                <span className="w-full truncate rounded border border-dashed border-gray-200 px-1 text-[10px] text-gray-400">
                  +{freeSlots} free
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-400">
          Click any date to choose which questions go out. {settings ? `${settings.postsPerDay} a day at ${settings.dailyTime} (${settings.timezone}).` : ""}
        </p>
      </div>

      {openDate && settings && (
        <DayPanelModal
          dateStr={openDate}
          posts={postsByDate.get(openDate) ?? []}
          dailyTime={settings.dailyTime}
          postsPerDay={settings.postsPerDay}
          timezone={settings.timezone}
          channel={settings.channel}
          onClose={() => setOpenDate(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
