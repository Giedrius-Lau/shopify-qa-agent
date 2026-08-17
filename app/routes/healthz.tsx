import { kickScanWorker } from "../scan-jobs.server";

export async function loader() {
  kickScanWorker();
  return Response.json({ status: "ok" });
}
