"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CATEGORY_LABELS } from "@/lib/content/types";

interface Assignment {
  postId: string;
  status: string;
  dateStr: string;
  timeStr: string;
  timezone: string;
  questionId: string;
  question: string;
  category: string | null;
  type: string;
  format: string;
  canPostToTelegram: boolean;
  reason: string | null;
}

interface PoolQuestion {
  id: string;
  question: string;
  type: string;
  format: string;
  category: string | null;
  /** Only on allPostable: true when the question already holds another slot. */
  assigned?: boolean;
  reason?: string;
}

interface BoardData {
  postTimes: string[];
  timezone: string;
  autoSchedule: boolean;
  enabled: boolean;
  assignments: Assignment[];
  unassigned: PoolQuestion[];
  allPostable: PoolQuestion[];
  notPostable: PoolQuestion[];
}

const STATUS_STYLE: Record<string, string> = {
  scheduled: "bg-gray-100 text-gray-700",
  publishing: "bg-blue-100 text-blue-800",
  published: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

export function ScheduleBoardPage() {
  const [data, setData] = useState<BoardData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  /** The post whose question is being swapped, and the open picker. */
  const [replacing, setReplacing] = useState<Assignment | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/schedule/board?days=60");
    if (!res.ok) {
      setNotice({ kind: "err", text: "Could not load the schedule." });
      return;
    }
    setData(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function autoFill() {
    setBusy("auto");
    setNotice(null);
    try {
      const res = await fetch("/api/schedule/auto", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Auto-fill failed");
      const placed = d.scheduled.length;
      const skipped = d.skipped.length;
      setNotice({
        kind: "ok",
        text:
          placed > 0
            ? `Placed ${placed} question${placed > 1 ? "s" : ""} onto the calendar.` +
              (skipped > 0 ? ` ${skipped} could not be posted (see the list below).` : "")
            : skipped > 0
              ? `Nothing to place — all ${skipped} remaining question${skipped > 1 ? "s" : ""} cannot be posted to Telegram.`
              : "Nothing to place — every eligible question already has a slot.",
      });
      await load();
    } catch (e) {
      setNotice({ kind: "err", text: e instanceof Error ? e.message : "Auto-fill failed" });
    } finally {
      setBusy(null);
    }
  }

  async function act(postId: string, body: Record<string, unknown>, label: string) {
    setBusy(postId);
    setNotice(null);
    try {
      const res = await fetch(`/api/schedule/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `${label} failed`);
      setNotice({ kind: "ok", text: `${label} done.` });
      await load();
    } catch (e) {
      setNotice({ kind: "err", text: e instanceof Error ? e.message : `${label} failed` });
    } finally {
      setBusy(null);
    }
  }

  /** Moves a post to the next free slot — the common "just push it later" case,
   * without making the admin pick a date and time by hand. */
  async function pushToNextSlot(a: Assignment) {
    setBusy(a.postId);
    setNotice(null);
    try {
      const res = await fetch(`/api/schedule/next-available?after=${a.dateStr}`);
      const d = await res.json();
      if (!d.slot) throw new Error("No free slot left in the next year");
      await act(a.postId, { action: "reschedule", dateStr: d.slot.dateStr, timeStr: d.slot.timeStr, timezone: d.timezone ?? a.timezone }, "Moved to the next free slot");
    } catch (e) {
      setNotice({ kind: "err", text: e instanceof Error ? e.message : "Could not move the post" });
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return (
      <div className="mx-auto w-full min-w-0 max-w-4xl px-4 py-10">
        <p className="text-sm text-gray-400">Loading the schedule…</p>
      </div>
    );
  }

  // The question already in the slot being edited is not a candidate for
  // replacing itself.
  const replacementOptions = (data.allPostable ?? data.unassigned).filter((q) => q.id !== replacing?.questionId);

  return (
    <div className="mx-auto w-full min-w-0 max-w-4xl px-4 py-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Image src="/brand/nclexbase-icon.png" alt="" width={32} height={32} unoptimized />
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-teal">NCLEXBase</p>
            <h1 className="text-xl font-bold text-brand-dark">Telegram Schedule</h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/calendar" className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-brand-dark hover:bg-gray-50">
            Calendar
          </Link>
          <Link href="/questions" className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-brand-dark hover:bg-gray-50">
            Questions
          </Link>
          <Link href="/" className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-brand-dark hover:bg-gray-50">
            Generator
          </Link>
        </div>
      </div>

      <div className="mb-5 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <p className="font-semibold text-brand-dark">
              {data.postTimes.length} post{data.postTimes.length > 1 ? "s" : ""} a day at {data.postTimes.join(" and ")}
            </p>
            <p className="text-xs text-gray-500">
              Times shown in {data.timezone}. Auto-assign is {data.autoSchedule ? "on" : "off"}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={autoFill}
              disabled={busy === "auto"}
              className="rounded-lg bg-brand-teal px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-40"
            >
              {busy === "auto" ? "Filling…" : "Auto-fill calendar"}
            </button>
            <Link href="/settings/telegram" className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-gray-50">
              Change times
            </Link>
          </div>
        </div>
      </div>

      {notice && (
        <div className={`mb-4 rounded-lg px-4 py-3 text-sm ${notice.kind === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{notice.text}</div>
      )}

      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">Scheduled ({data.assignments.length})</h2>
      {data.assignments.length === 0 ? (
        <p className="mb-6 rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
          Nothing scheduled. Add questions to the bank, then press “Auto-fill calendar”.
        </p>
      ) : (
        <ul className="mb-8 flex flex-col gap-3">
          {data.assignments.map((a) => (
            <li key={a.postId} className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-brand-dark px-2 py-0.5 text-xs font-bold text-white">
                      {a.dateStr} &middot; {a.timeStr}
                    </span>
                    <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[a.status] ?? "bg-gray-100 text-gray-700"}`}>{a.status}</span>
                    <span className="rounded-md bg-brand-teal/10 px-2 py-0.5 text-xs font-bold text-brand-teal">{CATEGORY_LABELS[a.type] ?? a.type}</span>
                  </div>
                  <p className="line-clamp-2 text-sm leading-relaxed text-gray-800">{a.question}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => pushToNextSlot(a)} disabled={busy === a.postId} className="rounded-lg border border-gray-200 px-3 py-2.5 text-xs font-semibold text-brand-dark hover:bg-gray-50 disabled:opacity-40">
                  Next free slot
                </button>
                <button type="button" onClick={() => setReplacing(a)} disabled={busy === a.postId} className="rounded-lg border border-gray-200 px-3 py-2.5 text-xs font-semibold text-brand-dark hover:bg-gray-50 disabled:opacity-40">
                  Replace question
                </button>
                {a.status === "failed" && (
                  <button type="button" onClick={() => act(a.postId, { action: "retry" }, "Retry queued")} disabled={busy === a.postId} className="rounded-lg border border-gray-200 px-3 py-2.5 text-xs font-semibold text-brand-dark hover:bg-gray-50 disabled:opacity-40">
                    Retry
                  </button>
                )}
                <button type="button" onClick={() => act(a.postId, { action: "cancel" }, "Removed from the calendar")} disabled={busy === a.postId} className="rounded-lg border border-red-200 px-3 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40">
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">Waiting for a slot ({data.unassigned.length})</h2>
      {data.unassigned.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">Every eligible question has a slot.</p>
      ) : (
        <ul className="mb-8 flex flex-col gap-2">
          {data.unassigned.map((q) => (
            <li key={q.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-brand-teal/10 px-2 py-0.5 text-xs font-bold text-brand-teal">{CATEGORY_LABELS[q.type] ?? q.type}</span>
                <p className="line-clamp-1 min-w-0 flex-1 text-sm text-gray-800">{q.question}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data.notPostable.length > 0 && (
        <>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">Never posted to Telegram ({data.notPostable.length})</h2>
          <p className="mb-2 text-xs text-gray-500">These stay in the bank for the image export, but Telegram cannot represent them accurately.</p>
          <ul className="flex flex-col gap-2">
            {data.notPostable.map((q) => (
              <li key={q.id} className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-amber-200/60 px-2 py-0.5 text-xs font-bold text-amber-900">{CATEGORY_LABELS[q.type] ?? q.type}</span>
                  <p className="line-clamp-1 min-w-0 flex-1 text-sm text-amber-900">{q.question}</p>
                </div>
                <p className="mt-1 text-xs text-amber-700">{q.reason}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      {replacing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl bg-white p-5 sm:rounded-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-brand-dark">Replace the question</h2>
                <p className="text-xs text-gray-500">
                  Keeps the slot: {replacing.dateStr} at {replacing.timeStr}
                </p>
              </div>
              <button type="button" onClick={() => setReplacing(null)} className="text-sm font-semibold text-gray-500">
                Close
              </button>
            </div>
            <ul className="-mx-1 flex-1 overflow-y-auto px-1">
              {replacementOptions.length === 0 && <li className="py-4 text-center text-sm text-gray-400">No other eligible questions.</li>}
              {replacementOptions.map((q) => (
                <li key={q.id}>
                  <button
                    type="button"
                    onClick={async () => {
                      const a = replacing;
                      setReplacing(null);
                      await act(a.postId, { action: "replaceQuestion", contentId: q.id }, "Question replaced");
                    }}
                    className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-gray-50"
                  >
                    <span className="rounded-md bg-brand-teal/10 px-2 py-0.5 text-xs font-bold text-brand-teal">{CATEGORY_LABELS[q.type] ?? q.type}</span>
                    {/* Swapping in a question that already has a slot elsewhere
                        would post it twice, so it is called out rather than
                        silently allowed. */}
                    {q.assigned && <span className="ml-1.5 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">already scheduled elsewhere</span>}
                    <p className="mt-1 line-clamp-2 text-sm text-gray-800">{q.question}</p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
