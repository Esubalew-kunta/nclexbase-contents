"use client";

import { useEffect, useState } from "react";
import { DEFAULT_POST_TIMES } from "@/lib/telegram/postTimes";
import { Toggle } from "@/components/ui/Toggle";

const COMMON_TIMEZONES = [
  "UTC",
  "Africa/Addis_Ababa",
  "Africa/Cairo",
  "Africa/Lagos",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

interface Settings {
  enabled: boolean;
  daily_time: string;
  timezone: string;
  post_followup: boolean;
  auto_schedule: boolean;
  post_times: string[];
  channel: string | null;
}

function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function SchedulerSettingsForm() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [tzError, setTzError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/telegram/settings")
      .then((r) => r.json())
      .then((data) =>
        setSettings({
          ...data.settings,
          // A settings row written before post_times existed has no value, so
          // fall back to the documented default rather than an empty editor.
          post_times: Array.isArray(data.settings.post_times) && data.settings.post_times.length > 0 ? data.settings.post_times : DEFAULT_POST_TIMES,
        }),
      );
  }, []);

  function setTime(index: number, value: string) {
    if (!settings) return;
    const next = [...settings.post_times];
    next[index] = value;
    setSettings({ ...settings, post_times: next });
    setStatus(null);
  }

  function addTime() {
    if (!settings || settings.post_times.length >= 6) return;
    // Offer a time that isn't already taken, defaulting to the first free
    // two-hour gap so a second slot doesn't silently duplicate the first.
    const used = new Set(settings.post_times);
    const suggestion = ["09:00", "13:00", "17:00", "21:00"].find((t) => !used.has(t)) ?? "12:00";
    setSettings({ ...settings, post_times: [...settings.post_times, suggestion] });
    setStatus(null);
  }

  function removeTime(index: number) {
    if (!settings || settings.post_times.length <= 1) return;
    setSettings({ ...settings, post_times: settings.post_times.filter((_, i) => i !== index) });
    setStatus(null);
  }

  async function save() {
    if (!settings) return;
    if (!isValidTimeZone(settings.timezone)) {
      setTzError(`"${settings.timezone}" isn't a recognized timezone (use an IANA name like "Africa/Addis_Ababa").`);
      return;
    }
    setTzError(null);
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/telegram/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: settings.enabled,
          daily_time: settings.daily_time,
          timezone: settings.timezone,
          post_followup: settings.post_followup,
          auto_schedule: settings.auto_schedule,
          post_times: settings.post_times,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to save");
      }
      setStatus({ kind: "ok", text: "Saved." });
    } catch (err) {
      setStatus({ kind: "err", text: err instanceof Error ? err.message : "Failed to save" });
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return (
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-sm text-gray-400">Loading scheduler settings…</p>
      </div>
    );
  }

  const invalidTime = settings.post_times.find((t) => !TIME_RE.test(t));
  const duplicate = new Set(settings.post_times).size !== settings.post_times.length;

  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-brand-dark">Telegram Scheduler</h2>

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-brand-dark">Automatic publishing</p>
          <p className="text-xs text-gray-400">Pauses the cron from publishing anything when off — scheduled posts stay queued.</p>
        </div>
        <Toggle checked={settings.enabled} onChange={() => setSettings({ ...settings, enabled: !settings.enabled })} label="Automatic publishing" />
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-brand-dark">Auto-assign new questions</p>
          <p className="text-xs text-gray-400">Place freshly imported questions into the next free slot on their own.</p>
        </div>
        <Toggle checked={settings.auto_schedule} onChange={() => setSettings({ ...settings, auto_schedule: !settings.auto_schedule })} label="Auto-assign new questions" />
      </div>

      <label className="mb-1 block text-xs font-bold text-brand-dark">Posts per day</label>
      <p className="mb-2 text-xs text-gray-400">Each time is a slot. A day can hold one post per slot, up to six.</p>
      <div className="mb-2 flex flex-col gap-2">
        {settings.post_times.map((t, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="time"
              value={t}
              onChange={(e) => setTime(i, e.target.value)}
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => removeTime(i)}
              disabled={settings.post_times.length <= 1}
              aria-label={`Remove slot ${i + 1}`}
              className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-30"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addTime}
        disabled={settings.post_times.length >= 6}
        className="mb-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-brand-dark hover:bg-gray-50 disabled:opacity-40"
      >
        + Add another slot
      </button>
      {invalidTime && <p className="mb-3 text-xs text-red-500">Every slot needs a valid 24-hour time.</p>}
      {duplicate && <p className="mb-3 text-xs text-red-500">Two slots share the same time — each slot must be unique.</p>}

      <label className="mb-1 block text-xs font-bold text-brand-dark">Timezone</label>
      <input
        list="common-timezones"
        value={settings.timezone}
        onChange={(e) => {
          setSettings({ ...settings, timezone: e.target.value });
          setTzError(null);
        }}
        placeholder="e.g. Africa/Addis_Ababa"
        className="mb-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
      />
      <datalist id="common-timezones">
        {COMMON_TIMEZONES.map((tz) => (
          <option key={tz} value={tz} />
        ))}
      </datalist>
      {tzError ? <p className="mb-3 text-xs text-red-500">{tzError}</p> : <p className="mb-4 text-xs text-gray-400">This timezone is authoritative for every schedule — never the browser&rsquo;s.</p>}

      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-brand-dark">Post explanation follow-up</p>
          <p className="text-xs text-gray-400">Send the &ldquo;why the other options are wrong&rdquo; / key point message after the poll.</p>
        </div>
        <Toggle checked={settings.post_followup} onChange={() => setSettings({ ...settings, post_followup: !settings.post_followup })} label="Post explanation follow-up" />
      </div>

      <button
        type="button"
        disabled={saving || Boolean(invalidTime) || duplicate}
        onClick={save}
        className="w-full rounded-lg bg-brand-teal py-2.5 text-sm font-bold text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save Schedule"}
      </button>
      {status && <p className={`mt-2 text-center text-xs ${status.kind === "ok" ? "text-gray-500" : "text-red-500"}`}>{status.text}</p>}
    </div>
  );
}
