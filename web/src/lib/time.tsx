import { useSyncExternalStore } from "react";

const timeOpts: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
};

// One shared minute ticker for every rendered timestamp, so relative labels
// ("Yesterday at ...") roll over as time passes without a timer per message.
let now = Date.now();
const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(fn: () => void) {
  subs.add(fn);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      subs.forEach((f) => f());
    }, 60_000);
  }
  return () => {
    subs.delete(fn);
    if (!subs.size && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

// formatTime renders a unix-seconds timestamp relative to nowMs, in the
// viewer's local timezone: "09:30", "Yesterday at 09:30", "Oct 12, 09:30",
// or "Jan 3 2026, 09:30" for a previous year.
export function formatTime(ts: number, nowMs: number) {
  const d = new Date(ts * 1000);
  const time = d.toLocaleTimeString([], timeOpts);
  const today = new Date(nowMs);
  const days = Math.round((startOfDay(today) - startOfDay(d)) / 86_400_000);
  if (days <= 0) return time;
  if (days === 1) return `Yesterday at ${time}`;
  if (d.getFullYear() === today.getFullYear()) {
    return `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
  }
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${d.getFullYear()}, ${time}`;
}

export function Time({ ts, className }: { ts: number; className?: string }) {
  const nowMs = useSyncExternalStore(subscribe, () => now);
  return (
    <time
      className={className}
      dateTime={new Date(ts * 1000).toISOString()}
      title={new Date(ts * 1000).toLocaleString()}
    >
      {formatTime(ts, nowMs)}
    </time>
  );
}

// dayKey identifies the viewer's local calendar day of a unix-seconds timestamp.
export const dayKey = (ts: number) => {
  const d = new Date(ts * 1000);
  return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
};

// formatDay renders "Oct 12, 2026".
export const formatDay = (ts: number) =>
  new Date(ts * 1000).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
