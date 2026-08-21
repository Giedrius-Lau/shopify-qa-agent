import { timingSafeEqual } from "node:crypto";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { kickRetentionWorker } from "../retention.server";
import { kickScanWorker } from "../scan-jobs.server";
import { kickScheduleWorker } from "../schedules.server";

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!expected || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

function run(request: Request): Response {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  kickScheduleWorker();
  kickScanWorker();
  kickRetentionWorker();
  return Response.json({ accepted: true }, { status: 202 });
}

export async function loader({ request }: LoaderFunctionArgs) { return run(request); }
export async function action({ request }: ActionFunctionArgs) { return run(request); }
