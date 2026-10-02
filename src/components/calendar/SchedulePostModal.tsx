"use client";

import { useEffect, useState } from "react";
import type { NclexQuestionRow } from "@/lib/supabase/schema-types";
import { rowToNormalizedQuestion } from "@/lib/supabase/questions";
import { checkTelegramCompatibility } from "@/lib/telegram/compat";

export function SchedulePostModal({
  dateStr,
  defaultTime,
  defaultTimezone,
  onClose,
  onScheduled,
}: {
  dateStr: string;
  defaultTime: string;
  defaultTimezone: string;
  onClose: () => void;
  onScheduled: () => void;
}) {
  const [questions, setQuestions] = useState<NclexQuestionRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [time, setTime] = useState(defaultTime);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ existing: unknown } | null>(null);

  useEffect(() => {
    fetch("/api/questions?unscheduled=1")
      .then((r) => r.json())
      .then((data) => setQuestions(data.questions ?? []));
  }, []);

  const selected = questions?.find((q) => q.id === selectedId) ?? null;
  const compat = selected ? checkTelegramCompatibility(rowToNormalizedQuestion(selected)) : null;

  async function schedule(replaceConflict = false) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: rowToNormalizedQuestion(selected),
          contentId: selected.id,
          dateStr,
          timeStr: time,
          timezone: defaultTimezone,
          replaceConflict,
        }),
      });
      if (res.status === 409) {
        const body = await res.json();
        setConflict(body);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to schedule");
      }
      onScheduled();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to schedule");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-bold text-brand-dark">Schedule a question</h2>
          <button type="button" onClick={onClose} className="text-xl leading-none text-gray-400 hover:text-gray-600">
            &times;
          </button>
        </div>
        <p className="mb-4 text-sm text-gray-500">{dateStr} — open date</p>

        {conflict ? (
          <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
            <p className="mb-3 font-semibold">{dateStr} already has a scheduled post.</p>
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => schedule(true)} className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white">
                Replace the existing post
              </button>
              <button type="button" onClick={() => setConflict(null)} className="rounded-lg border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-900">
                Choose a different date
              </button>
            </div>
          </div>
        ) : (
          <>
            {!questions ? (
              <p className="text-sm text-gray-400">Loading unposted questions…</p>
            ) : questions.length === 0 ? (
              <p className="text-sm text-gray-400">No unposted questions available — import more JSON on the generator page first.</p>
            ) : (
              <div className="mb-4 flex max-h-64 flex-col gap-1.5 overflow-y-auto">
                {questions.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setSelectedId(q.id)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm ${selectedId === q.id ? "border-brand-teal bg-brand-teal/5" : "border-gray-200 hover:bg-gray-50"}`}
                  >
                    <span className="font-semibold text-brand-dark">{q.category ?? q.type}</span>
                    <span className="ml-2 text-gray-500">{q.question.slice(0, 60)}{q.question.length > 60 ? "…" : ""}</span>
                  </button>
                ))}
              </div>
            )}

            {selected && compat && !compat.compatible && (
              <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Can&apos;t schedule: {compat.reason}</p>
            )}

            <label className="mb-1 block text-xs font-bold text-brand-dark">Publishing time ({defaultTimezone})</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mb-4 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />

            {error && <p className="mb-3 text-xs text-red-500">{error}</p>}

            <button
              type="button"
              disabled={!selected || busy || (compat ? !compat.compatible : false)}
              onClick={() => schedule(false)}
              className="w-full rounded-lg bg-brand-teal py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Scheduling…" : "Confirm Schedule"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
