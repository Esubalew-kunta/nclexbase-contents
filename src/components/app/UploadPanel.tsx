"use client";

import { useRef, useState } from "react";

export function UploadPanel({ onJsonText }: { onJsonText: (text: string, sourceName: string) => void }) {
  const [dragActive, setDragActive] = useState(false);
  const [pasteValue, setPasteValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function readFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => onJsonText(String(reader.result ?? ""), file.name);
    reader.readAsText(file);
  }

  return (
    <div
      className="flex flex-col gap-2"
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        const file = e.dataTransfer.files?.[0];
        if (file) readFile(file);
      }}
    >
      <textarea
        value={pasteValue}
        onChange={(e) => setPasteValue(e.target.value)}
        placeholder='Paste question JSON here — a single question object, or an array of questions.'
        rows={10}
        className={`w-full rounded-lg border p-3 font-mono text-xs transition-colors ${dragActive ? "border-brand-teal bg-brand-teal/5" : "border-gray-200"}`}
      />
      <button
        type="button"
        disabled={!pasteValue.trim()}
        onClick={() => onJsonText(pasteValue, "pasted JSON")}
        className="rounded-lg bg-brand-teal px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal/90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Parse JSON
      </button>

      <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-1 py-2 text-left text-xs text-gray-400 hover:text-brand-teal hover:underline">
        or upload a .json file instead (you can also just drop it on the box above)
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) readFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
