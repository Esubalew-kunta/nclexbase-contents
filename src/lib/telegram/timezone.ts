// Timezone math using only the Intl API already built into Node/the browser
// — no extra date library. The user's configured timezone is authoritative
// (spec section 35): we never read the browser's/server's local timezone.

function getZonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) map[part.type] = part.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: map.hour === "24" ? 0 : Number(map.hour),
    minute: Number(map.minute),
  };
}

/** Converts a wall-clock date + time in `timeZone` to the correct UTC
 * instant, by iterating against Intl's own tz data until the guess
 * converges (handles any offset, including DST, without a bundled tz db). */
export function zonedDateTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute, 0);

  let guess = target;
  for (let i = 0; i < 3; i++) {
    const parts = getZonedParts(new Date(guess), timeZone);
    const guessedWallClockAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
    const diff = guessedWallClockAsUtc - target;
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess);
}

/** Formats a UTC instant as "YYYY-MM-DD" in the given timezone — used to
 * figure out which calendar day a scheduled post falls on for that user. */
export function utcToZonedDateStr(date: Date, timeZone: string): string {
  const p = getZonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function utcToZonedTimeStr(date: Date, timeZone: string): string {
  const p = getZonedParts(date, timeZone);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}
