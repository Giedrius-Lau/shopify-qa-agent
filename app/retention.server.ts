import { rm } from "node:fs/promises";
import path from "node:path";
import prisma from "./db.server";
import { deletePersistedArtifacts } from "./artifact-storage.server";
import { shopArtifactKey } from "./scan.server";
import { retentionDays } from "../src/retention-policy";

export { retentionDays } from "../src/retention-policy";

declare global {
  // eslint-disable-next-line no-var
  var retentionWorkerPromise: Promise<void> | undefined;
  // eslint-disable-next-line no-var
  var retentionLastRunAt: number | undefined;
}

async function removeScanArtifacts(shop: string, scanId: string): Promise<void> {
  const shopKey = shopArtifactKey(shop);
  await deletePersistedArtifacts(`${shopKey}/${scanId}/`);
  await rm(path.resolve("scan-artifacts", shopKey, scanId), { recursive: true, force: true });
}

export async function deleteShopData(shop: string): Promise<void> {
  const scans = await prisma.scan.findMany({ where: { shop }, select: { id: true } });
  try {
    await deletePersistedArtifacts(`${shopArtifactKey(shop)}/`);
    await rm(path.resolve("scan-artifacts", shopArtifactKey(shop)), { recursive: true, force: true });
  } catch (error) {
    // Database deletion still revokes authenticated access to any orphaned object.
    // Log the storage error so operators can remove the prefix manually.
    console.error(`Could not delete artifacts for uninstalled shop ${shop}:`, error);
  }
  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { shop } }),
    prisma.scanSchedule.deleteMany({ where: { shop } }),
    prisma.scan.deleteMany({ where: { shop } }),
    prisma.shopNotificationSettings.deleteMany({ where: { shop } }),
    prisma.shopMember.deleteMany({ where: { shop } }),
    prisma.shopPlan.deleteMany({ where: { shop } }),
    prisma.session.deleteMany({ where: { shop } }),
  ]);
  console.log(`Deleted data for uninstalled shop ${shop}: ${scans.length} scans.`);
}

async function cleanExpiredScans(): Promise<void> {
  const cutoff = new Date(Date.now() - retentionDays() * 86_400_000);
  const expired = await prisma.scan.findMany({ where: { createdAt: { lt: cutoff }, status: { in: ["completed", "failed"] } }, take: 100, select: { id: true, shop: true } });
  for (const scan of expired) {
    await removeScanArtifacts(scan.shop, scan.id);
    await prisma.$transaction([
      prisma.notification.deleteMany({ where: { scanId: scan.id } }),
      prisma.scanSchedule.updateMany({ where: { lastScanId: scan.id }, data: { lastScanId: null } }),
      prisma.scan.deleteMany({ where: { id: scan.id } }),
    ]);
  }
}

export function kickRetentionWorker(): void {
  if (global.retentionWorkerPromise) return;
  if (global.retentionLastRunAt && Date.now() - global.retentionLastRunAt < 3_600_000) return;
  global.retentionLastRunAt = Date.now();
  global.retentionWorkerPromise = cleanExpiredScans()
    .catch((error) => console.error("Retention cleanup failed:", error))
    .finally(() => { global.retentionWorkerPromise = undefined; });
}
