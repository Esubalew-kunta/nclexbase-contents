"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { parseQuestionsJson, type ValidationIssue } from "@/lib/content/normalize";
import type { NormalizedQuestion } from "@/lib/content/types";
import { DEFAULT_TEMPLATE_ID } from "@/components/templates";
import { DEFAULT_CTA_TEXT } from "@/lib/slides/chrome-copy";
import type { TemplateId } from "@/lib/slides/types";
import { UploadPanel } from "./UploadPanel";
import { QuestionLibrary } from "./QuestionLibrary";
import { TemplatePicker } from "./TemplatePicker";
import { PreviewPane } from "./PreviewPane";
import { ExportPanel } from "./ExportPanel";
import { BatchScheduleModal } from "./BatchScheduleModal";

export function AppShell() {
  const [questions, setQuestions] = useState<NormalizedQuestion[]>([]);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<TemplateId>(DEFAULT_TEMPLATE_ID);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [ctaText, setCtaText] = useState(DEFAULT_CTA_TEXT);
  const [showBatchSchedule, setShowBatchSchedule] = useState(false);
  const [telegramSettings, setTelegramSettings] = useState<{ daily_time: string; timezone: string } | null>(null);

  function handleJsonText(text: string, name: string) {
    const { result, parseError } = parseQuestionsJson(text);
    setSourceName(name);
    if (parseError) {
      setParseError(parseError);
      setQuestions([]);
      setIssues([]);
      setActiveId(null);
      setSelectedIds(new Set());
      return;
    }
    setParseError(null);
    setQuestions(result!.questions);
    setIssues(result!.issues);
    setActiveId(result!.questions[0]?.id ?? null);
    setSelectedIds(new Set(result!.questions.map((q) => q.id)));

    // Persist to Supabase so these questions show up in the question bank and
    // as "unposted" options in the Telegram calendar, independent of this
    // browser session. The raw text is sent, not the normalized output, so the
    // server runs the same validation this screen just did rather than
    // trusting the browser to have done it. Best effort — the
    // generator/export workflow doesn't depend on this.
    if (result!.questions.length > 0) {
      fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: text }),
      }).catch(() => {});
    }
  }

  useEffect(() => {
    fetch("/api/telegram/settings")
      .then((r) => r.json())
      .then((data) => setTelegramSettings(data.settings))
      .catch(() => {});
  }, []);

  const activeQuestion = useMemo(() => questions.find((q) => q.id === activeId) ?? null, [questions, activeId]);
  const selectedQuestions = useMemo(() => questions.filter((q) => selectedIds.has(q.id)), [questions, selectedIds]);

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Image src="/brand/nclexbase-icon.png" alt="" width={36} height={36} unoptimized />
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-teal">NCLEXBase</p>
            <h1 className="text-xl font-bold text-brand-dark">Content Generator</h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/questions" className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-brand-dark hover:bg-gray-50">
            Questions
          </Link>
          <Link href="/dashboard" className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-brand-dark hover:bg-gray-50">
            Dashboard
          </Link>
          <Link href="/calendar" className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-brand-dark hover:bg-gray-50">
            Calendar
          </Link>
          <Link href="/settings/telegram" className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-brand-dark hover:bg-gray-50">
            Telegram Settings
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-8 lg:grid-cols-[360px_1fr]">
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="mb-2 text-sm font-bold text-brand-dark">1. Import JSON</h2>
            <UploadPanel onJsonText={handleJsonText} />
            {sourceName && <p className="mt-2 text-xs text-gray-500">Loaded: {sourceName}</p>}
            {parseError && <p className="mt-2 rounded-lg bg-red-50 p-3 text-xs text-red-800">Invalid JSON — {parseError}</p>}

            <label className="mt-4 block text-xs font-bold text-brand-dark">Bottom-of-answer CTA text</label>
            <input
              type="text"
              value={ctaText}
              onChange={(e) => setCtaText(e.target.value)}
              placeholder={DEFAULT_CTA_TEXT}
              className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-gray-400">Shown under &ldquo;Join our Telegram&rdquo; on every answer slide. Clear it to remove the banner entirely.</p>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-bold text-brand-dark">2. Questions</h2>
            <QuestionLibrary
              questions={questions}
              issues={issues}
              activeId={activeId}
              selectedIds={selectedIds}
              onSelectActive={setActiveId}
              onToggleSelected={(id) =>
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
              onToggleAll={(checked) => setSelectedIds(checked ? new Set(questions.map((q) => q.id)) : new Set())}
            />
          </div>

          <div>
            <h2 className="mb-2 text-sm font-bold text-brand-dark">3. Design</h2>
            <TemplatePicker value={templateId} onChange={setTemplateId} />
          </div>

          <div>
            <h2 className="mb-2 text-sm font-bold text-brand-dark">4. Export</h2>
            <ExportPanel questions={selectedQuestions} templateId={templateId} ctaText={ctaText} />
          </div>

          <div>
            <h2 className="mb-2 text-sm font-bold text-brand-dark">5. Telegram</h2>
            <button
              type="button"
              disabled={selectedQuestions.length === 0 || !telegramSettings}
              onClick={() => setShowBatchSchedule(true)}
              className="w-full rounded-lg border border-[#3390ec]/30 bg-[#3390ec]/10 px-4 py-2.5 text-sm font-semibold text-[#3390ec] hover:bg-[#3390ec]/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Schedule Selected to Telegram ({selectedQuestions.length})
            </button>
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-bold text-brand-dark">Live preview — 1080 &times; 1920</h2>
          <PreviewPane question={activeQuestion} templateId={templateId} ctaText={ctaText} />
        </div>
      </section>

      {showBatchSchedule && telegramSettings && (
        <BatchScheduleModal questions={selectedQuestions} settings={telegramSettings} onClose={() => setShowBatchSchedule(false)} onDone={() => setShowBatchSchedule(false)} />
      )}
    </div>
  );
}
