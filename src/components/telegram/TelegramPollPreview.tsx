"use client";

import { useMemo, useState } from "react";
import type { NormalizedQuestion } from "@/lib/content/types";
import { checkTelegramCompatibility } from "@/lib/telegram/compat";
import { buildQuizExplanation, MAX_LAMP_LEN } from "@/lib/telegram/message";

function Avatar() {
  return <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand-teal text-sm font-bold text-white">N</div>;
}

export function TelegramPollPreview({ question }: { question: NormalizedQuestion }) {
  const [showResults, setShowResults] = useState(false);
  const [showLamp, setShowLamp] = useState(true);
  /** Which options the simulated viewer picked, so the admin can sanity-check
   *  that a multi-answer question actually grades the way it should. */
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const compat = checkTelegramCompatibility(question);

  const correctIds = useMemo(() => new Set(compat.correctOptionIds ?? []), [compat.correctOptionIds]);
  const { lampText, fullLength, truncated } = useMemo(() => buildQuizExplanation(question), [question]);

  if (!compat.compatible) {
    return (
      <div className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900">
        <p className="mb-1 font-semibold">Telegram scheduling unavailable</p>
        <p>This question type cannot currently be represented accurately as a Telegram quiz poll: {compat.reason}</p>
        <p className="mt-2 text-amber-700">The NCLEXBase image export remains available for this question.</p>
      </div>
    );
  }

  const correctCount = correctIds.size;
  // Derived from the real data, exactly as the publisher does it: more than one
  // correct option means the poll must accept multiple answers.
  const isMultiple = correctCount > 1;
  const graded = showResults && picked.size > 0;
  const gotRight = graded && picked.size === correctCount && [...picked].every((i) => correctIds.has(i));

  function toggle(idx: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (!isMultiple) {
        // Single-answer quiz: picking one replaces the previous choice.
        return next.has(idx) ? new Set<number>() : new Set([idx]);
      }
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function resetVote() {
    setShowResults(false);
    setShowLamp(true);
    setPicked(new Set());
  }

  function submitVote() {
    if (picked.size === 0) return;
    setShowResults(true);
    setShowLamp(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Telegram Preview</p>
        <div className="flex rounded-full bg-gray-100 p-0.5 text-xs font-semibold">
          <button type="button" onClick={resetVote} className={`rounded-full px-3 py-1 ${!showResults ? "bg-white shadow text-brand-dark" : "text-gray-500"}`}>
            Before vote
          </button>
          <button
            type="button"
            onClick={() => {
              if (picked.size === 0) return;
              setShowResults(true);
            }}
            disabled={picked.size === 0}
            className={`rounded-full px-3 py-1 disabled:opacity-40 ${showResults ? "bg-white shadow text-brand-dark" : "text-gray-500"}`}
          >
            After vote
          </button>
        </div>
      </div>

      {isMultiple && (
        <p className="rounded-lg bg-[#3390ec]/10 px-3 py-2 text-xs font-medium text-[#1c6fb8]">
          Sent with <code className="font-mono">is_multiple: true</code> — viewers tick {correctCount} answers and are graded against all of them.
        </p>
      )}

      <div className="rounded-2xl bg-[#e8ecf0] p-4">
        <div className="flex items-start gap-2.5">
          <Avatar />
          <div className="min-w-0 flex-1">
            <div className="rounded-2xl rounded-tl-sm bg-white p-3.5 shadow-sm">
              <p className="mb-2 text-sm font-semibold text-[#3390ec]">NCLEXBase</p>
              <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">Anonymous Quiz{isMultiple ? " · Choose several" : ""}</p>
              <p className="mb-3 text-[15px] font-semibold leading-snug text-gray-900">{question.question}</p>

              <div className="flex flex-col gap-2">
                {question.options.map((o, i) => {
                  const correct = correctIds.has(i);
                  const chosen = picked.has(i);
                  const pct = showResults ? (correct ? 78 : 14) : 0;
                  return (
                    <button
                      key={o.label}
                      type="button"
                      onClick={() => toggle(i)}
                      className="relative overflow-hidden rounded-xl border border-gray-200 px-3 py-2.5 text-left transition hover:border-[#3390ec]/50"
                    >
                      {showResults && <div className="absolute inset-y-0 left-0 bg-[#3390ec]/10" style={{ width: `${pct}%` }} />}
                      <div className="relative flex items-center gap-2.5">
                        {/* Checkboxes for a select-all-that-apply poll, a radio for
                            a single-answer one — the same distinction Telegram
                            draws, and the reason a SATA preview used to look
                            wrong. */}
                        <span
                          className={`flex h-5 w-5 flex-none items-center justify-center border-2 text-[11px] ${
                            isMultiple ? "rounded-md" : "rounded-full"
                          } ${
                            showResults && correct
                              ? "border-green-500 bg-green-500 text-white"
                              : chosen
                                ? "border-[#3390ec] bg-[#3390ec] text-white"
                                : "border-gray-300 text-transparent"
                          }`}
                        >
                          {showResults && correct ? "✓" : isMultiple ? "✓" : "●"}
                        </span>
                        <span className="text-sm text-gray-800">{o.text}</span>
                        {showResults && <span className="ml-auto flex-none text-xs font-medium text-gray-400">{pct}%</span>}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Mirrors Telegram's own quiz flow: nothing is graded until the
                  viewer commits, and there is no separate "correct" marker on
                  the options before that point. */}
              {!showResults && (
                <button
                  type="button"
                  onClick={submitVote}
                  disabled={picked.size === 0}
                  className="mt-3 w-full rounded-xl bg-[#3390ec] py-2.5 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
                >
                  {picked.size === 0 ? "Vote" : `Vote (${picked.size} selected)`}
                </button>
              )}

              <div className="mt-3 flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  {showResults ? `${picked.size} of ${correctCount} picked · Final results` : picked.size === 0 ? "Pick your answers, then vote" : "Nothing is graded until you vote"}
                </p>
                {showResults && lampText && (
                  <button
                    type="button"
                    onClick={() => setShowLamp((v) => !v)}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-base hover:bg-gray-100"
                    title="Explanation"
                  >
                    💡
                  </button>
                )}
              </div>
              {showResults && showLamp && lampText && (
                <div className="mt-2 rounded-lg bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-900">{lampText}</div>
              )}
            </div>
            <p className="ml-1 mt-1 text-[11px] text-gray-400">Scheduled post</p>
          </div>
        </div>

        {graded && (
          <div className="mt-2 flex items-start gap-2.5">
            <Avatar />
            <div className="min-w-0 flex-1">
              <div
                className={`rounded-2xl rounded-tl-sm p-3.5 text-sm shadow-sm ${
                  gotRight ? "bg-green-50 text-green-900 ring-1 ring-green-200" : "bg-red-50 text-red-900 ring-1 ring-red-200"
                }`}
              >
                <p className="font-bold">{gotRight ? "🎉 Correct! Great job." : picked.size > correctCount ? "Too many answers selected." : "Not quite."}</p>
                <p className="mt-1 leading-relaxed">
                  {gotRight
                    ? `You picked all ${correctCount} correct answer${correctCount > 1 ? "s" : ""}.`
                    : `The correct answer${correctCount > 1 ? "s are" : " is"}: ${question.options
                        .filter((_, i) => correctIds.has(i))
                        .map((o) => o.label)
                        .join(", ")}.`}
                </p>
              </div>
              <p className="ml-1 mt-1 text-[11px] text-gray-400">after voting</p>
            </div>
          </div>
        )}
      </div>

      {/* How much of the explanation survives Telegram's cap, shown before the
          post is scheduled rather than discovered after it is published. */}
      {lampText && (
        <div className="rounded-xl border border-gray-200 bg-white p-3 text-xs">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-bold uppercase tracking-wide text-gray-500">💡 Post-vote explanation</span>
            <span className={`font-semibold tabular-nums ${truncated ? "text-amber-600" : "text-gray-400"}`}>
              {Math.min(fullLength, MAX_LAMP_LEN)} / {MAX_LAMP_LEN}
            </span>
          </div>
          <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-brand-teal" style={{ width: `${Math.min(100, (fullLength / MAX_LAMP_LEN) * 100)}%` }} />
          </div>
          {truncated ? (
            <p className="leading-relaxed text-amber-700">
              Your explanation is {fullLength} characters, so Telegram will show only the first {lampText.length}. The rest is dropped — there is no
              follow-up message. The full text stays on the exported images.
            </p>
          ) : (
            <p className="leading-relaxed text-gray-500">Fits in full. Shown only to people who have voted.</p>
          )}
        </div>
      )}
    </div>
  );
}