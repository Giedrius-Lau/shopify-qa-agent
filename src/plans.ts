export type PlanTier = "free" | "paid";

export const PLAN_LIMITS = {
  free: { scansPerMonth: 25, activeSchedules: 1 },
  paid: { scansPerMonth: 1_000, activeSchedules: 20 },
} as const;

export function isPlanTier(value: unknown): value is PlanTier {
  return value === "free" || value === "paid";
}

export function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function remainingUsage(limit: number, used: number): number {
  return Math.max(0, limit - used);
}
