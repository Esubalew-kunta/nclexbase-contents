"use client";

import { useState } from "react";
import type { NormalizedQuestion } from "@/lib/content/types";
import type { TemplateId } from "@/lib/slides/types";

async function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ExportPanel({ questions, templateId, ctaText }: { questions: NormalizedQuestion[]; templateId: TemplateId; ctaText: string }) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleExportZip() {
    if (questions.length === 0) return;
    setBusy(true);
    setStatus(`Rendering ${questions.length} question${questions.length === 1 ? "" : "s"}… this can take a little while.`);
    try {
      const res = await fetch("/api/export/zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions, templateId, ctaText }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      await downloadBlob(blob, "NCLEXBase_Questions.zip");
      setStatus(`Downloaded NCLEXBase_Questions.zip (${questions.length} question${questions.length === 1 ? "" : "s"}).`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={busy || questions.length === 0}
        onClick={handleExportZip}
        className="rounded-lg bg-brand-gold px-4 py-2.5 text-sm font-bold text-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Generating…" : `Download ZIP (${questions.length} question${questions.length === 1 ? "" : "s"})`}
      </button>
      {status && <p className="text-xs text-gray-500">{status}</p>}
    </div>
  );
}
