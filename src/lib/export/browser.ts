import { chromium, type Browser } from "playwright";

// Launching Chromium takes a second or two, so we keep one instance alive
// for the life of the process instead of relaunching it per export request.
// If it dies (crashes, gets orphaned by a restart, etc.) we notice and
// relaunch rather than handing back a dead browser forever.
let browserPromise: Promise<Browser> | null = null;

/**
 * Playwright is asked for the `chrome` channel, i.e. the machine's installed
 * Google Chrome, rather than Playwright's own bundled chrome-headless-shell.
 * The bundled shell fails to launch under Node's child_process pipe plumbing
 * on some hosts (STATUS_DLL_INIT_FOUND), so the system browser is the more
 * reliable target — and it means the Docker image only has to apt-get one
 * Chrome instead of also downloading Playwright's ~400 MB copy at build time.
 *
 * CHROME_PATH lets a host point at a Chrome that isn't on the default search
 * path, which is what the container uses.
 */
const executablePath = process.env.CHROME_PATH?.trim() || undefined;

/** Flags that keep Chrome inside a small container's budget.
 *
 * `--disable-dev-shm-usage` is the important one: without it Chrome writes its
 * shared memory to /dev/shm, which in a container defaults to 64 MB and fills
 * instantly, producing the cryptic "session deleted because the page crashed"
 * screenshot failures. It also has to run as a non-root user in the image,
 * which is another reason not to use --no-sandbox. */
const LAUNCH_ARGS = [
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--no-first-run",
  "--no-zygote",
  "--disable-extensions",
  "--disable-background-networking",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--disable-features=Translate,BackForwardCache,AcceptCHFrame,MediaRouter,OptimizationHints",
];

function launch(): Promise<Browser> {
  const promise = chromium
    .launch({
      headless: true,
      channel: "chrome",
      ...(executablePath ? { executablePath } : {}),
      args: LAUNCH_ARGS,
    })
    .catch((err) => {
      browserPromise = null;
      throw err;
    });
  promise.then((browser) => {
    browser.on("disconnected", () => {
      if (browserPromise === promise) browserPromise = null;
    });
  });
  return promise;
}

export async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const existing = await browserPromise.catch(() => null);
    if (existing && existing.isConnected()) return existing;
    browserPromise = null;
  }
  browserPromise = launch();
  return browserPromise;
}

/** Probes whether Chrome can actually launch, for the health check. Verifies
 * more than a file being on disk: a Chrome that is installed but can't start
 * (missing shared libraries, not enough /dev/shm) fails here rather than in
 * the middle of an export.
 *
 * The timeout has to be generous. On a small shared instance the first launch
 * pays for a cold page cache and a slow CPU, and took over 20 seconds even on
 * a local 0.1-CPU-equivalent container — a shorter budget reports a working
 * browser as broken. */
export async function checkChrome(timeoutMs = 90000): Promise<{ ok: true; version: string } | { ok: false; reason: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const browser = await Promise.race([
      getBrowser(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Chrome did not start within ${Math.round(timeoutMs / 1000)}s`)), timeoutMs);
      }),
    ]);
    return { ok: true, version: browser.version() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: /Executable doesn't exist|ENOENT/i.test(message)
        ? "Google Chrome is not installed on this host"
        : /session deleted|Target closed|crash/i.test(message)
          ? "Chrome is installed but cannot start (usually not enough /dev/shm — the container must pass --disable-dev-shm-usage)"
          : message.slice(0, 200),
    };
  } finally {
    // Clear the timer so a slow-but-successful launch doesn't leave a pending
    // rejection behind. The browser itself is deliberately left open: the next
    // export adopts it instead of paying the launch cost twice.
    if (timer) clearTimeout(timer);
  }
}
