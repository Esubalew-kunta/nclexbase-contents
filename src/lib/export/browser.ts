import { chromium, type Browser } from "playwright";

// Launching Chromium takes a second or two, so we keep one instance alive
// for the life of the dev server process instead of relaunching it per
// export request. If it dies (crashes, gets orphaned by a dev-server
// restart, etc.) we notice and relaunch rather than handing back a dead
// browser forever.
let browserPromise: Promise<Browser> | null = null;

function launch(): Promise<Browser> {
  // "channel: chrome" uses the machine's installed Chrome instead of
  // Playwright's bundled chrome-headless-shell — the bundled shell was
  // failing to launch under Node's child_process pipe plumbing on this
  // machine (STATUS_DLL_INIT_FAILED) even though it ran fine standalone.
  const promise = chromium.launch({ headless: true, channel: "chrome" }).catch((err) => {
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
