"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CATEGORY_LABELS, type NormalizedQuestion } from "@/lib/content/types";
import { BANK_FORMAT_LABELS, type BankFormat } from "@/lib/supabase/questions";
import { downloadBlob } from "@/lib/download";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EditQuestionModal } from "./EditQuestionModal";
import type { BankQuestion, BankFilter } from "./types";
import { utcToZonedDateStr, utcToZonedTimeStr } from "@/lib/telegram/timezone";

/** Short enough for a confirmation dialog without the question's full text
 * burying the "are you sure" under three paragraphs. */
function truncateQuestion(text: string): string {
  return text.length > 70 ? `${text.slice(0, 70)}…` : text;
}

type Filter = BankFilter;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "single", label: BANK_FORMAT_LABELS.single },
  { value: "multiple", label: BANK_FORMAT_LABELS.multiple },
  { value: "bowtie", label: BANK_FORMAT_LABELS.bowtie },
];

/** Questions are boxed by the day their image was generated, so a day's output
 *  reads as one batch. A question that has never been rendered has no such day,
 *  so it goes in its own box at the top rather than being filed under a date
 *  that would be a guess. */
const NOT_GENERATED = "not-generated";

interface DayGroup {
  key: string;
  label: string;
  questions: BankQuestion[];
}

/** "20 Oct 2026", or "Today"/"Yesterday" for the two days that have a name the
 *  admin reads faster than a date. */
function dayLabel(dateStr: string, todayStr: string, timeZone: string): string {
  if (dateStr === todayStr) return "Today";
  if (dateStr === utcToZonedDateStr(new Date(Date.now() - 86400000), timeZone)) return "Yesterday";
  const [year, month, day] = dateStr.split("-").map(Number);
  // Formatted from a UTC-anchored date so the label can never slide a day in
  // the browser's own timezone, which is not the one we grouped by.
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Groups by generation day, newest day first, with the un-rendered questions
 *  pinned to the top — they are the ones that still need an action. Order
 *  within a day is left exactly as the server sent it. */
function groupByGeneratedDay(questions: BankQuestion[], timeZone: string, todayStr: string): DayGroup[] {
  const byDay = new Map<string, BankQuestion[]>();
  for (const q of questions) {
    const key = q.slide_rendered_at ? utcToZonedDateStr(new Date(q.slide_rendered_at), timeZone) : NOT_GENERATED;
    const bucket = byDay.get(key);
    if (bucket) bucket.push(q);
    else byDay.set(key, [q]);
  }

  const dated = [...byDay.keys()]
    .filter((key) => key !== NOT_GENERATED)
    .sort()
    .reverse()
    .map((key) => ({ key, label: dayLabel(key, todayStr, timeZone), questions: byDay.get(key)! }));

  const pending = byDay.get(NOT_GENERATED);
  return pending ? [{ key: NOT_GENERATED, label: "Not generated yet", questions: pending }, ...dated] : dated;
}

const STATUS_PILL: Record<string, { label: string; className: string }> = {
  none: { label: "No image yet", className: "bg-gray-100 text-gray-600" },
  queued: { label: "Queued", className: "bg-amber-100 text-amber-800" },
  rendering: { label: "Rendering…", className: "bg-blue-100 text-blue-800" },
  ready: { label: "Image ready", className: "bg-green-100 text-green-800" },
  failed: { label: "Render failed", className: "bg-red-100 text-red-800" },
};

export function QuestionBankPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [questions, setQuestions] = useState<BankQuestion[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [editing, setEditing] = useState<BankQuestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmTarget, setConfirmTarget] = useState<{ kind: "single"; question: BankQuestion } | { kind: "bulk"; ids: string[] } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Debounce so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("format", filter);
    if (debounced) params.set("search", debounced);
    const res = await fetch(`/api/questions?${params}`);
    if (!res.ok) {
      setError("Could not load the question bank.");
      return;
    }
    const data = await res.json();
    setQuestions(data.questions ?? []);
  }, [filter, debounced]);

  useEffect(() => {
    load();
  }, [load]);

  // A selection tied to rows that just scrolled out of view under a new
  // filter is confusing — easier to start clean than to reconcile it. Cleared
  // from the handlers that change `filter`/`search` below, not reactively
  // from an effect watching them.
  function changeFilter(next: Filter) {
    setFilter(next);
    setSelected(new Set());
  }

  function changeSearch(next: string) {
    setSearch(next);
    setSelected(new Set());
  }

  // Tab counts come from a separate unfiltered fetch, so they stay stable while
  // the admin narrows the list rather than counting only what's on screen.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/questions");
      if (!res.ok) return;
      const data = await res.json();
      if (cancelled) return;
      const tally: Record<string, number> = { all: 0, single: 0, multiple: 0, bowtie: 0 };
      for (const q of data.questions ?? []) {
        tally.all++;
        const f = q.format as BankFormat;
        if (tally[f] !== undefined) tally[f]++;
      }
      setCounts(tally);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const needsSlides = useMemo(() => (questions ?? []).filter((q) => q.slide_status !== "ready"), [questions]);

  // The configured timezone decides which calendar day a render falls on, the
  // same way the calendar and dashboard resolve it — never the browser's.
  const [timeZone, setTimeZone] = useState("UTC");
  useEffect(() => {
    fetch("/api/telegram/settings")
      .then((r) => r.json())
      .then((data) => {
        if (typeof data?.settings?.timezone === "string") setTimeZone(data.settings.timezone);
      })
      // Display-only: a settings read that fails leaves the boxes on UTC rather
      // than taking the whole bank down with it.
      .catch(() => {});
  }, []);

  const dayGroups = useMemo(
    () => groupByGeneratedDay(questions ?? [], timeZone, utcToZonedDateStr(new Date(), timeZone)),
    [questions, timeZone],
  );

  async function generate(id: string, templateId?: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/questions/${id}/slides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(templateId ? { templateId } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Render failed (${res.status})`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Render failed");
      await load(); // the failure is recorded on the row, so re-read it
    } finally {
      setBusyId(null);
    }
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!questions || questions.length === 0) return;
    setSelected((prev) => {
      const allVisible = questions.map((q) => q.id);
      const everyVisibleSelected = allVisible.every((id) => prev.has(id));
      return everyVisibleSelected ? new Set() : new Set(allVisible);
    });
  }

  /** Runs after the confirm dialog's own "Delete" is pressed — the dialog
   * itself never deletes anything, it only decides whether this runs. */
  async function performDelete(ids: string[]) {
    setConfirmBusy(true);
    setError(null);
    let failures = 0;
    for (const id of ids) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await fetch(`/api/questions/${id}`, { method: "DELETE" });
        // eslint-disable-next-line no-await-in-loop
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Delete failed (${res.status})`);
      } catch {
        failures++;
      }
    }
    setConfirmBusy(false);
    setConfirmTarget(null);
    setSelected(new Set());
    if (failures > 0) setError(`${failures} of ${ids.length} question${ids.length > 1 ? "s" : ""} could not be deleted.`);
    await load();
  }

  /** Renders every question still missing an image, one at a time. Sequential
   * on purpose: each render drives a real Chromium, and firing them in parallel
   * would open several browsers at once and starve the server. */
  async function generateAllMissing() {
    setBulkBusy(true);
    setError(null);
    const targets = needsSlides;
    for (const q of targets) {
      // eslint-disable-next-line no-await-in-loop
      await generate(q.id);
    }
    setBulkBusy(false);
  }

  async function downloadZip(question: BankQuestion) {
    setBusyId(question.id);
    setError(null);
    try {
      const res = await fetch("/api/export/zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: [toNormalized(question)], templateId: question.template_id ?? "modern-study" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      downloadBlob(blob, `question-${question.external_id ?? question.id.slice(0, 8)}.zip`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src="/brand/nclexbase-icon.png" alt="" width={32} height={32} unoptimized />
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-teal">NCLEXBase</p>
            <h1 className="text-xl font-bold text-brand-dark">Question Bank</h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/" className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-brand-dark hover:bg-gray-50">
            &larr; Generator
          </Link>
          <Link href="/calendar" className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-brand-dark hover:bg-gray-50">
            Calendar
          </Link>
          <Link href="/dashboard" className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-brand-dark hover:bg-gray-50">
            Dashboard
          </Link>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg bg-gray-100 p-0.5 text-sm font-semibold">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => changeFilter(f.value)}
              className={`rounded-md px-3 py-1.5 ${filter === f.value ? "bg-white text-brand-dark shadow" : "text-gray-500"}`}
            >
              {f.label}
              {counts[f.value] !== undefined && <span className="ml-1.5 text-xs text-gray-400">{counts[f.value]}</span>}
            </button>
          ))}
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => changeSearch(e.target.value)}
          placeholder="Search questions…"
          className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-brand-teal"
        />

        <button
          type="button"
          onClick={generateAllMissing}
          disabled={bulkBusy || needsSlides.length === 0}
          className="rounded-lg bg-brand-teal px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-40"
        >
          {bulkBusy ? "Generating…" : `Generate images${needsSlides.length > 0 ? ` (${needsSlides.length})` : ""}`}
        </button>
      </div>

      {questions !== null && questions.length > 0 && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-500">
            <input
              type="checkbox"
              checked={questions.length > 0 && questions.every((q) => selected.has(q.id))}
              onChange={toggleSelectAll}
              className="h-4 w-4 accent-brand-teal"
            />
            Select all
          </label>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => setConfirmTarget({ kind: "bulk", ids: [...selected] })}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
            >
              Delete selected ({selected.size})
            </button>
          )}
        </div>
      )}

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      {questions === null ? (
        <p className="text-sm text-gray-400">Loading the bank…</p>
      ) : questions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-sm text-gray-400">
          {debounced ? (
            <>No questions match “{debounced}”.</>
          ) : (
            <>
              Nothing here yet. Import questions from the <Link href="/" className="font-semibold text-brand-teal">generator</Link> to fill the bank.
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {dayGroups.map((group) => (
            <section key={group.key} className="rounded-2xl border border-gray-200 bg-gray-50/60 p-3 sm:p-4">
              <div className="mb-3 flex flex-wrap items-baseline gap-2">
                <h2 className="text-sm font-bold text-brand-dark">{group.label}</h2>
                <span className="text-xs text-gray-500">{group.questions.length} question{group.questions.length === 1 ? "" : "s"}</span>
              </div>
              <ul className="flex flex-col gap-4">
          {group.questions.map((q) => {
            const pill = STATUS_PILL[q.slide_status] ?? STATUS_PILL.none;
            const busy = busyId === q.id;
            return (
              <li key={q.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-col gap-4 sm:flex-row">
                  <input
                    type="checkbox"
                    checked={selected.has(q.id)}
                    onChange={() => toggleSelected(q.id)}
                    aria-label="Select question"
                    className="mt-1 h-4 w-4 flex-none accent-brand-teal"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-brand-teal/10 px-2 py-0.5 text-xs font-bold text-brand-teal">
                        {CATEGORY_LABELS[q.type] ?? q.type}
                      </span>
                      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${pill.className}`}>{pill.label}</span>
                      {q.external_id && <span className="text-xs text-gray-400">id: {q.external_id}</span>}
                      {q.slide_rendered_at && (
                        <span className="text-xs text-gray-400">generated {utcToZonedTimeStr(new Date(q.slide_rendered_at), timeZone)}</span>
                      )}
                    </div>
                    <p className="line-clamp-3 text-sm leading-relaxed text-gray-800">{q.question}</p>
                    {q.slide_error && <p className="mt-2 text-xs text-red-600">{q.slide_error}</p>}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => generate(q.id)}
                        disabled={busy || bulkBusy}
                        className="rounded-lg border border-gray-200 px-3 py-2.5 text-xs font-semibold text-brand-dark hover:bg-gray-50 disabled:opacity-40"
                      >
                        {busy ? "Working…" : q.slide_status === "ready" ? "Re-render" : "Generate image"}
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadZip(q)}
                        disabled={busy}
                        className="rounded-lg border border-gray-200 px-3 py-2.5 text-xs font-semibold text-brand-dark hover:bg-gray-50 disabled:opacity-40"
                      >
                        Download ZIP
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(q)}
                        disabled={busy}
                        className="rounded-lg border border-gray-200 px-3 py-2.5 text-xs font-semibold text-brand-dark hover:bg-gray-50 disabled:opacity-40"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmTarget({ kind: "single", question: q })}
                        disabled={busy}
                        className="rounded-lg border border-red-200 px-3 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-none gap-2 sm:w-64">
                    {q.slideUrls && q.slideUrls.length > 0 ? (
                      q.slideUrls.map((url, i) =>
                        url ? (
                          <a key={i} href={url} target="_blank" rel="noreferrer" title={`Slide ${i + 1}`} className="block">
                            {/* Signed Supabase Storage URLs are outside next/image's optimizer config, so this is a plain img. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={`Slide ${i + 1}`} className="h-40 w-auto rounded-lg border border-gray-200" />
                          </a>
                        ) : null,
                      )
                    ) : (
                      <div className="flex h-40 w-40 items-center justify-center rounded-lg border border-dashed border-gray-300 text-center text-xs text-gray-400">
                        No slides yet
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <EditQuestionModal
          question={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}

      {confirmTarget && (
        <ConfirmDialog
          title={confirmTarget.kind === "bulk" ? `Delete ${confirmTarget.ids.length} questions?` : "Delete this question?"}
          message={
            confirmTarget.kind === "bulk" ? (
              <>Their stored images will be removed too, and any Telegram posts scheduled from them will be deleted.</>
            ) : (
              <>
                <span className="block font-medium text-gray-800">{truncateQuestion(confirmTarget.question.question)}</span>
                <span className="mt-1 block">Its stored images will be removed too, and any Telegram post scheduled from it will be deleted.</span>
              </>
            )
          }
          confirmLabel="Delete"
          danger
          busy={confirmBusy}
          onCancel={() => setConfirmTarget(null)}
          onConfirm={() => performDelete(confirmTarget.kind === "bulk" ? confirmTarget.ids : [confirmTarget.question.id])}
        />
      )}
    </div>
  );
}

/** Rebuilds a NormalizedQuestion from a stored row so the existing ZIP exporter
 * can be reused verbatim rather than reimplementing slide export. */
function toNormalized(row: BankQuestion): NormalizedQuestion {
  return {
    id: row.external_id ?? row.id,
    index: 1,
    type: row.type,
    category: row.category,
    instructions: row.instructions,
    question: row.question,
    options: row.options ?? [],
    correctAnswers: row.correct_answers ?? [],
    correctAnswerText: row.correct_answer_text,
    explanation: row.explanation,
    optionRationales: row.option_rationales ?? {},
    keyPoint: row.key_point,
    notes: row.notes,
    format: row.format as NormalizedQuestion["format"],
    bowtie: row.bowtie ?? null,
  };
}
