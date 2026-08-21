import { kickScanWorker } from "../scan-jobs.server";
import { kickScheduleWorker } from "../schedules.server";
import { kickRetentionWorker } from "../retention.server";
import prisma from "../db.server";

export async function loader() {
  if (process.env.SKIP_SCAN_WORKER !== "true") {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      console.error("Health check database probe failed:", error);
      return Response.json({ status: "unavailable", database: "unreachable" }, { status: 503 });
    }
  }
  if (process.env.SKIP_SCAN_WORKER !== "true") kickScanWorker();
  if (process.env.SKIP_SCAN_WORKER !== "true") kickScheduleWorker();
  if (process.env.SKIP_SCAN_WORKER !== "true") kickRetentionWorker();
  return Response.json({ status: "ok", version: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? "local" });
}
