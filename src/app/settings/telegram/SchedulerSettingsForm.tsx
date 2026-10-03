"use client";

import { useEffect, useState } from "react";
import { DEFAULT_POST_TIME, postsPerDaySchema, postTimeSchema } from "@/lib/telegram/postTimes";
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
  dailyTime: string;
  postsPerDay: number;
  timezone: string;
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

export function SchedulerSettingsForm() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [tzError, setTzError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/telegram/settings")
      .then((r) => r.json())
      .then((data) => {
        const s = data.settings ?? {};
        setSettings({
          enabled: s.enabled ?? true,
          // A row written before either setting existed has no value, so fall
          // back to the documented defaults rather than an empty editor.
          dailyTime: typeof s.dailyTime === "string" && s.dailyTime ? s.dailyTime : DEFAULT_POST_TIME,
          postsPerDay: typeof s.postsPerDay === "number" ? s.postsPerDay : 2,
          timezone: s.timezone ?? "UTC",
          channel: s.channel ?? null,
        });
      });
  }, []);

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
          dailyTime: settings.dailyTime,
          postsPerDay: settings.postsPerDay,
          timezone: settings.timezone,
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

  const timeValid = postTimeSchema.safeParse(settings.dailyTime).success;
  const countValid = postsPerDaySchema.safeParse(settings.postsPerDay).success;

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

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="dailyTime" className="mb-1 block text-xs font-bold text-brand-dark">
            Posting time
          </label>
          <input
            id="dailyTime"
            type="time"
            value={settings.dailyTime}
            onChange={(e) => {
              setSettings({ ...settings, dailyTime: e.target.value });
              setStatus(null);
            }}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-gray-400">Every question for a day goes out at this time.</p>
        </div>

        <div>
          <label htmlFor="postsPerDay" className="mb-1 block text-xs font-bold text-brand-dark">
            Questions per day
          </label>
          <input
            id="postsPerDay"
            type="number"
            min={1}
            max={6}
            step={1}
            value={settings.postsPerDay}
            onChange={(e) => {
              setSettings({ ...settings, postsPerDay: Number(e.target.value) });
              setStatus(null);
            }}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-gray-400">Up to 6. Each day fills to this many.</p>
        </div>
      </div>
      {!timeValid && <p className="mb-3 text-xs text-red-500">The posting time must be a valid 24-hour time.</p>}
      {!countValid && <p className="mb-3 text-xs text-red-500">Questions per day must be a whole number between 1 and 6.</p>}

      <label htmlFor="timezone" className="mb-1 block text-xs font-bold text-brand-dark">
        Timezone
      </label>
      <input
        id="timezone"
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

      <p className="mb-4 rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-gray-500">
        The answer explanation is delivered inside Telegram&rsquo;s own post-vote 💡 field, so nothing is posted to the channel before someone
        answers. That field holds 200 characters — longer explanations are cut short there, and stay complete in the exported images.
      </p>

      <button
        type="button"
        disabled={saving || !timeValid || !countValid}
        onClick={save}
        className="w-full rounded-lg bg-brand-teal py-2.5 text-sm font-bold text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save Schedule"}
      </button>
      {status && <p className={`mt-2 text-center text-xs ${status.kind === "ok" ? "text-gray-500" : "text-red-500"}`}>{status.text}</p>}
    </div>
  );
}