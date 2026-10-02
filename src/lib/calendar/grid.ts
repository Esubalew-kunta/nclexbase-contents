/** Builds a Mon-Sun month grid (array of weeks, each 7 date strings
 * "YYYY-MM-DD", padded with the trailing/leading days of neighboring months
 * so every week is complete) — pure date-string math, no timezone library. */
export function buildMonthGrid(year: number, month: number /* 1-12 */): { date: string; inMonth: boolean }[][] {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const firstWeekday = (firstOfMonth.getUTCDay() + 6) % 7; // 0=Mon..6=Sun
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const cells: { date: string; inMonth: boolean }[] = [];

  for (let i = firstWeekday; i > 0; i--) {
    const d = new Date(Date.UTC(year, month - 1, 1 - i));
    cells.push({ date: toDateStr(d), inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: toDateStr(new Date(Date.UTC(year, month - 1, day))), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1];
    const [y, m, d] = last.date.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    cells.push({ date: toDateStr(next), inMonth: false });
  }

  const weeks: { date: string; inMonth: boolean }[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function toDateStr(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const MONTH_LABELS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
