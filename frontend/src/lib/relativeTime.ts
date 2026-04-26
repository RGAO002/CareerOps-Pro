// frontend/src/lib/relativeTime.ts
/**
 * Format a past timestamp as a short relative phrase.
 * Returns "just now" / "3 sec ago" / "5 min ago" / "2 hr ago" / "yesterday" / "Apr 21".
 */
export function formatRelative(ts: number, now: number = Date.now()): string {
  const diffMs = now - ts;
  if (diffMs < 5_000) return "just now";
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec} sec ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day} days ago`;
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
