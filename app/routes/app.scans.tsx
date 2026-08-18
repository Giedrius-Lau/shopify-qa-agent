import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, Link, redirect, useActionData, useLoaderData, useNavigation, useRevalidator, useRouteError } from "react-router";
import { useEffect } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import type { EmbeddedScanResult } from "../scan.server";
import type { Severity } from "../../src/domain";
import "../globals.css";
import { enqueueScan, kickScanWorker } from "../scan-jobs.server";
import { getStoreThemes } from "../themes.server";
import { parseRepeatableScanConfiguration } from "../../src/scan-configuration";
import { requireScanPermission } from "../team.server";

type ActionData = { error: string } | undefined;

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionData | Response> => {
  const { admin, session } = await authenticate.admin(request);
  await requireScanPermission(session);
  const form = await request.formData();
  const sourceId = form.get("scanId");
  if (typeof sourceId !== "string") return { error: "Select a scan to run again." };
  const source = await prisma.scan.findFirst({ where: { id: sourceId, shop: session.shop }, select: { configurationJson: true } });
  if (!source?.configurationJson) return { error: "This older scan does not contain a reusable configuration." };
  try {
    const configuration = parseRepeatableScanConfiguration(source.configurationJson);
    const themes = await getStoreThemes(admin);
    const baseline = themes.find((theme) => theme.id === configuration.baselineThemeId);
    const comparison = themes.find((theme) => theme.id === configuration.comparisonThemeId && theme.role === "UNPUBLISHED");
    if (!baseline || !comparison) return { error: "One of the themes used by this scan is no longer available." };
    const scanId = await enqueueScan(session.shop, { ...configuration, baselineThemeRole: baseline.role, explainWithAi: false });
    kickScanWorker();
    return redirect(`/app/scans?started=${encodeURIComponent(scanId)}`);
  } catch {
    return { error: "This scan configuration could not be reused." };
  }
};

function pageLabel(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return url.pathname === "/" ? "Home page" : url.pathname;
  } catch {
    return "Storefront page";
  }
}

function issueCounts(resultJson: string | null): Record<Severity, number> | null {
  if (!resultJson) return null;
  try {
    const result = JSON.parse(resultJson) as EmbeddedScanResult;
    const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const page of result.preview) for (const issue of page.issues) counts[issue.severity] += 1;
    return counts;
  } catch {
    return null;
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  kickScanWorker();
  const scans = await prisma.scan.findMany({ where: { shop: session.shop }, orderBy: { createdAt: "desc" }, take: 50 });
  return { scans: scans.map((scan) => ({ id: scan.id, status: scan.status, page: pageLabel(scan.liveUrl), viewports: scan.viewports.split(",").filter(Boolean), createdAt: scan.createdAt, error: scan.error, counts: issueCounts(scan.resultJson), hasReport: scan.status === "completed" && Boolean(scan.resultJson), canRunAgain: Boolean(scan.configurationJson) })) };
};

export default function ScanHistory() {
  const { scans } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const repeatingId = navigation.formData?.get("scanId");
  const hasActiveScan = scans.some((scan) => scan.status === "queued" || scan.status === "running");
  useEffect(() => {
    if (!hasActiveScan) return;
    const timer = window.setInterval(() => revalidator.revalidate(), 1500);
    return () => window.clearInterval(timer);
  }, [hasActiveScan, revalidator]);
  return <s-page heading="Scan history"><div className="qa-main history-page"><header className="history-heading"><div><span className="eyebrow">Previous comparisons</span><h1>Your scans</h1><p>Open a completed comparison or rerun it with the same pages, themes, and viewports.</p></div><Link className="new-scan-link" to="/app">New comparison</Link></header>{actionData?.error && <div className="error" role="alert">{actionData.error}</div>}{scans.length === 0 ? <section className="history-empty"><h2>No scans yet</h2><p>Your completed theme comparisons will appear here.</p></section> : <section className="history-list">{scans.map((scan) => <article className="history-row" key={scan.id}><div className="history-main"><span className={`status-pill ${scan.status}`}>{scan.status === "completed" ? "Completed" : scan.status === "failed" ? "Failed" : "In progress"}</span><div><h2>{scan.page}</h2><p>{scan.viewports.length ? scan.viewports.map((viewport) => viewport === "desktop" ? "Desktop" : "Mobile").join(" + ") : "Code only"} · {new Date(scan.createdAt).toLocaleString()}</p></div></div>{scan.counts && <div className="history-counts"><span><strong>{scan.counts.critical}</strong> Critical</span><span><strong>{scan.counts.high}</strong> High</span><span><strong>{scan.counts.medium}</strong> Medium</span><span><strong>{scan.counts.low}</strong> Low</span></div>}<div className="history-actions">{scan.hasReport && <Link className="report-link secondary" to={`/app?scan=${encodeURIComponent(scan.id)}`}>View report</Link>}{scan.canRunAgain && <Form method="post"><input type="hidden" name="scanId" value={scan.id}/><button className="rerun-button" disabled={navigation.state !== "idle"} type="submit">{repeatingId === scan.id ? "Starting…" : "Run again"}</button></Form>}{!scan.hasReport && scan.error && <p className="history-error" title={scan.error}>Scan failed. Try running it again.</p>}</div></article>)}</section>}<p className="repeat-privacy">Run again never reuses a storefront password or AI consent. Enter a password or enable AI from a new comparison when needed.</p></div></s-page>;
}

export function ErrorBoundary() { return boundary.error(useRouteError()); }
export const headers: HeadersFunction = (args) => boundary.headers(args);
