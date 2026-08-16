import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import type { EmbeddedScanResult } from "../scan.server";
import type { Severity } from "../../src/domain";
import "../globals.css";

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
  const scans = await prisma.scan.findMany({ where: { shop: session.shop }, orderBy: { createdAt: "desc" }, take: 50 });
  return { scans: scans.map((scan) => ({ id: scan.id, status: scan.status, page: pageLabel(scan.liveUrl), viewports: scan.viewports.split(",").filter(Boolean), createdAt: scan.createdAt, error: scan.error, counts: issueCounts(scan.resultJson), hasReport: scan.status === "completed" && Boolean(scan.resultJson) })) };
};

export default function ScanHistory() {
  const { scans } = useLoaderData<typeof loader>();
  return <s-page heading="Scan history"><div className="qa-main history-page"><header className="history-heading"><div><span className="eyebrow">Previous comparisons</span><h1>Your scans</h1><p>Open a completed comparison or quickly check whether a scan succeeded.</p></div><Link className="new-scan-link" to="/app">New comparison</Link></header>{scans.length === 0 ? <section className="history-empty"><h2>No scans yet</h2><p>Your completed theme comparisons will appear here.</p></section> : <section className="history-list">{scans.map((scan) => <article className="history-row" key={scan.id}><div className="history-main"><span className={`status-pill ${scan.status}`}>{scan.status === "completed" ? "Completed" : scan.status === "failed" ? "Failed" : "In progress"}</span><div><h2>{scan.page}</h2><p>{scan.viewports.map((viewport) => viewport === "desktop" ? "Desktop" : "Mobile").join(" + ")} · {new Date(scan.createdAt).toLocaleString()}</p></div></div>{scan.counts && <div className="history-counts"><span><strong>{scan.counts.critical}</strong> Critical</span><span><strong>{scan.counts.high}</strong> High</span><span><strong>{scan.counts.medium}</strong> Medium</span><span><strong>{scan.counts.low}</strong> Low</span></div>}{scan.hasReport ? <Link className="report-link" to={`/app?scan=${encodeURIComponent(scan.id)}`}>View report</Link> : scan.error ? <p className="history-error" title={scan.error}>Scan failed. Try running it again.</p> : null}</article>)}</section>}</div></s-page>;
}

export function ErrorBoundary() { return boundary.error(useRouteError()); }
export const headers: HeadersFunction = (args) => boundary.headers(args);
