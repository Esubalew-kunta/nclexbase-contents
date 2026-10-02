"use client";

import type { NormalizedQuestion } from "@/lib/content/types";
import type { ValidationIssue } from "@/lib/content/normalize";

export function QuestionLibrary({
  questions,
  issues,
  activeId,
  selectedIds,
  onSelectActive,
  onToggleSelected,
  onToggleAll,
}: {
  questions: NormalizedQuestion[];
  issues: ValidationIssue[];
  activeId: string | null;
  selectedIds: Set<string>;
  onSelectActive: (id: string) => void;
  onToggleSelected: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
}) {
  const allChecked = questions.length > 0 && questions.every((q) => selectedIds.has(q.id));

  return (
    <div className="flex flex-col gap-3">
      {issues.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          <p className="mb-1 font-semibold">{issues.length} question{issues.length === 1 ? "" : "s"} skipped — fix these in your JSON:</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {issues.map((issue, i) => (
              <li key={i}>
                Question {String(issue.questionIndex).padStart(2, "0")}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {questions.length === 0 ? (
        <p className="text-sm text-gray-500">No questions loaded yet.</p>
      ) : (
        <>
          <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
            <input type="checkbox" checked={allChecked} onChange={(e) => onToggleAll(e.target.checked)} />
            Select all ({questions.length})
          </label>
          <ul className="flex flex-col gap-1">
            {questions.map((q) => (
              <li key={q.id} className={`flex items-center gap-2 rounded-lg border p-2 text-sm ${activeId === q.id ? "border-brand-teal bg-brand-teal/5" : "border-transparent hover:bg-gray-50"}`}>
                <input type="checkbox" checked={selectedIds.has(q.id)} onChange={() => onToggleSelected(q.id)} />
                <button type="button" onClick={() => onSelectActive(q.id)} className="flex-1 truncate text-left">
                  <span className="font-semibold text-brand-dark">Question {String(q.index).padStart(2, "0")}</span>
                  <span className="ml-2 text-gray-500">{q.question.slice(0, 48)}{q.question.length > 48 ? "…" : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
