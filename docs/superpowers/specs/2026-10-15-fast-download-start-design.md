# Fast Download Start Design

## Problem

PNG, combined-PNG, and ZIP export clients use `fetch()` and wait for the full
response body before calling `downloadBlob()`. The browser therefore does not
show a download while the server is rendering. The PNG endpoint also captures
every slide before returning one requested slide. ZIP rendering is sequential,
so larger exports can take considerably longer than a single image.

The Render service uses its free plan and can sleep. A cold start is outside
this change: the five-second target applies while the service is awake.

The local hydration warning is a separate issue. Its reported
`data-scribe-recorder-ready` attribute is added to `<html>` before hydration by
a browser extension; it is not rendered by the application's root layout.

## Goal and non-goals

- For all PNG, combined PNG, and ZIP downloads, make the browser's download
  begin within five seconds of the user's action when the service is awake.
- Continue generating the same full-quality slide images and preserve the
  question-bank save behavior.
- Report export progress and render failures explicitly. A failed render must
  not be presented as a successful, complete download.
- Do not promise five-second completion of the file itself. Rendering,
  compression, and transfer can continue after the download appears.
- Do not change the Render plan or attempt to suppress warnings caused by
  browser extensions.

## Approaches considered

1. **Server-streamed downloads (selected).** Open a native browser download
   promptly and stream the rendered output as it becomes available. This keeps
   the existing server-side Playwright renderer and image fidelity.
2. **Browser-side rendering.** Capture the visible preview in the user's
   browser. This could avoid server work, but adds capture tooling and risks
   differences from the existing Playwright output.
3. **Cached or pre-rendered files.** Serve repeat exports quickly, but cannot
   meet the first-export start target without additional rendering and cache
   invalidation behavior.

## Design

Use an asynchronous export job per user-triggered export. The client submits
the existing export payload and receives a job identifier quickly. It then
opens the job's native download URL immediately, rather than waiting for a
`fetch()` response to become a complete `Blob`. A status endpoint reports
rendering, streaming, completion, or a specific failure while the browser's
download is in progress.

The job renderer uses the existing shared Chrome instance and runs one render
at a time to avoid overloading the free Render instance. Single-slide PNG
exports capture only the requested slide. Combined PNG exports retain their
single combined capture. ZIP exports add each question's rendered slides to a
streaming ZIP writer as they finish, rather than waiting to buffer the entire
archive before starting its response.

Keep job state and any temporary output bounded and short-lived. A job lost to
a process restart must surface as a failed/incomplete download with an
actionable status, not remain in a permanent "Rendering…" state. Existing bank
save behavior remains best-effort and must not delay the download. Render
errors, invalid requests, and stream failures are surfaced in the UI; they
must not be converted into success-shaped files.

The five-second measurement is the time until the browser reports the download
as started, measured from the click, against an already-awake service. The
download may show limited byte progress until the relevant render output is
ready. Render cold-start time and total export completion time are measured
separately and are not included in that target.

## Hydration warning

Do not add `suppressHydrationWarning` to the root layout for the
extension-injected attribute. Verify the app in a clean browser profile with
extensions disabled; the warning should not appear there. A warning that
appears in an extension-enabled profile is environmental and should be
explained as such.

## Validation

- Add focused tests for selected-slide capture, export job state transitions,
  download headers and streaming, ZIP entry contents, and surfaced render
  failures.
- Verify the PNG bytes and slide content remain equivalent to the existing
  exports, and the ZIP still contains the expected slide filenames.
- In a browser, measure click-to-download-start for each export type against an
  awake local server and an awake Render service; each must be at most five
  seconds. Confirm the UI distinguishes rendering/streaming from completion.
- Run the production build, type checks, and relevant tests.
- Compare hydration behavior in a clean profile and in the extension-enabled
  profile without suppressing the warning.

## Accepted constraints

The user selected the server-streamed approach, selected all download types,
requires first-time downloads to start within five seconds, and accepted that
the target excludes Render cold starts while keeping the free plan. The target
is download start, not file completion.
