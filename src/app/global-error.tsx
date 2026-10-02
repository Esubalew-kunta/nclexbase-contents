"use client";

/**
 * Last-resort boundary for errors in the ROOT LAYOUT itself, where the normal
 * error boundary cannot render (it lives inside the layout it protects). It has
 * to supply its own <html>/<body>.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", padding: "1rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#173133", margin: 0 }}>The app failed to start</h1>
          <p style={{ fontSize: "0.875rem", color: "#555", maxWidth: "28rem", margin: 0 }}>
            Something went wrong loading the interface. The server may need a restart, or a required environment variable may be
            missing.
          </p>
          {error.digest && <p style={{ fontSize: "0.75rem", color: "#888", margin: 0 }}>Reference: {error.digest}</p>}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center" }}>
            <button type="button" onClick={reset} style={{ border: "none", background: "#0e5a5c", color: "#fff", padding: "0.5rem 1rem", borderRadius: "0.5rem", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" }}>
              Try again
            </button>
            <a href="/" style={{ border: "1px solid #e5e7eb", padding: "0.5rem 1rem", borderRadius: "0.5rem", fontSize: "0.875rem", fontWeight: 600, color: "#173133", textDecoration: "none" }}>
              Reload
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
