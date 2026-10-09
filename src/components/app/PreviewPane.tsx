"use client";

import { useState } from "react";
import Link from "next/link";
import { downloadBlob } from "@/lib/download";
import type { NormalizedQuestion } from "@/lib/content/types";
import { useSlidePlan } from "@/lib/slides/useSlidePlan";
import { ScaledSlide } from "@/components/slides/ScaledSlide";
import { SlideCanvas } from "@/components/slides/SlideCanvas";
import { SlideZoomModal } from "./SlideZoomModal";
import { TelegramScheduleModal } from "@/components/telegram/TelegramScheduleModal";
import type { TemplateId } from "@/lib/slides/types";

function DownloadSlideButton({ question, templateId, slideIndex, ctaText }: { question: NormalizedQuestion; templateId: TemplateId; slideIndex: number; ctaText: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ count: number; questionId: string } | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          setSaved(null);
          setSaveWarning(null);
          try {
            const res = await fetch("/api/export/png", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ question, templateId, slideIndex, ctaText }),
            });
            if (!res.ok) {
              const body = await res.json().catch(() => null);
              throw new Error(body?.error ?? `Download failed (${res.status})`);
            }

            // Generating an image also files the question away in the bank, but
            // that happens after the download so the user isn't kept waiting.
            if (res.headers.get("X-Bank-Saved") === "pending") {
              setSaved({ count: 0, questionId: "" });
            }

            const disposition = res.headers.get("Content-Disposition") ?? "";
            const match = disposition.match(/filename="([^"]+)"/);
            const filename = match ? match[1] : `question-${question.index}-slide-${slideIndex + 1}.png`;
            const blob = await res.blob();
            downloadBlob(blob, filename);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Download failed");
          } finally {
            setBusy(false);
          }
        }}
        className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-brand-dark shadow hover:bg-gray-50 disabled:opacity-50"
      >
        {busy ? "Rendering…" : "Download this PNG"}
      </button>
      {error && <p className="max-w-xs text-center text-xs text-red-400">{error}</p>}
      {saved && (
        <p className="max-w-xs text-center text-xs text-green-700">
          Saving to the question bank in the background.{" "}
          <Link href="/questions" className="underline">
            View
          </Link>
        </p>
      )}
      {saveWarning && <p className="max-w-xs text-center text-xs text-amber-700">{saveWarning}</p>}
    </div>
  );
}

/** Download bar for joining the slides ticked on the thumbnails below into one
 *  wide image, side by side in slide order. */
function CombineBar({ question, templateId, ctaText, selected, total, onSelectAll, onClear }: { question: NormalizedQuestion; templateId: TemplateId; ctaText: string; selected: number[]; total: number; onSelectAll: () => void; onClear: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const usable = selected.length >= 2;

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/export/combined", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, templateId, ctaText, slideIndices: selected }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Download failed (${res.status})`);
      }
      const match = (res.headers.get("Content-Disposition") ?? "").match(/filename="([^"]+)"/);
      downloadBlob(await res.blob(), match ? match[1] : `question-${question.index}-combined.png`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
      <span className="text-xs font-bold text-brand-dark">Combine side by side</span>
      <span className="text-xs text-gray-500">Tick the slides you want below ({selected.length}/{total} selected)</span>
      <button type="button" onClick={onSelectAll} className="text-xs font-semibold text-brand-teal hover:underline">
        Select all
      </button>
      <button type="button" onClick={onClear} className="text-xs font-semibold text-gray-500 hover:underline">
        Clear
      </button>
      <button
        type="button"
        disabled={!usable || busy}
        onClick={download}
        className="ml-auto rounded-lg bg-brand-gold px-4 py-1.5 text-sm font-semibold text-brand-dark hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Rendering…" : usable ? `Download ${selected.length} as 1 image` : "Pick 2 or more"}
      </button>
      {error && <span className="w-full text-xs text-red-700">{error}</span>}
    </div>
  );
}

export function PreviewPane({ question, templateId, ctaText }: { question: NormalizedQuestion | null; templateId: TemplateId; ctaText: string }) {
  const { plan, measurer } = useSlidePlan(question, templateId, ctaText);
  const [zoomed, setZoomed] = useState<number | null>(null);
  const [picked, setPicked] = useState<{ questionId: string; indices: number[] }>({ questionId: "", indices: [] });
  const [showTelegram, setShowTelegram] = useState(false);

  if (!question) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-gray-300 text-sm text-gray-400">
        Select a question to preview its slides.
      </div>
    );
  }

  // Ticks belong to the question they were made on.
  const selected = question && picked.questionId === question.id ? picked.indices : [];
  const toggle = (i: number) =>
    setPicked({ questionId: question!.id, indices: selected.includes(i) ? selected.filter((x) => x !== i) : [...selected, i].sort((a, b) => a - b) });

  return (
    <div>
      {measurer}
      {!plan ? (
        <p className="text-sm text-gray-400">Measuring layout…</p>
      ) : (
        <>
          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => setShowTelegram(true)}
              className="rounded-lg border border-[#3390ec]/30 bg-[#3390ec]/10 px-4 py-2 text-sm font-semibold text-[#3390ec] hover:bg-[#3390ec]/15"
            >
              Schedule to Telegram
            </button>
          </div>

          <CombineBar
            question={question}
            templateId={templateId}
            ctaText={ctaText}
            selected={selected}
            total={plan.slides.length}
            onSelectAll={() => setPicked({ questionId: question.id, indices: plan.slides.map((_, i) => i) })}
            onClear={() => setPicked({ questionId: question.id, indices: [] })}
          />

          <div className="flex flex-wrap gap-4">
            {plan.slides.map((slide, i) => (
              <div key={i} className="flex w-[240px] max-w-full flex-col items-center">
                <button type="button" onClick={() => setZoomed(i)} className="block w-full cursor-zoom-in">
                  <ScaledSlide maxWidth={240}>
                    <SlideCanvas question={question} templateId={templateId} slide={slide} overallIndex={i + 1} overallTotal={plan.slides.length} />
                  </ScaledSlide>
                </button>
                <label className="mt-1 flex cursor-pointer items-center gap-1.5 text-xs text-gray-500">
                  <input type="checkbox" checked={selected.includes(i)} onChange={() => toggle(i)} aria-label={`Include slide ${i + 1} in the combined image`} />
                  {slide.kind === "question" ? "Question" : "Answer"}
                  {slide.isContinuation ? " (cont.)" : ""}
                </label>
              </div>
            ))}
          </div>

          {zoomed !== null && (
            <SlideZoomModal
              question={question}
              templateId={templateId}
              slide={plan.slides[zoomed]}
              overallIndex={zoomed + 1}
              overallTotal={plan.slides.length}
              onClose={() => setZoomed(null)}
              footer={<DownloadSlideButton question={question} templateId={templateId} slideIndex={zoomed} ctaText={ctaText} />}
            />
          )}

          {showTelegram && <TelegramScheduleModal question={question} onClose={() => setShowTelegram(false)} />}
        </>
      )}
    </div>
  );
}
