"use client";

import { useMemo, useState } from "react";
import type { NormalizedQuestion } from "@/lib/content/types";
import { checkTelegramCompatibility } from "@/lib/telegram/compat";
import { buildFollowUpMessage, buildQuizExplanation, renderFollowUpPlain } from "@/lib/telegram/message";

function Avatar() {
  return (
    <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand-teal text-sm font-bold text-white">N</div>
  );
}

/** Renders the follow-up body with the same section headers the bot sends, so
 * what the admin approves here is what lands in the channel. Deliberately
 * mirrors the bold/plain split of the HTML the publisher posts. */
function FollowUpBody({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1 text-sm leading-relaxed text-gray-800">
      {lines.map((line, i) => {
        const isHeader = line.endsWith(":") && !line.endsWith("::") && line.length < 40;
        if (line === "") return <div key={i} className="h-1" />;
        return (
          <p key={i} className={isHeader ? "font-bold text-gray-900" : undefined}>
            {isHeader ? line : renderRationaleLine(line)}
          </p>
        );
      })}
    </div>
  );
}

/** Rationale lines look like "B Some text because…". Bold the leading label
 * so it reads the same way the HTML version does. */
function renderRationaleLine(line: string) {
  const m = /^([A-Z])\s+/.exec(line);
  if (!m) return line;
  return (
    <>
      <span className="font-bold text-gray-900">{m[1]}</span> {line.slice(m[0].length)}
    </>
  );
}

export function TelegramPollPreview({ question }: { question: NormalizedQuestion }) {
  const [showResults, setShowResults] = useState(false);
  const [showLamp, setShowLamp] = useState(false);
  /** Which options the simulated viewer picked, so the admin can sanity-check
   * that a multi-answer question actually grades the way it should. */
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const compat = checkTelegramCompatibility(question);

  const correctIds = useMemo(() => new Set(compat.correctOptionIds ?? []), [compat.correctOptionIds]);
  const { lampText } = useMemo(() => buildQuizExplanation(question), [question]);
  const followUp = useMemo(() => buildFollowUpMessage(question), [question]);

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
  // Derived from the real data, exactly as the publisher does it: more than
  // one correct option means the poll must accept multiple answers.
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
    setShowLamp(false);
    setPicked(new Set());
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Telegram Preview</p>
        <div className="flex rounded-full bg-gray-100 p-0.5 text-xs font-semibold">
          <button
            type="button"
            onClick={resetVote}
            className={`rounded-full px-3 py-1 ${!showResults ? "bg-white shadow text-brand-dark" : "text-gray-500"}`}
          >
            Before vote
          </button>
          <button type="button" onClick={() => setShowResults(true)} className={`rounded-full px-3 py-1 ${showResults ? "bg-white shadow text-brand-dark" : "text-gray-500"}`}>
            After vote
          </button>
        </div>
      </div>

      {isMultiple && (
        <p className="rounded-lg bg-[#3390ec]/10 px-3 py-2 text-xs font-medium text-[#1c6fb8]">
          Sent with <code className="font-mono">is_multiple: true</code> — viewers can select {correctCount} answers and are
          graded against all of them.
        </p>
      )}

      <div className="rounded-2xl bg-[#e8ecf0] p-4">
        <div className="flex items-start gap-2.5">
          <Avatar />
          <div className="min-w-0 flex-1">
            <div className="rounded-2xl rounded-tl-sm bg-white p-3.5 shadow-sm">
              <p className="mb-2 text-sm font-semibold text-[#3390ec]">NCLEXBase</p>
              <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                Anonymous Quiz{isMultiple ? " · Choose several" : ""}
              </p>
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
              <div className="mt-3 flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  {showResults ? `${picked.size} of ${correctCount} picked · Final results` : "0 votes · tap to simulate a vote"}
                </p>
                {showResults && lampText && (
                  <button
                    type="button"
                    onClick={() => setShowLamp((v) => !v)}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-base hover:bg-gray-100"
                    title="Why?"
                  >
                    💡
                  </button>
                )}
              </div>
              {showResults && showLamp && lampText && (
                <div className="mt-2 rounded-lg bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-900">{lampText}</div>
              )}
            </div>
            <p className="ml-1 mt-1 text-[11px] text-gray-400">Scheduled post &middot; 9:00 AM</p>
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
                <p className="font-bold">
                  {gotRight ? "🎉 Correct! Great job." : picked.size > correctCount ? "Too many answers selected." : "Not quite."}
                </p>
                <p className="mt-1 leading-relaxed">
                  {gotRight
                    ? `You picked all ${correctCount} correct answer${correctCount > 1 ? "s" : ""}.`
                    : `The correct answer${correctCount > 1 ? "s are" : " is"}: ${question.options
                        .filter((_, i) => correctIds.has(i))
                        .map((o) => o.label)
                        .join(", ")}.`}
                </p>
              </div>
              <p className="ml-1 mt-1 text-[11px] text-gray-400">9:00 AM</p>
            </div>
          </div>
        )}

        {showResults && followUp && (
          <div className="mt-2 flex items-start gap-2.5">
            <Avatar />
            <div className="min-w-0 flex-1">
              <div className="rounded-2xl rounded-tl-sm bg-white p-3.5 shadow-sm">
                <FollowUpBody text={renderFollowUpPlain(followUp)} />
              </div>
              <p className="ml-1 mt-1 text-[11px] text-gray-400">9:00 AM</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
