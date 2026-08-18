import prisma from "./db.server";
import { isPlanTier, monthStart, PLAN_LIMITS, remainingUsage, type PlanTier } from "../src/plans";

export async function syncShopPlan(shop: string, hasActivePayment: boolean, planHandle?: string | null): Promise<void> {
  await prisma.shopPlan.upsert({
    where: { shop },
    create: { shop, tier: hasActivePayment ? "paid" : "free", planHandle: hasActivePayment ? planHandle ?? null : null, lastCheckedAt: new Date() },
    update: { tier: hasActivePayment ? "paid" : "free", planHandle: hasActivePayment ? planHandle ?? undefined : null, lastCheckedAt: new Date() },
  });
}

export async function shopUsage(shop: string) {
  const [savedPlan, scansThisMonth, activeSchedules] = await Promise.all([
    prisma.shopPlan.findUnique({ where: { shop } }),
    prisma.scan.count({ where: { shop, createdAt: { gte: monthStart() } } }),
    prisma.scanSchedule.count({ where: { shop, enabled: true } }),
  ]);
  const tier: PlanTier = isPlanTier(savedPlan?.tier) ? savedPlan.tier : "free";
  const limits = PLAN_LIMITS[tier];
  return { tier, planHandle: savedPlan?.planHandle ?? null, scansThisMonth, activeSchedules, limits, scansRemaining: remainingUsage(limits.scansPerMonth, scansThisMonth), schedulesRemaining: remainingUsage(limits.activeSchedules, activeSchedules) };
}

export async function requireScanCapacity(shop: string): Promise<void> {
  const usage = await shopUsage(shop);
  if (usage.scansRemaining <= 0) throw new Error(`Monthly scan limit reached (${usage.limits.scansPerMonth}). Open Plans to upgrade.`);
}

export async function requireScheduleCapacity(shop: string): Promise<void> {
  const usage = await shopUsage(shop);
  if (usage.schedulesRemaining <= 0) throw new Error(`Active schedule limit reached (${usage.limits.activeSchedules}). Pause a schedule or open Plans to upgrade.`);
}
