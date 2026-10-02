"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { PrintPayload } from "@/lib/export/tokenStore";
import { useSlidePlan } from "@/lib/slides/useSlidePlan";
import { SlideCanvas } from "@/components/slides/SlideCanvas";

declare global {
  interface Window {
    __READY__?: boolean;
    __SLIDE_COUNT__?: number;
    __SLIDE_KINDS__?: { kind: "question" | "answer"; isContinuation: boolean }[];
    __COUNTDOWN_COUNT__?: number;
  }
}

const LAST_QUESTION_SLIDE_INDEX = (kinds: { kind: string }[]) => {
  for (let i = kinds.length - 1; i >= 0; i--) if (kinds[i].kind === "question") return i;
  return -1;
};

export default function PrintClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [payload, setPayload] = useState<PrintPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/print-data/${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`))))
      .then(setPayload)
      .catch((e) => setError(String(e)));
  }, [token]);

  const { plan, measurer } = useSlidePlan(payload?.question ?? null, payload?.templateId ?? "clean-clinical", payload?.ctaText ?? "");

  useEffect(() => {
    if (plan) {
      window.__SLIDE_COUNT__ = plan.slides.length;
      window.__SLIDE_KINDS__ = plan.slides.map((s) => ({ kind: s.kind, isContinuation: s.isContinuation }));
      window.__COUNTDOWN_COUNT__ = payload?.countdownSeconds ?? 0;
      window.__READY__ = true;
    }
  }, [plan, payload]);

  if (error) return <div style={{ color: "red", padding: 20 }}>{error}</div>;
  if (!payload || !plan) return <>{measurer}</>;

  const lastQuestionIdx = LAST_QUESTION_SLIDE_INDEX(plan.slides);
  const countdownSeconds = payload.countdownSeconds ?? 0;

  return (
    <div>
      {measurer}
      {plan.slides.map((slide, i) => (
        <div key={i} data-slide-index={i} style={{ width: 1080, height: 1920 }}>
          <SlideCanvas question={payload.question} templateId={payload.templateId} slide={slide} overallIndex={i + 1} overallTotal={plan.slides.length} />
        </div>
      ))}
      {countdownSeconds > 0 &&
        lastQuestionIdx >= 0 &&
        Array.from({ length: countdownSeconds }).map((_, i) => (
          <div key={`cd-${i}`} data-countdown-frame={i} style={{ width: 1080, height: 1920 }}>
            <SlideCanvas
              question={payload.question}
              templateId={payload.templateId}
              slide={plan.slides[lastQuestionIdx]}
              overallIndex={lastQuestionIdx + 1}
              overallTotal={plan.slides.length}
              countdown={countdownSeconds - i}
            />
          </div>
        ))}
    </div>
  );
}
