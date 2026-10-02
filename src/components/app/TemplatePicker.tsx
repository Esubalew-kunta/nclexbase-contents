"use client";

import { TEMPLATES } from "@/lib/slides/types";
import type { TemplateId } from "@/lib/slides/types";

export function TemplatePicker({ value, onChange }: { value: TemplateId; onChange: (id: TemplateId) => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {TEMPLATES.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`rounded-xl border px-4 py-3 text-center text-sm font-bold transition-colors ${
            value === t.id ? "border-brand-teal bg-brand-teal/5 text-brand-teal" : "border-gray-200 text-brand-dark hover:border-brand-teal/50"
          }`}
        >
          {t.name}
        </button>
      ))}
    </div>
  );
}
