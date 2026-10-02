// Prints the environment variables Render needs, read straight from your local
// .env.local.
//
// WHY THIS EXISTS: those values are secrets. To paste them into Render you have
// to see them, and the wrong way to get them is to paste them into a chat, an
// AI assistant, a commit, or a public repo. Running this yourself prints them to
// YOUR terminal only.
//
// Usage:
//   node scripts/render-env.mjs            print the KEY=value pairs to paste
//   node scripts/render-env.mjs --check    verify what's present, print no values
//
// Then in Render: New -> Blueprint, pick the repo, Apply, and paste each value
// into the matching Environment variable.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env.local");

/** Required by the running app. Paste all of these into Render. */
const REQUIRED = [
  ["NEXT_PUBLIC_SUPABASE_URL", "Supabase project URL"],
  ["SUPABASE_SERVICE_ROLE_KEY", "RLS-bypassing key the server uses (not the anon key)"],
  ["TELEGRAM_BOT_TOKEN", "Bot token, also already in Supabase Vault"],
  ["TELEGRAM_CHANNEL", "Channel @username or numeric chat id"],
  ["PRINT_TOKEN_SECRET", "Long random string — MUST be identical on every instance"],
];

/** Present in .env.local but deliberately NOT sent to the server: they are only
 * used by the local migration script, and shipping them would widen the blast
 * radius of a leak for no benefit. */
const LOCAL_ONLY = [
  ["SUPABASE_ACCESS_TOKEN", "only for scripts/run-migrations.mjs"],
  ["SUPABASE_ANON_KEY", "unused by the app — the server uses the service-role key"],
  ["SUPABASE_DB_PASSWORD", "the direct DB is IPv6-only and unreachable from here"],
];

const checkOnly = process.argv.includes("--check");

function parse(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !m[2].startsWith("#")) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

let env;
try {
  env = parse(readFileSync(envPath, "utf8"));
} catch {
  console.error("Could not read .env.local — run this from the project folder.");
  process.exit(1);
}

const missing = REQUIRED.filter(([k]) => !env[k]?.trim()).map(([k]) => k);
const optionalMissing = REQUIRED.filter(([k]) => env[k] && !env[k].trim()).map(([k]) => k);

// ---------------------------------------------------------------- --check mode
if (checkOnly) {
  console.log("Render environment check (no values shown)\n");
  for (const [key, why] of REQUIRED) {
    const present = Boolean(env[key]?.trim());
    console.log(`  ${present ? "present" : "MISSING"}  ${key.padEnd(26)} ${why}`);
  }
  console.log("\nNot sent to Render (local migration tooling only):");
  for (const [key, why] of LOCAL_ONLY) {
    console.log(`  ${env[key]?.trim() ? "in .env.local" : "absent      "}  ${key.padEnd(26)} ${why}`);
  }
  if (missing.length) {
    console.log(`\n${missing.length} required variable(s) missing from .env.local.`);
    process.exit(1);
  }
  console.log("\nAll required variables present.");
  process.exit(0);
}

// ----------------------------------------------------------------- print mode
if (missing.length) {
  console.error(`Cannot print: ${missing.join(", ")} missing from .env.local.`);
  console.error("Add them first, or re-run with --check to see the full picture.");
  process.exit(1);
}

console.log("Paste each KEY=value pair below into the matching Environment variable on Render.\n");
for (const [key] of REQUIRED) {
  console.log(`${key}=${env[key]}`);
  console.log("");
}

console.log("Deliberately NOT on Render — keep these out of the server:");
for (const [key, why] of LOCAL_ONLY) {
  console.log(`  ${key.padEnd(26)} ${why}`);
}

console.log("\nAfter deploying, open <your-app-url>/api/health and confirm every check is ready.");
console.log("Then check the Telegram settings screen — it shows the same health summary.");