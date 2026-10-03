"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SCHEDULABLE_TYPES } from "@/lib/supabase/questions";
import { PostDetailsModal } from "./PostDetailsModal";
import type { ScheduledPostWithQuestion } from "./types";

interface PoolQuestion {
  id: string;
  question: string;
  type: string;
  category: string | null;
  slideCount: number;
  /** The day this question already holds a live slot on, or null if it's
   * free. Equal to the panel's own `dateStr` when it's this day's question. */
  assignedDate: string | null;
}

interface Props {
  dateStr: string;
  posts: ScheduledPostWithQuestion[];
  dailyTime: string;
  postsPerDay: number;
  timezone: string;
  /** Only needed for the "View Post in Telegram" link in the per-post panel. */
  channel?: string | null;
  onClose: () => void;
  onChanged: () => void;
}

const TYPE_LABEL: Record<string, string> = {
  priority: "Priority",
  sata: "SATA",
};

function typeLabel(type: string): string {
  return TYPE_LABEL[type] ?? type;
}

function typeTagClass(type: string): string {
  return type === "sata" ? "bg-purple-100 text-purple-700" : "bg-brand-teal/10 text-brand-teal";
}

/** The day panel: which questions are going out, and a pick-from-the-bank list
 *  to change that by ticking boxes.
 *
 *  The interaction is a swap rather than a replace. Ticking a question that
 *  already has a day trades that day with the question currently in this day's
 *  first slot, so neither question ends up on the calendar twice and neither is
 *  lost — the two questions change places. Ticking a question that has no day
 *  gives it a place here (the question it displaces simply returns to the bank).
 *
 *  Only Priority and SATA are listed. Bowtie cannot be represented as a Telegram
 *  poll at all, so offering it in a scheduling picker could only produce a dead
 *  end; it stays available through the question bank and the image export. */
export function DayPanelModal({ dateStr, posts, dailyTime, postsPerDay, timezone, channel, onClose, onChanged }: Props) {
  const [pool, setPool] = useState<PoolQuestion[] | null>(null);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailPost, setDetailPost] = useState<ScheduledPostWithQuestion | null>(null);

  const loadPool = useCallback(() => {
    fetch("/api/schedule/pool")
      .then((r) => r.json())
      .then((data) => setPool(data.postable ?? []))
      .catch(() => setError("Could not load the question bank"));
  }, []);

  useEffect(loadPool, [loadPool]);

  // Which question sits in which of the day's slots, in display order.
  const assignedIds = useMemo(() => posts.map((p) => p.content_id), [posts]);
  const isFull = posts.length >= postsPerDay;
  /** When the day is full there is no free place, so a new tick has to take
   *  over an existing one. Slot 0 is the swap target — stated in the UI rather
   *  than picked silently, because "which of today's two do I replace?" has no
   *  right answer if it isn't told. */
  const swapTarget = posts[0] ?? null;

  const filteredPool = useMemo(() => {
    if (!pool) return [];
    const term = search.trim().toLowerCase();
    const matches = (q: PoolQuestion) => !term || q.question.toLowerCase().includes(term) || (q.category ?? "").toLowerCase().includes(term);
    // A question already committed to a DIFFERENT day has no business in this
    // day's picker — ticking it here would read as "add this" when what
    // actually happens is a swap with whatever this day holds. Only this
    // day's own questions (assignedDate === dateStr) and genuinely free ones
    // (assignedDate === null) are offered.
    const available = pool.filter((q) => q.assignedDate === null || q.assignedDate === dateStr).filter(matches);
    // Anything already on this day floats to the top, so the ticked rows are
    // always visible without scrolling to find them.
    const assigned = available.filter((q) => assignedIds.includes(q.id));
    const rest = available.filter((q) => !assignedIds.includes(q.id));
    return [...assigned, ...rest];
  }, [pool, search, assignedIds, dateStr]);

  /** Every mutation goes through the server so the frozen Telegram payload is
   *  built once, on one code path, with the same builders the preview uses.
   *
   *  Ticking a question when the day is full is a swap, not a replace: the two
   *  questions trade days. Unticking simply frees the day's place. */
  async function toggleTick(poolQuestion: PoolQuestion) {
    setBusyId(poolQuestion.id);
    setError(null);
    try {
      const existing = posts.find((p) => p.content_id === poolQuestion.id);
      if (existing) {
        const res = await fetch(`/api/schedule/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "cancel" }),
        });
        if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not remove that question");
      } else if (isFull && swapTarget) {
        const res = await fetch(`/api/schedule/${swapTarget.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "replaceQuestion", contentId: poolQuestion.id }),
        });
        if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not swap that question");
      } else {
        const res = await fetch("/api/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "place", contentId: poolQuestion.id, dateStr, timeStr: dailyTime, timezone }),
        });
        if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not add that question");
      }
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="mt-8 w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-brand-dark">{dateStr}</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {posts.length} of {postsPerDay} used &middot; all posts go out at {dailyTime} ({timezone})
            </p>
          </div>
          <button type="button" onClick={onClose} className="flex-none rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            Close
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          {error && (
            <p className="mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
              {error}
              <button type="button" onClick={() => setError(null)} className="ml-2 font-bold underline">
                dismiss
              </button>
            </p>
          )}

          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Going out on this day</h3>
          {posts.length === 0 ? (
            <p className="mb-5 rounded-lg border border-dashed border-gray-200 p-3 text-sm text-gray-400">Nothing scheduled. Tick a question below.</p>
          ) : (
            <ul className="mb-5 space-y-2">
              {posts.map((p) => (
                <li key={p.id}>
                  {/* Opens the per-post panel: move it to another day, retry a
                      failure, or cancel it outright. Un-ticking its box below is
                      the quick way to free the day's place; this is the one that
                      also moves the post somewhere else. */}
                  <button
                    type="button"
                    onClick={() => setDetailPost(p)}
                    className="flex w-full items-start gap-3 rounded-xl border border-gray-200 p-3 text-left transition hover:border-brand-teal"
                  >
                    <span className="mt-0.5 flex-none rounded bg-gray-50 px-2 py-0.5 text-[10px] font-bold tabular-nums text-gray-600">#{p.slot_index ?? 0}</span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 block text-sm font-medium text-brand-dark">{p.nclex_questions?.question ?? "(question deleted)"}</span>
                      <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${typeTagClass(p.nclex_questions?.type ?? "")}`}>
                        {typeLabel(p.nclex_questions?.type ?? "unknown")}
                      </span>
                    </span>
                    <span className="mt-0.5 flex-none text-[10px] text-gray-400">{p.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {isFull && (
            <p className="mb-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
              This day is full. Ticking another question <strong>swaps</strong> it with the one in spot 0 — the two questions trade days automatically.
            </p>
          )}

          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">Question bank</h3>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-40 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs"
            />
          </div>

          {!pool ? (
            <p className="text-sm text-gray-400">Loading questions…</p>
          ) : filteredPool.length === 0 ? (
            <p className="text-sm text-gray-400">No Priority or SATA questions match.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filteredPool.map((q) => {
                const checked = assignedIds.includes(q.id);
                const busy = busyId === q.id;
                return (
                  <li key={q.id}>
                    <label className={`flex cursor-pointer items-start gap-3 py-2.5 ${busy ? "opacity-50" : "hover:bg-gray-50"}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={busy}
                        onChange={() => toggleTick(q)}
                        className="mt-1 h-4 w-4 flex-none accent-brand-teal"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 block text-sm text-gray-800">{q.question}</span>
                        <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${typeTagClass(q.type)}`}>{typeLabel(q.type)}</span>
                        {q.slideCount > 0 && <span className="ml-1.5 text-[10px] text-gray-400">{q.slideCount} image{q.slideCount > 1 ? "s" : ""}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-4 text-xs text-gray-400">
            Only {SCHEDULABLE_TYPES.map((t) => typeLabel(t)).join(" and ")} questions can be scheduled here. Bowtie questions are in the{" "}
            <Link href="/questions" className="underline">
              question bank
            </Link>{" "}
            for image export.
          </p>
        </div>
      </div>

      {detailPost && channel && (
        <PostDetailsModal
          post={detailPost}
          channel={channel}
          onClose={() => setDetailPost(null)}
          onChanged={() => {
            setDetailPost(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}