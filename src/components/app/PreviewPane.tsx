"use client";

import { useState } from "react";
import type { NormalizedQuestion } from "@/lib/content/types";
import { useSlidePlan } from "@/lib/slides/useSlidePlan";
import { ScaledSlide } from "@/components/slides/ScaledSlide";
import { SlideCanvas } from "@/components/slides/SlideCanvas";
import { SlideZoomModal } from "./SlideZoomModal";
import { TelegramScheduleModal } from "@/components/telegram/TelegramScheduleModal";
import { VideoExportModal } from "./VideoExportModal";
import type { TemplateId } from "@/lib/slides/types";

function DownloadSlideButton({ question, templateId, slideIndex, ctaText }: { question: NormalizedQuestion; templateId: TemplateId; slideIndex: number; ctaText: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
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
            const disposition = res.headers.get("Content-Disposition") ?? "";
            const match = disposition.match(/filename="([^"]+)"/);
            const filename = match ? match[1] : `question-${question.index}-slide-${slideIndex + 1}.png`;
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
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
    </div>
  );
}

export function PreviewPane({ question, templateId, ctaText }: { question: NormalizedQuestion | null; templateId: TemplateId; ctaText: string }) {
  const { plan, measurer } = useSlidePlan(question, templateId, ctaText);
  const [zoomed, setZoomed] = useState<number | null>(null);
  const [showTelegram, setShowTelegram] = useState(false);
  const [showVideo, setShowVideo] = useState(false);

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
            <button type="button" onClick={() => setShowVideo(true)} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-gray-50">
              Create Video
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
          {showVideo && <VideoExportModal question={question} templateId={templateId} ctaText={ctaText} onClose={() => setShowVideo(false)} />}
        </>
      )}
    </div>
  );
}
