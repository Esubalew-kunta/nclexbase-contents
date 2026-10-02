"use client";

import { useState } from "react";
import type { NormalizedQuestion } from "@/lib/content/types";
import { checkTelegramCompatibility } from "@/lib/telegram/compat";

interface Settings {
  daily_time: string;
  timezone: string;
}

type RowResult = { question: NormalizedQuestion; status: "pending" | "scheduled" | "skipped" | "error"; dateStr?: string; message?: string };

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function BatchScheduleModal({ questions, settings, onClose, onDone }: { questions: NormalizedQuestion[]; settings: Settings; onClose: () => void; onDone: () => void }) {
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(settings.daily_time);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<RowResult[] | null>(null);

  const compatible = questions.filter((q) => checkTelegramCompatibility(q).compatible);
  const incompatibleCount = questions.length - compatible.length;

  async function run() {
    setRunning(true);
    const rows: RowResult[] = compatible.map((q) => ({ question: q, status: "pending" }));
    setResults([...rows]);

    let cursor = startDate;
    for (let i = 0; i < compatible.length; i++) {
      const question = compatible[i];
      let dateStr = i === 0 ? startDate : addDays(cursor, 1);
      let attempt = 0;
      for (;;) {
        attempt++;
        try {
          const res = await fetch("/api/schedule", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question, dateStr, timeStr: time, timezone: settings.timezone }),
          });
          if (res.status === 409) {
            if (attempt > 365) throw new Error("no available date found");
            dateStr = addDays(dateStr, 1);
            continue;
          }
          if (!res.ok) {
            const body = await res.json().catch(() => null);
            throw new Error(body?.error ?? `HTTP ${res.status}`);
          }
          rows[i] = { question, status: attempt > 1 ? "skipped" : "scheduled", dateStr };
          cursor = dateStr;
          break;
        } catch (err) {
          rows[i] = { question, status: "error", message: err instanceof Error ? err.message : "Failed" };
          cursor = dateStr;
          break;
        }
      }
      setResults([...rows]);
    }
    setRunning(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-brand-dark">Schedule {questions.length} question{questions.length === 1 ? "" : "s"}</h2>
          <button type="button" onClick={onClose} className="text-xl leading-none text-gray-400 hover:text-gray-600">
            &times;
          </button>
        </div>

        {incompatibleCount > 0 && (
          <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
            {incompatibleCount} of {questions.length} selected question{incompatibleCount === 1 ? " isn't" : "s aren't"} Telegram-compatible and will be skipped here (image export still works for them).
          </p>
        )}

        {!results ? (
          <>
            <label className="mb-1 block text-xs font-bold text-brand-dark">Start date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mb-4 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <label className="mb-1 block text-xs font-bold text-brand-dark">Publishing time ({settings.timezone})</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mb-4 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <p className="mb-4 text-xs text-gray-400">
              Assigns one question per day starting {startDate}, in order. Frequency: every day. If a date is already taken, that question automatically moves to the next open date — nothing gets
              overwritten.
            </p>
            <button type="button" disabled={compatible.length === 0} onClick={run} className="w-full rounded-lg bg-brand-teal py-2.5 text-sm font-bold text-white disabled:opacity-40">
              Schedule {compatible.length} Question{compatible.length === 1 ? "" : "s"}
            </button>
          </>
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-1.5">
              {results.map((r, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm">
                  <span className="truncate text-brand-dark">{r.question.category ?? r.question.type}</span>
                  {r.status === "pending" && <span className="text-xs text-gray-400">…</span>}
                  {r.status === "scheduled" && <span className="text-xs font-semibold text-green-700">{r.dateStr}</span>}
                  {r.status === "skipped" && <span className="text-xs font-semibold text-amber-700">{r.dateStr} (next available)</span>}
                  {r.status === "error" && <span className="text-xs font-semibold text-red-600">{r.message}</span>}
                </div>
              ))}
            </div>
            {!running && (
              <button type="button" onClick={onDone} className="w-full rounded-lg bg-brand-teal py-2.5 text-sm font-bold text-white">
                Done
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
