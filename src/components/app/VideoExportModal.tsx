"use client";

import { useState } from "react";
import type { NormalizedQuestion } from "@/lib/content/types";
import type { TemplateId } from "@/lib/slides/types";

const DURATION_OPTIONS = [5, 10, 15];
const COUNTDOWN_OPTIONS = [3, 5, 10];

function DurationPicker({ label, value, onChange, options }: { label: string; value: number; onChange: (n: number) => void; options: number[] }) {
  const isCustom = !options.includes(value);
  return (
    <div className="mb-4">
      <label className="mb-1 block text-xs font-bold text-brand-dark">{label}</label>
      <div className="flex gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={`flex-1 rounded-lg border py-1.5 text-sm font-semibold ${value === o ? "border-brand-teal bg-brand-teal/10 text-brand-teal" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
          >
            {o}s
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange(options[options.length - 1] + 1)}
          className={`flex-1 rounded-lg border py-1.5 text-sm font-semibold ${isCustom ? "border-brand-teal bg-brand-teal/10 text-brand-teal" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
        >
          Custom
        </button>
      </div>
      {isCustom && (
        <input
          type="number"
          min={1}
          value={value}
          onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}
          className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
        />
      )}
    </div>
  );
}

export function VideoExportModal({ question, templateId, ctaText, onClose }: { question: NormalizedQuestion; templateId: TemplateId; ctaText: string; onClose: () => void }) {
  const [questionSeconds, setQuestionSeconds] = useState(10);
  const [countdownSeconds, setCountdownSeconds] = useState(5);
  const [answerSeconds, setAnswerSeconds] = useState(15);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/export/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, templateId, ctaText, questionSeconds, countdownSeconds, answerSeconds }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Q${question.index}-short.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Video export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !busy && onClose()}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-brand-dark">Create Shorts Video</h2>
          <button type="button" onClick={onClose} disabled={busy} className="text-xl leading-none text-gray-400 hover:text-gray-600 disabled:opacity-40">
            &times;
          </button>
        </div>

        <DurationPicker label="Question display time" value={questionSeconds} onChange={setQuestionSeconds} options={DURATION_OPTIONS} />
        <DurationPicker label="Countdown" value={countdownSeconds} onChange={setCountdownSeconds} options={COUNTDOWN_OPTIONS} />
        <DurationPicker label="Answer display time" value={answerSeconds} onChange={setAnswerSeconds} options={DURATION_OPTIONS} />

        {countdownSeconds >= questionSeconds && <p className="mb-3 text-xs text-amber-600">Countdown should be shorter than the question display time.</p>}
        {error && <p className="mb-3 text-xs text-red-500">{error}</p>}

        <button
          type="button"
          disabled={busy || countdownSeconds >= questionSeconds}
          onClick={generate}
          className="w-full rounded-lg bg-brand-teal py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Rendering video… this can take a minute" : "Generate MP4"}
        </button>
        <p className="mt-2 text-center text-[11px] text-gray-400">1080 &times; 1920 &middot; MP4 &middot; ready for YouTube Shorts / TikTok</p>
      </div>
    </div>
  );
}
