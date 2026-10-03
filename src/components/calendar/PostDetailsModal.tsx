"use client";

import { useState } from "react";
import type { ScheduledPostWithQuestion } from "./types";
import { utcToZonedDateStr, utcToZonedTimeStr } from "@/lib/telegram/timezone";

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  publishing: "Publishing…",
  published: "✓ Published",
  failed: "✕ Failed",
  cancelled: "Cancelled",
  draft: "Draft",
};

export function PostDetailsModal({ post, channel, onClose, onChanged }: { post: ScheduledPostWithQuestion; channel: string; onClose: () => void; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const scheduledUtc = new Date(post.scheduled_at);
  const [dateStr, setDateStr] = useState(utcToZonedDateStr(scheduledUtc, post.timezone));
  const timeStr = utcToZonedTimeStr(scheduledUtc, post.timezone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/schedule/${post.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        throw new Error(b?.error ?? "Failed");
      }
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const channelUsername = channel.replace(/^@/, "");
  const telegramUrl = post.telegram_message_id ? `https://t.me/${channelUsername}/${post.telegram_message_id}` : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-brand-dark">{post.nclex_questions?.category ?? post.nclex_questions?.type ?? "Question"}</h2>
          <button type="button" onClick={onClose} className="text-xl leading-none text-gray-400 hover:text-gray-600">
            &times;
          </button>
        </div>

        <div className="flex flex-col gap-2 text-sm">
          <Row label="Status" value={STATUS_LABEL[post.status] ?? post.status} />
          <Row label="Telegram" value={channel} />
          {!editing ? (
            <Row label={post.status === "published" ? "Published" : "Scheduled"} value={`${dateStr} ${timeStr} (${post.timezone})`} />
          ) : null}
          {post.nclex_questions && <Row label="Question" value={post.nclex_questions.question.slice(0, 80) + (post.nclex_questions.question.length > 80 ? "…" : "")} />}
          {post.telegram_message_id && <Row label="Telegram Message ID" value={String(post.telegram_message_id)} />}
          {post.error_message && <Row label="Error" value={post.error_message} muted="text-red-600" />}
        </div>

        {telegramUrl && (
          <a href={telegramUrl} target="_blank" rel="noreferrer" className="mt-4 block w-full rounded-lg border border-gray-200 py-2 text-center text-sm font-semibold text-brand-teal hover:bg-gray-50">
            View Post in Telegram
          </a>
        )}

        {editing && (
          <div className="mt-4 flex flex-col gap-2 rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Move this post to another day. The posting time stays as set in Telegram settings unless you change it here.</p>
            <label htmlFor="move-date" className="text-xs font-bold text-brand-dark">
              Date
            </label>
            <input id="move-date" type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <button
              type="button"
              disabled={busy}
              onClick={() => patch({ action: "reschedule", dateStr, timezone: post.timezone })}
              className="mt-1 rounded-lg bg-brand-teal py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              Save Changes
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-xs text-red-500">{error}</p>}

        {!editing && (post.status === "scheduled" || post.status === "failed") && (
          <div className="mt-4 flex gap-2">
            {post.status === "scheduled" && (
              <button type="button" onClick={() => setEditing(true)} className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-semibold text-brand-dark hover:bg-gray-50">
                Edit Schedule
              </button>
            )}
            {post.status === "failed" && (
              <button type="button" disabled={busy} onClick={() => patch({ action: "retry" })} className="flex-1 rounded-lg bg-brand-gold py-2 text-sm font-bold text-brand-dark disabled:opacity-50">
                Retry Now
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (confirm(`Cancel this scheduled post?\n\n${dateStr} ${timeStr}`)) patch({ action: "cancel" });
              }}
              className="flex-1 rounded-lg border border-red-200 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              Cancel Schedule
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 py-1.5 last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className={`font-semibold ${muted ?? "text-brand-dark"}`}>{value}</span>
    </div>
  );
}
