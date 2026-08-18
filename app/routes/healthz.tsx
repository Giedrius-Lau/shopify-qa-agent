import { kickScanWorker } from "../scan-jobs.server";
import { kickScheduleWorker } from "../schedules.server";

export async function loader() {
  if (process.env.SKIP_SCAN_WORKER !== "true") kickScanWorker();
  if (process.env.SKIP_SCAN_WORKER !== "true") kickScheduleWorker();
  return Response.json({ status: "ok", version: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? "local" });
}
