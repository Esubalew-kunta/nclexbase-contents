"use client";

import { useRef, useState } from "react";
import type { QuestionImage } from "@/lib/content/types";

/** Longest edge kept after the browser downsizes the upload. The slide body is
 *  under 1000px wide, so more than this is bytes with no visible benefit. */
const MAX_EDGE = 1400;

/** Reads an image file, scales it down, and returns it as a JPEG data URL with
 *  its natural size. Transparent areas are flattened onto white so a PNG
 *  diagram does not turn black. */
async function prepareImage(file: File): Promise<Omit<QuestionImage, "position">> {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return { src: canvas.toDataURL("image/jpeg", 0.9), width, height };
}

export function QuestionImagePicker({ image, onChange, addLabel = "+ Add image to this question", hint }: { image: QuestionImage | null; onChange: (image: QuestionImage | null) => void; addLabel?: string; hint: string }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file (PNG, JPG, WebP).");
      return;
    }
    try {
      const prepared = await prepareImage(file);
      onChange({ ...prepared, position: image?.position ?? "top" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that image");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      {image ? (
        <div className="flex items-start gap-3 rounded-lg border border-gray-200 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.src} alt="" className="h-16 w-16 rounded object-cover" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 text-xs font-semibold" role="group" aria-label="Image position">
              {(["top", "bottom"] as const).map((pos) => (
                <button
                  key={pos}
                  type="button"
                  aria-pressed={image.position === pos}
                  onClick={() => onChange({ ...image, position: pos })}
                  className={`flex-1 px-3 py-1.5 capitalize ${image.position === pos ? "bg-brand-teal text-white" : "bg-white text-brand-dark hover:bg-gray-50"}`}
                >
                  {pos}
                </button>
              ))}
            </div>
            <div className="flex gap-3 text-xs font-semibold">
              <button type="button" onClick={() => inputRef.current?.click()} className="text-brand-teal hover:underline">
                Replace
              </button>
              <button type="button" onClick={() => onChange(null)} className="text-red-600 hover:underline">
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} className="rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm font-semibold text-brand-dark hover:bg-gray-50">
          {addLabel}
        </button>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
      <p className="text-xs text-gray-400">{hint}</p>
    </div>
  );
}
