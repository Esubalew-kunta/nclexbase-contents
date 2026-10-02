"use client";

import { useMemo, useState } from "react";
import { TEMPLATES } from "@/lib/slides/types";
import type { BankQuestion } from "./types";

interface EditableQuestion {
  id?: string | number;
  type?: string;
  category?: string;
  instructions?: string;
  question: string;
  options?: { label: string; text: string }[];
  correctAnswer?: string | string[];
  explanation?: string;
  optionRationales?: Record<string, string>;
  keyPoint?: string;
  notes?: string;
  actionsToTake?: { options: { label: string; text: string }[]; correctAnswer: string | string[] };
  conditionMostLikely?: { options: { label: string; text: string }[]; correctAnswer: string | string[] };
  parametersToMonitor?: { options: { label: string; text: string }[]; correctAnswer: string | string[] };
}

/** Rebuilt from the stored row so the editor shows the *import* shape (what the
 * admin's JSON looked like), not the internal column names. */
function rowToEditable(row: BankQuestion): EditableQuestion {
  const isBowtie = row.format === "bowtie" && row.bowtie;
  return {
    id: row.external_id ?? undefined,
    type: row.type,
    category: row.category ?? undefined,
    instructions: row.instructions ?? undefined,
    question: row.question,
    ...(isBowtie
      ? {
          actionsToTake: { options: row.bowtie!.actionsToTake.options, correctAnswer: row.bowtie!.actionsToTake.correctAnswers },
          conditionMostLikely: { options: row.bowtie!.conditionMostLikely.options, correctAnswer: row.bowtie!.conditionMostLikely.correctAnswers },
          parametersToMonitor: { options: row.bowtie!.parametersToMonitor.options, correctAnswer: row.bowtie!.parametersToMonitor.correctAnswers },
        }
      : {
          options: row.options,
          correctAnswer: row.correct_answers,
          optionRationales: row.option_rationales,
        }),
    explanation: row.explanation ?? undefined,
    keyPoint: row.key_point ?? undefined,
    notes: row.notes ?? undefined,
  };
}

export function EditQuestionModal({ question, onClose, onSaved }: { question: BankQuestion; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState(() => JSON.stringify(rowToEditable(question), null, 2));
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // Structural syntax check while typing, so a typo is caught before the round
  // trip. Full semantic validation happens server-side on save.
  const jsonError = useMemo(() => {
    if (!text.trim()) return null;
    try {
      JSON.parse(text);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Invalid JSON";
    }
  }, [text]);

  async function save() {
    setBusy(true);
    setError(null);
    setIssues([]);
    try {
      const parsed = JSON.parse(text);
      const res = await fetch(`/api/questions/${question.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: parsed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Save failed (${res.status})`);
        setIssues((data.issues ?? []).map((i: { message: string }) => i.message));
        return;
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-dark">Edit question</h2>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-gray-500 hover:text-gray-700">
            Close
          </button>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className="min-h-80 flex-1 resize-y rounded-lg border border-gray-200 p-3 font-mono text-xs leading-relaxed outline-none focus:border-brand-teal"
        />

        {jsonError && <p className="mt-2 text-xs text-red-600">Invalid JSON: {jsonError}</p>}

        {error && (
          <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
            <p className="font-semibold">{error}</p>
            {issues.length > 0 && (
              <ul className="mt-1 list-disc pl-4">
                {issues.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <p className="mt-3 text-xs text-gray-500">
          Saved edits are validated against the same rules as an import — a question that would not survive importing is
          rejected here too. Re-render the image afterwards if the text changed.
        </p>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-gray-400">Templates: {TEMPLATES.map((t) => t.name).join(" · ")}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy || Boolean(jsonError) || !text.trim()}
              className="rounded-lg bg-brand-teal px-5 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
