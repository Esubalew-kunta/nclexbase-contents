import { beforeEach, describe, expect, it, vi } from "vitest";

// Playwright is stubbed: these tests are about when the pool retires a browser,
// which must hold without launching Chrome 26 times.
const launched: FakeBrowser[] = [];

class FakeBrowser {
  closed = false;
  connected = true;
  readonly handlers: Record<string, () => void> = {};
  on(event: string, handler: () => void) {
    this.handlers[event] = handler;
  }
  isConnected() {
    return this.connected;
  }
  async close() {
    this.closed = true;
    this.connected = false;
    this.handlers.disconnected?.();
  }
}

vi.mock("playwright", () => ({
  chromium: {
    launch: async () => {
      const browser = new FakeBrowser();
      launched.push(browser);
      return browser;
    },
  },
}));

const { acquireBrowser, releaseBrowser, getBrowser, __browserPoolStateForTests, __resetBrowserPoolForTests } = await import("./browser");

/** One render's worth of work: take the browser, do something, hand it back. */
async function render(): Promise<FakeBrowser> {
  const browser = (await acquireBrowser()) as unknown as FakeBrowser;
  releaseBrowser();
  return browser;
}

describe("browser pool", () => {
  beforeEach(async () => {
    // The pool is module state: without this, a test inherits the previous
    // test's quota and recycles at a point it never set up.
    await __resetBrowserPoolForTests();
    launched.length = 0;
  });

  it("reuses one browser across renders", async () => {
    const first = await render();
    const second = await render();
    expect(second).toBe(first);
    expect(launched).toHaveLength(1);
  });

  it("retires the browser once it has served its quota", async () => {
    let last = await render();
    for (let i = 0; i < 25; i++) last = await render();
    expect(launched.length).toBeGreaterThan(1);
    expect(launched[0].closed).toBe(true);
    expect(last).toBe(launched[launched.length - 1]);
  });

  it("never closes a browser while a render is still using it", async () => {
    // Stop one short of the quota, then start a render and leave it open, so
    // the browser crosses its quota while that render is still using it —
    // closing underneath it is what produced `page.goto: net::ERR_ABORTED`.
    for (let i = 0; i < 24; i++) await render();
    const inFlight = (await acquireBrowser()) as unknown as FakeBrowser;

    // A second render arriving while the first is still open must not retire
    // the browser the first one is rendering in.
    const concurrent = (await acquireBrowser()) as unknown as FakeBrowser;
    expect(inFlight.closed).toBe(false);
    expect(concurrent).toBe(inFlight);

    releaseBrowser();
    releaseBrowser();
    expect(inFlight.closed).toBe(false);

    // Once idle, the next render retires it.
    await render();
    expect(inFlight.closed).toBe(true);
  });

  it("does not let health checks count towards the quota", async () => {
    // getBrowser is what the health probe calls. Render polls it constantly,
    // so if it advanced the quota the browser would be recycled on timers
    // rather than on work actually done.
    const before = __browserPoolStateForTests().rendersServed;
    for (let i = 0; i < 50; i++) await getBrowser();
    expect(__browserPoolStateForTests().rendersServed).toBe(before);
    expect(launched).toHaveLength(1);
  });

  it("relaunches after the browser disconnects", async () => {
    const first = await render();
    await first.close();
    const second = await render();
    expect(second).not.toBe(first);
  });
});
