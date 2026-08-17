import { kickScanWorker } from "../scan-jobs.server";

export async function loader() {
  if (process.env.SKIP_SCAN_WORKER !== "true") kickScanWorker();
  return Response.json({ status: "ok", version: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? "local" });
}
