import { randomUUID } from "node:crypto";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData, useNavigation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { parseRepeatableScanConfiguration } from "../../src/scan-configuration";
import { isScanFrequency, nextScheduledRun } from "../../src/schedule";
import "../globals.css";

type ActionData = { error?: string; success?: string };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [schedules, scans] = await Promise.all([
    prisma.scanSchedule.findMany({ where: { shop: session.shop }, orderBy: { createdAt: "desc" } }),
    prisma.scan.findMany({ where: { shop: session.shop, configurationJson: { not: null } }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, liveUrl: true, createdAt: true } }),
  ]);
  return { schedules, scans: scans.map((scan) => ({ ...scan, label: new URL(scan.liveUrl).pathname || "/" })) };
};

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionData> => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");
  const id = form.get("id");
  if (intent === "toggle" && typeof id === "string") {
    const schedule = await prisma.scanSchedule.findFirst({ where: { id, shop: session.shop } });
    if (!schedule) return { error: "Schedule not found." };
    await prisma.scanSchedule.update({ where: { id }, data: { enabled: !schedule.enabled, nextRunAt: !schedule.enabled && isScanFrequency(schedule.frequency) ? nextScheduledRun(schedule.frequency, schedule.hourUtc) : schedule.nextRunAt } });
    return { success: schedule.enabled ? "Schedule paused." : "Schedule resumed." };
  }
  if (intent === "delete" && typeof id === "string") {
    await prisma.scanSchedule.deleteMany({ where: { id, shop: session.shop } });
    return { success: "Schedule deleted." };
  }
  const scanId = form.get("scanId");
  const name = form.get("name");
  const frequency = form.get("frequency");
  const hourUtc = Number(form.get("hourUtc"));
  if (typeof scanId !== "string" || typeof name !== "string" || !name.trim() || name.trim().length > 80 || !isScanFrequency(frequency)) return { error: "Complete all schedule fields." };
  try {
    const scan = await prisma.scan.findFirst({ where: { id: scanId, shop: session.shop }, select: { configurationJson: true } });
    if (!scan?.configurationJson) return { error: "Select a reusable scan." };
    const configuration = parseRepeatableScanConfiguration(scan.configurationJson);
    await prisma.scanSchedule.create({ data: { id: randomUUID(), shop: session.shop, name: name.trim(), configurationJson: JSON.stringify(configuration), frequency, hourUtc, nextRunAt: nextScheduledRun(frequency, hourUtc) } });
    return { success: "Schedule created." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Schedule could not be created." };
  }
};

export default function Schedules() {
  const { schedules, scans } = useLoaderData<typeof loader>();
  const result = useActionData<ActionData>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  return <s-page heading="Schedules"><div className="qa-main schedule-page"><header className="history-heading"><div><span className="eyebrow">Automatic QA</span><h1>Scheduled scans</h1><p>Rerun a trusted comparison daily or weekly. Times are shown in UTC.</p></div><Link className="new-scan-link" to="/app">New comparison</Link></header>{result?.error && <div className="error" role="alert">{result.error}</div>}{result?.success && <div className="success" role="status">{result.success}</div>}<section className="schedule-create"><h2>Create schedule</h2>{scans.length ? <Form method="post" className="schedule-form"><label>Name<input name="name" maxLength={80} required placeholder="Homepage release check"/></label><label>Comparison<select name="scanId" required>{scans.map((scan) => <option key={scan.id} value={scan.id}>{scan.label} · {new Date(scan.createdAt).toLocaleDateString()}</option>)}</select></label><label>Frequency<select name="frequency"><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label><label>Hour (UTC)<input name="hourUtc" type="number" min={0} max={23} defaultValue={8} required/></label><button disabled={busy} type="submit">{busy ? "Saving…" : "Create schedule"}</button></Form> : <p className="empty">Run a new comparison first. New scans can be reused as schedules.</p>}</section><section className="schedule-list"><h2>Active plans</h2>{schedules.length === 0 ? <p className="empty">No schedules yet.</p> : schedules.map((schedule) => <article key={schedule.id} className="schedule-row"><div><span className={`status-pill ${schedule.enabled ? "completed" : ""}`}>{schedule.enabled ? "Active" : "Paused"}</span><h3>{schedule.name}</h3><p>{schedule.frequency === "daily" ? "Daily" : "Weekly"} at {String(schedule.hourUtc).padStart(2, "0")}:00 UTC · Next {new Date(schedule.nextRunAt).toLocaleString()}</p>{schedule.lastError && <p className="history-error">{schedule.lastError}</p>}</div><div className="history-actions">{schedule.lastScanId && <Link className="report-link secondary" to={`/app?scan=${encodeURIComponent(schedule.lastScanId)}`}>Last report</Link>}<Form method="post"><input type="hidden" name="id" value={schedule.id}/><button name="intent" value="toggle" disabled={busy}>{schedule.enabled ? "Pause" : "Resume"}</button></Form><Form method="post"><input type="hidden" name="id" value={schedule.id}/><button className="danger-button" name="intent" value="delete" disabled={busy}>Delete</button></Form></div></article>)}</section><p className="repeat-privacy">Scheduled scans never store storefront passwords and do not send reports to AI. Password-protected storefronts must be scanned manually.</p></div></s-page>;
}

export function ErrorBoundary() { return boundary.error(useRouteError()); }
export const headers: HeadersFunction = (args) => boundary.headers(args);
