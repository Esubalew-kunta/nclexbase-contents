# syntax=docker/dockerfile:1

# NCLEXBase content generator.
#
# The image carries one SYSTEM binary the app needs at runtime and that npm
# cannot supply: Google Chrome, which Playwright drives to render the slide
# images. That is the reason this app cannot run on a plain serverless platform
# — the host has to be able to install packages, which is why we deploy to
# Render with a Dockerfile.
#
# Playwright's own bundled browser is deliberately NOT downloaded: the code asks
# for the `chrome` channel (the installed Google Chrome), so pulling another
# ~400 MB copy would only bloat the image and lengthen every build.

# ---------------------------------------------------------------- deps
# Dependencies are installed in their own layer so a code-only change doesn't
# reinstall the tree.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Skip the Playwright browser download; the system Chrome is used instead.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci

# ---------------------------------------------------------------- build
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm run build

# ---------------------------------------------------------------- runtime
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# Render sets PORT; Next's standalone server honours it.
ENV PORT=10000
ENV HOSTNAME=0.0.0.0

# Chrome, plus the shared libraries it links against. Without these the image
# builds fine and then every export fails at runtime with a linker error, which
# is a slow way to find out.
#
# One apt-get update for the whole step. Splitting it into update/install/update
# means walking the Debian mirrors three times, which added several minutes to
# every build for no benefit — Chrome's own .deb has no dependencies beyond what
# is already being installed here.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      wget \
      gnupg \
      fonts-liberation \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libatspi2.0-0 \
      libcairo2 \
      libcups2 \
      libdbus-1-3 \
      libdrm2 \
      libgbm1 \
      libglib2.0-0 \
      libnspr4 \
      libnss3 \
      libpango-1.0-0 \
      libx11-6 \
      libxcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxext6 \
      libxfixes3 \
      libxkbcommon0 \
      libxrandr2 \
    ; \
    wget -q -O /tmp/chrome.deb \
      https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    ; \
    apt-get install -y --no-install-recommends /tmp/chrome.deb \
    ; \
    rm -f /tmp/chrome.deb \
    ; \
    rm -rf /var/lib/apt/lists/*

# Standalone output: a self-contained server plus only the node_modules that
# are actually imported.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Playwright has to be copied whole, on top of whatever standalone traced.
# Next's standalone tracer follows imported JavaScript but not a package's
# non-JS assets, so it omits playwright-core/browsers.json (and the rest of the
# browser registry). Without this the app boots fine and then every single
# export fails with "Cannot find module .../playwright-core/browsers.json" —
# which is exactly the kind of failure that is invisible until you try to use
# the feature.
COPY --from=builder /app/node_modules/playwright ./node_modules/playwright
COPY --from=builder /app/node_modules/playwright-core ./node_modules/playwright-core

ENV TMPDIR=/tmp

# Run as the unprivileged user node (already present in the base image) rather
# than root, so Chrome doesn't need --no-sandbox. Enabling it would be a real
# security downgrade on a host that is reachable from the internet.
USER node

EXPOSE 10000

CMD ["node", "server.js"]
