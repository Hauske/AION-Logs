/** 1234 -> "1,234"; 12345 -> "12.3k"; 1234567 -> "1.23m"; 1.2e9 -> "1.20b". */
export function abbr(value: number): string {
  const n = Number(value) || 0;
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + "b";
  if (a >= 1e6) return (n / 1e6).toFixed(2) + "m";
  if (a >= 1e4) return (n / 1e3).toFixed(1) + "k";
  return Math.round(n).toLocaleString("en-US");
}

export function full(value: number): string {
  return Math.round(Number(value) || 0).toLocaleString("en-US");
}

/** Share as "35.0"; no % sign, the column header carries it. */
export function pct(part: number, whole: number, digits = 1): string {
  if (!(whole > 0)) return "0.0";
  return ((part / whole) * 100).toFixed(digits);
}

/** 150553 -> "02:30". */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function dateTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function dayLabel(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export function timeOfDay(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** 62500 -> "1:02.5", for cast times. */
export function castTime(ms: number): string {
  const total = Math.max(0, Number(ms) || 0) / 1000;
  const m = Math.floor(total / 60);
  return `${m}:${(total - m * 60).toFixed(1).padStart(4, "0")}`;
}
