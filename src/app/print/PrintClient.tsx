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
  }
}

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
      window.__READY__ = true;
    }
  }, [plan, payload]);

  if (error) return <div style={{ color: "red", padding: 20 }}>{error}</div>;
  if (!payload || !plan) return <>{measurer}</>;

  return (
    <div>
      {measurer}
      {plan.slides.map((slide, i) => (
        <div key={i} data-slide-index={i} style={{ width: 1080, height: 1920 }}>
          <SlideCanvas question={payload.question} templateId={payload.templateId} slide={slide} overallIndex={i + 1} overallTotal={plan.slides.length} />
        </div>
      ))}
    </div>
  );
}
