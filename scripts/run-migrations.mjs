// Applies supabase/migrations/*.sql via the Supabase Management API (HTTPS),
// then seeds the Telegram bot token into Supabase Vault. Used instead of a
// direct Postgres connection because the direct host is IPv6-only and this
// network has no IPv6 route.
//
// Usage: node --env-file=.env.local scripts/run-migrations.mjs
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "supabase", "migrations");

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!accessToken || !supabaseUrl) {
  throw new Error("SUPABASE_ACCESS_TOKEN and NEXT_PUBLIC_SUPABASE_URL must be set (load .env.local)");
}
const projectRef = new URL(supabaseUrl).hostname.split(".")[0];

async function runQuery(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`Query failed (${res.status}): ${typeof body === "string" ? body : JSON.stringify(body)}`);
  }
  return body;
}

console.log(`Project: ${projectRef}`);
console.log("Testing connectivity with `select 1 as ok`...");
console.log(await runQuery("select 1 as ok;"));

const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
for (const file of files) {
  console.log(`\nApplying ${file} ...`);
  const sql = readFileSync(join(migrationsDir, file), "utf8");
  const result = await runQuery(sql);
  console.log("  done:", JSON.stringify(result).slice(0, 300));
}

if (botToken) {
  console.log("\nSeeding telegram_bot_token into Vault...");
  const existing = await runQuery("select id from vault.decrypted_secrets where name = 'telegram_bot_token' limit 1;");
  const escaped = botToken.replace(/'/g, "''");
  if (Array.isArray(existing) && existing.length > 0) {
    await runQuery(`select vault.update_secret('${existing[0].id}', '${escaped}');`);
    console.log("Updated existing telegram_bot_token secret in Vault");
  } else {
    await runQuery(`select vault.create_secret('${escaped}', 'telegram_bot_token', 'Telegram bot token for NCLEXBase publishing');`);
    console.log("Created telegram_bot_token secret in Vault");
  }
} else {
  console.log("TELEGRAM_BOT_TOKEN not set — skipping Vault seed");
}

console.log("\nAll migrations applied.");
