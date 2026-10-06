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

            // Generating an image also files the question away in the bank, so
            // say so rather than leaving the user to wonder whether it stuck.
            const bankId = res.headers.get("X-Bank-Question-Id");
            const bankCount = res.headers.get("X-Bank-Slide-Count");
            if (res.headers.get("X-Bank-Saved") === "true" && bankId) {
              setSaved({ count: Number(bankCount ?? 1), questionId: bankId });
            } else {
              setSaveWarning(res.headers.get("X-Bank-Error") ?? "The image downloaded, but could not be saved to the question bank.");
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
          Saved to the question bank with all {saved.count} image{saved.count > 1 ? "s" : ""}.{" "}
          <Link href="/questions" className="underline">
            View
          </Link>
        </p>
      )}
      {saveWarning && <p className="max-w-xs text-center text-xs text-amber-700">{saveWarning}</p>}
    </div>
  );
}

export function PreviewPane({ question, templateId, ctaText }: { question: NormalizedQuestion | null; templateId: TemplateId; ctaText: string }) {
  const { plan, measurer } = useSlidePlan(question, templateId, ctaText);
  const [zoomed, setZoomed] = useState<number | null>(null);
  const [showTelegram, setShowTelegram] = useState(false);

  if (!question) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-gray-300 text-sm text-gray-400">
        Select a question to preview its slides.
      </div>
    );
  }

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

          <div className="flex flex-wrap gap-4">
            {plan.slides.map((slide, i) => (
              <button key={i} type="button" onClick={() => setZoomed(i)} className="block cursor-zoom-in">
                <ScaledSlide maxWidth={240}>
                  <SlideCanvas question={question} templateId={templateId} slide={slide} overallIndex={i + 1} overallTotal={plan.slides.length} />
                </ScaledSlide>
                <p className="mt-1 text-center text-xs text-gray-500">
                  {slide.kind === "question" ? "Question" : "Answer"}
                  {slide.isContinuation ? " (cont.)" : ""}
                </p>
              </button>
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
