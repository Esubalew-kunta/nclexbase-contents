"use client";

import { useEffect } from "react";

/**
 * Catches a render error anywhere below the root layout and shows a recoverable
 * screen instead of a blank 500. Without this, one bad question in the bank
 * takes down the whole page and the admin has no way back except a full
 * browser refresh.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Unhandled error in the app:", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold text-brand-dark">Something went wrong</h1>
      <p className="text-sm text-gray-600">
        This screen hit an unexpected error. Your questions and schedule are safe — nothing was lost.
      </p>
      {error.digest && <p className="text-xs text-gray-400">Reference: {error.digest}</p>}
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={reset} className="rounded-lg bg-brand-teal px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
          Try again
        </button>
        <a href="/" className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-gray-50">
          Back to the generator
        </a>
        <a href="/questions" className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-gray-50">
          Question bank
        </a>
      </div>
      {process.env.NODE_ENV !== "production" && (
        <pre className="mt-4 max-h-64 w-full overflow-auto rounded-lg bg-gray-50 p-3 text-left text-xs text-gray-700">
          {error.message}
        </pre>
      )}
    </div>
  );
}
