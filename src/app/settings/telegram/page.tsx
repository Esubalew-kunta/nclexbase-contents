"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { TelegramStatusResponse } from "@/app/api/telegram/status/route";
import { SchedulerSettingsForm } from "./SchedulerSettingsForm";

function StatusRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 py-3 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-brand-dark">{children}</span>
    </div>
  );
}

interface HealthReport {
  ok: boolean;
  checks: Record<string, { ok: boolean; detail: string }>;
}

/** Surfaces the server-side dependencies the admin cannot otherwise see. ffmpeg
 * is a system binary and PRINT_TOKEN_SECRET is an env var, so neither failing
 * announces itself until the exact feature that needs it is used — this puts
 * both on a screen the admin already visits. */
function ServerStatus() {
  const [health, setHealth] = useState<HealthReport | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  if (!health) return null;

  const order = ["supabase", "PRINT_TOKEN_SECRET", "ffmpeg", "telegram"] as const;
  const label: Record<string, string> = {
    supabase: "Database",
    PRINT_TOKEN_SECRET: "Export signing",
    ffmpeg: "Video (ffmpeg)",
    telegram: "Telegram bot",
  };

  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-brand-dark">Server capabilities</h2>
      <p className="mb-3 text-xs text-gray-400">A failed item only affects the feature named — everything else keeps working.</p>
      {order.map((key) => {
        const check = health.checks[key];
        if (!check) return null;
        return (
          <div key={key} className="flex items-start justify-between gap-3 border-b border-gray-100 py-2.5 last:border-0">
            <span className="text-sm text-gray-500">{label[key]}</span>
            <span className={`text-right text-xs font-semibold ${check.ok ? "text-green-700" : "text-amber-700"}`}>
              {check.ok ? "✓ ready" : "✕ unavailable"}
              {!check.ok && <span className="mt-0.5 block max-w-[16rem] font-normal text-amber-600">{check.detail}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function TelegramSettingsPage() {
  const [status, setStatus] = useState<TelegramStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetch("/api/telegram/status")
      .then((r) => r.json())
      .then(setStatus)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  return (
    <div className="mx-auto w-full min-w-0 max-w-xl px-4 py-6 sm:py-10">
      <div className="mb-6 flex items-center gap-3">
        <Image src="/brand/nclexbase-icon.png" alt="" width={32} height={32} unoptimized />
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-teal">NCLEXBase</p>
          <h1 className="text-xl font-bold text-brand-dark">Telegram</h1>
        </div>
      </div>

      <Link href="/" className="mb-4 inline-block py-2 text-sm text-brand-teal hover:underline">
        &larr; Back to generator
      </Link>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        {loading ? (
          <p className="text-sm text-gray-400">Checking connection…</p>
        ) : !status?.configured ? (
          <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
            <p className="mb-2 font-semibold">Not set up yet</p>
            <p>
              Add <code className="rounded bg-amber-100 px-1">TELEGRAM_BOT_TOKEN</code> and{" "}
              <code className="rounded bg-amber-100 px-1">TELEGRAM_CHANNEL</code> (e.g. <code className="rounded bg-amber-100 px-1">@YourChannel</code>) to a{" "}
              <code className="rounded bg-amber-100 px-1">.env.local</code> file in the project root, then restart the dev server.
            </p>
          </div>
        ) : (
          <>
            <StatusRow label="Connection">{status.connected ? <span className="text-green-700">✓ Connected</span> : <span className="text-red-600">✕ Not connected</span>}</StatusRow>
            {status.botName && (
              <StatusRow label="Bot">
                {status.botName} (@{status.botUsername})
              </StatusRow>
            )}
            {status.channel && <StatusRow label="Channel">{status.channel}</StatusRow>}
            <StatusRow label="Status">
              {status.connected ? <span className="text-green-700">✓ Bot can post to this channel</span> : <span className="text-red-600">✕ Cannot post</span>}
            </StatusRow>
            {status.error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-800">{status.error}</p>}
          </>
        )}

        <button type="button" onClick={load} className="mt-4 w-full rounded-lg border border-gray-200 py-2 text-sm font-semibold text-brand-dark hover:bg-gray-50">
          Recheck connection
        </button>
      </div>

      <p className="mt-4 text-xs text-gray-400">
        Scheduling to Telegram stays locked until this shows <strong>Connected</strong>. Image/PNG export works regardless of this status.
      </p>

      <SchedulerSettingsForm />
      <ServerStatus />

      <Link href="/calendar" className="mt-4 block rounded-lg border border-gray-200 py-2 text-center text-sm font-semibold text-brand-dark hover:bg-gray-50">
        Open Calendar &rarr;
      </Link>
    </div>
  );
}
