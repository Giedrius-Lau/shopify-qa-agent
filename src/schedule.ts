export type ScanFrequency = "daily" | "weekly";

export function nextScheduledRun(frequency: ScanFrequency, hourUtc: number, now = new Date()): Date {
  if (!Number.isInteger(hourUtc) || hourUtc < 0 || hourUtc > 23) throw new Error("Select a valid UTC hour.");
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(hourUtc);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  if (frequency === "weekly") {
    const targetDay = now.getUTCDay();
    while (next.getUTCDay() !== targetDay || next <= now) next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

export function isScanFrequency(value: unknown): value is ScanFrequency {
  return value === "daily" || value === "weekly";
}
