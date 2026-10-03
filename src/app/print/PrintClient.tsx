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
    /** Blocks that could not be made to fit a slide at any density tier. The
     *  exporter refuses to write PNGs while this is non-empty, so content is
     *  never published with words running off the bottom of the image. */
    __OVERFLOW__?: { kind: string; blockIds: string[]; tier: string }[];
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
      window.__OVERFLOW__ = plan.overflow;
      // Signalled ready even when there is overflow: the exporter reads
      // __OVERFLOW__ next and fails with the block names. Failing to become
      // ready here would surface as an opaque 15s timeout instead.
      window.__READY__ = true;
    }
  }, [plan, payload]);

  if (error) return <div style={{ color: "red", padding: 20 }}>{error}</div>;
  if (!payload || !plan) return <>{measurer}</>;

  return (
    <div>
      {measurer}
      {/* Visible in the screenshot-adjacent DOM rather than logged, so a human
          opening /print directly can see why the export was refused. */}
      {plan.overflow.length > 0 && (
        <div data-overflow-report style={{ padding: 20, color: "#b00", fontFamily: "monospace" }}>
          Content does not fit a slide and cannot be shrunk further:
          {plan.overflow.map((o) => `${o.kind} block "${o.blockIds.join('", "')}" (density tier: ${o.tier})`).join("; ")}
        </div>
      )}
      {plan.slides.map((slide, i) => (
        <div key={i} data-slide-index={i} style={{ width: 1080, height: 1920 }}>
          <SlideCanvas question={payload.question} templateId={payload.templateId} slide={slide} overallIndex={i + 1} overallTotal={plan.slides.length} />
        </div>
      ))}
    </div>
  );
}
