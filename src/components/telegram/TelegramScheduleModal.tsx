"use client";

import { useEffect } from "react";
import type { NormalizedQuestion } from "@/lib/content/types";
import { TelegramPollPreview } from "./TelegramPollPreview";

export function TelegramScheduleModal({ question, onClose }: { question: NormalizedQuestion; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-brand-dark">Schedule to Telegram</h2>
          <button type="button" onClick={onClose} className="text-xl leading-none text-gray-400 hover:text-gray-600" aria-label="Close">
            &times;
          </button>
        </div>

        <TelegramPollPreview question={question} />

        <div className="mt-5 rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
          Scheduling controls (pick a date, confirm, auto-publish) land in the next phase, once your bot is connected and Supabase is wired up. For now this is a true preview of exactly what would post.
        </div>
      </div>
    </div>
  );
}
