import prisma from "./db.server";
import { unauthenticated } from "./shopify.server";
import { enqueueScan, kickScanWorker } from "./scan-jobs.server";
import { getStoreThemes } from "./themes.server";
import { parseRepeatableScanConfiguration } from "../src/scan-configuration";
import { isScanFrequency, nextScheduledRun } from "../src/schedule";
import { requireScanCapacity } from "./usage.server";

declare global {
  // eslint-disable-next-line no-var
  var scheduleWorkerPromise: Promise<void> | undefined;
}

async function processDueSchedules(): Promise<void> {
  const now = new Date();
  const due = await prisma.scanSchedule.findMany({ where: { enabled: true, nextRunAt: { lte: now } }, orderBy: { nextRunAt: "asc" }, take: 10 });
  for (const schedule of due) {
    if (!isScanFrequency(schedule.frequency)) continue;
    const claimed = await prisma.scanSchedule.updateMany({
      where: { id: schedule.id, enabled: true, nextRunAt: schedule.nextRunAt },
      data: { nextRunAt: nextScheduledRun(schedule.frequency, schedule.hourUtc, now), lastError: null },
    });
    if (!claimed.count) continue;
    try {
      await requireScanCapacity(schedule.shop);
      const configuration = parseRepeatableScanConfiguration(schedule.configurationJson);
      const { admin } = await unauthenticated.admin(schedule.shop);
      const themes = await getStoreThemes(admin);
      const baseline = themes.find((theme) => theme.id === configuration.baselineThemeId);
      const comparison = themes.find((theme) => theme.id === configuration.comparisonThemeId && theme.role === "UNPUBLISHED");
      if (!baseline || !comparison) throw new Error("A scheduled theme is no longer available.");
      const scanId = await enqueueScan(schedule.shop, { ...configuration, baselineThemeRole: baseline.role, explainWithAi: false });
      await prisma.scanSchedule.update({ where: { id: schedule.id }, data: { lastRunAt: now, lastScanId: scanId } });
      kickScanWorker();
    } catch (error) {
      await prisma.scanSchedule.update({ where: { id: schedule.id }, data: { lastRunAt: now, lastError: error instanceof Error ? error.message : "Scheduled scan failed." } });
    }
  }
}

export function kickScheduleWorker(): void {
  if (global.scheduleWorkerPromise) return;
  global.scheduleWorkerPromise = processDueSchedules().catch((error) => {
    console.error("Schedule worker could not check due scans:", error);
  }).finally(() => { global.scheduleWorkerPromise = undefined; });
}
