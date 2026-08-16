import { useMemo, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { refreshArtifactUrls, runEmbeddedComparison, type EmbeddedScanResult } from "../scan.server";
import { compareIssues, compareMetadata, compareSections, groupIssuesBySection, sectionKey } from "../../src/compare";
import type { PageScanResult, QaIssue, ViewportName } from "../../src/domain";
import "../globals.css";

type ActionData = { ok: true; result: EmbeddedScanResult } | { ok: false; error: string };
type StoreTheme = { id: string; name: string; role: string; processing: boolean };
type ThemeAdmin = { graphql: (query: string) => Promise<Response> };

async function getStoreThemes(admin: ThemeAdmin): Promise<StoreTheme[]> {
  const response = await admin.graphql(`#graphql
    query ThemeQaThemes {
      themes(first: 50) {
        nodes { id name role processing }
      }
    }
  `);
  const payload = await response.json() as { data?: { themes?: { nodes?: StoreTheme[] } }; errors?: Array<{ message: string }> };
  if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message).join(" "));
  return payload.data?.themes?.nodes ?? [];
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const themes = await getStoreThemes(admin);
  const recentScans = await prisma.scan.findMany({ where: { shop: session.shop }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, status: true, createdAt: true, resultJson: true } });
  const saved = recentScans.find((scan) => scan.status === "completed" && scan.resultJson)?.resultJson;
  let initialResult: EmbeddedScanResult | null = null;
  try { initialResult = saved ? refreshArtifactUrls(JSON.parse(saved) as EmbeddedScanResult, session.shop) : null; } catch { initialResult = null; }
  return { liveBase: `https://${session.shop}`, themes, defaultThemeId: themes.find((theme) => theme.role === "MAIN")?.id ?? themes[0]?.id ?? "", recentScans: recentScans.map((scan) => ({ id: scan.id, status: scan.status, createdAt: scan.createdAt })), initialResult };
};

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionData> => {
  const { admin, session } = await authenticate.admin(request);
  try {
    const body = await request.json() as { pagePath?: unknown; baselineThemeId?: unknown; comparisonThemeId?: unknown; storePassword?: unknown; viewports?: unknown };
    if (typeof body.pagePath !== "string" || !body.pagePath.startsWith("/") || body.pagePath.startsWith("//")) return { ok: false, error: "Enter a valid storefront page path." };
    const themes = await getStoreThemes(admin);
    const baselineTheme = themes.find((theme) => theme.id === body.baselineThemeId);
    const comparisonTheme = themes.find((theme) => theme.id === body.comparisonThemeId && theme.role === "UNPUBLISHED");
    if (!baselineTheme) return { ok: false, error: "Select a valid baseline theme." };
    if (!comparisonTheme) return { ok: false, error: "Select an unpublished comparison theme." };
    if (baselineTheme.id === comparisonTheme.id) return { ok: false, error: "Select two different themes." };
    const requested = Array.isArray(body.viewports) ? body.viewports : [];
    const viewports = requested.filter((value): value is ViewportName => value === "desktop" || value === "mobile");
    if (viewports.length === 0) return { ok: false, error: "Select at least one viewport." };
    if (body.storePassword !== undefined && (typeof body.storePassword !== "string" || body.storePassword.length > 256)) return { ok: false, error: "Storefront password is invalid." };
    const result = await runEmbeddedComparison({ shop: session.shop, pagePath: body.pagePath, baselineThemeId: baselineTheme.id, baselineThemeRole: baselineTheme.role, comparisonThemeId: comparisonTheme.id, viewports, storefrontPassword: typeof body.storePassword === "string" ? body.storePassword : undefined });
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Scan failed." };
  }
};

function issueGuidance(issue: QaIssue): { impact: string; action: string } {
  if (issue.type === "accessibility") return { impact: "Some customers may have difficulty reading or using this part of the page.", action: "Review the affected element and follow the accessibility message above." };
  if (issue.type === "network") return { impact: "A link, image, or request may fail for customers.", action: "Open the affected section and fix or remove the failing resource." };
  if (issue.type === "console") return { impact: "A script error can stop interactive storefront features from working.", action: "Ask the theme developer to inspect the script used by this section." };
  if (issue.type === "image") return { impact: "Customers may not see the intended image or screen readers may not describe it.", action: "Check the image source and add useful alternative text where needed." };
  if (issue.type === "seo") return { impact: "Search engines may understand or present this page less effectively.", action: "Update the page title, description, headings, or canonical URL as indicated." };
  return { impact: "This markup can make the section less reliable across browsers and devices.", action: "Review the affected section markup with the theme developer." };
}

function IssueRow({ issue }: { issue: QaIssue }) {
  const guidance = issueGuidance(issue);
  return <article className="friendly-issue"><div className="issue-title"><span className={`severity-label ${issue.severity}`}>{issue.severity}</span><div><strong>{issue.message}</strong>{issue.section?.name && <span>In {issue.section.name}</span>}</div></div><div className="issue-guidance"><p><b>Why it matters</b>{guidance.impact}</p><p><b>Suggested fix</b>{guidance.action}</p></div></article>;
}

function VisualComparison({ live, preview }: { live: PageScanResult; preview: PageScanResult }) {
  return <section className="visual-comparison"><div className="visual-heading"><div><span className="eyebrow">Page preview</span><h3>Compare the two themes</h3><p>The screenshots were captured at the same screen size.</p></div></div><div className="screenshot-grid"><figure><figcaption><strong>Baseline theme</strong><span>Before</span></figcaption><img src={live.screenshotPath} alt="Baseline theme screenshot" loading="eager"/></figure><figure><figcaption><strong>Unpublished theme</strong><span>After</span></figcaption><img src={preview.screenshotPath} alt="Unpublished theme screenshot" loading="eager"/></figure></div></section>;
}

function DeltaList({ title, tone, issues }: { title: string; tone: "added" | "resolved"; issues: QaIssue[] }) {
  const groups = groupIssuesBySection(issues);
  const ruleCount = new Set(issues.map((issue) => `${issue.rule}|${issue.message}`)).size;
  return <div className={`delta-column ${tone}`}><div className="delta-title"><h3>{title}</h3><strong>{ruleCount}<small>{issues.length} affected elements</small></strong></div>{issues.length === 0 ? <p className="empty">Nothing to review</p> : groups.map((group) => <section className="issue-section" key={group.key}><h4>{group.name}</h4><div className="issues">{group.issues.map((issue) => <IssueRow issue={issue} key={issue.fingerprint}/>)}</div></section>)}</div>;
}

function ThemeDelta({ live, preview }: { live: PageScanResult; preview: PageScanResult }) {
  const issueDiff = compareIssues(live.issues, preview.issues);
  const metadataDiff = compareMetadata(live.metadata, preview.metadata);
  const sectionDiff = compareSections(live.sections, preview.sections);
  return <section className="delta-card"><div className="delta-summary"><div><span className="eyebrow">QA summary</span><h3>What changed in the unpublished theme</h3></div><div className="delta-stats"><span><strong>{new Set(issueDiff.added.map((issue) => issue.rule)).size}</strong> new concerns</span><span><strong>{issueDiff.resolved.length}</strong> fixed</span></div></div>
    {metadataDiff.length > 0 && <div className="metadata-diff"><h3>Page signals</h3>{metadataDiff.map((change) => <div className="metadata-row" key={change.field}><strong>{change.label}</strong><span>Live: {String(change.live ?? "missing")}</span><span>Preview: {String(change.preview ?? "missing")}</span></div>)}</div>}
    {(sectionDiff.changed.length > 0 || sectionDiff.added.length > 0 || sectionDiff.removed.length > 0) && <div className="section-diff"><h3>Shopify sections</h3><div className="section-change-grid">{sectionDiff.changed.map((change) => { const newIssues = issueDiff.added.filter((issue) => issue.section && sectionKey(issue.section.id, issue.section.name) === change.key); return <article key={change.key}><span className="change-kind">Changed section</span><h4>{change.name}</h4><p>{change.structureChanged ? "Markup structure changed" : "Content metrics changed"}</p><ul>{change.metrics.map((metric) => <li key={metric.field}>{metric.field}: {metric.live} → {metric.preview} ({metric.delta > 0 ? "+" : ""}{metric.delta})</li>)}{newIssues.length > 0 && <li>{new Set(newIssues.map((issue) => issue.rule)).size} new issue types affecting {newIssues.length} elements</li>}</ul></article>; })}{sectionDiff.added.map((section) => <article key={section.id}><span className="change-kind added">Added section</span><h4>{section.name}</h4><p>{section.imageCount} images · {section.buttonCount} buttons · {section.linkCount} links</p></article>)}{sectionDiff.removed.map((section) => <article key={section.id}><span className="change-kind removed">Removed section</span><h4>{section.name}</h4><p>Present in live but not preview</p></article>)}</div></div>}
    <div className="delta-grid"><DeltaList title="Needs attention" tone="added" issues={issueDiff.added}/><DeltaList title="Improved" tone="resolved" issues={issueDiff.resolved}/></div></section>;
}

export default function Index() {
  const { liveBase, themes, defaultThemeId, recentScans, initialResult } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [pagePath, setPagePath] = useState("/");
  const [baselineThemeId, setBaselineThemeId] = useState(defaultThemeId);
  const [comparisonThemeId, setComparisonThemeId] = useState("");
  const [storePassword, setStorePassword] = useState("");
  const [viewports, setViewports] = useState<ViewportName[]>(["desktop", "mobile"]);
  const result = fetcher.data?.ok ? fetcher.data.result : initialResult;
  const loading = fetcher.state !== "idle";
  const pairs = useMemo(() => result ? viewports.map((viewport) => ({ viewport, live: result.live.find((page) => page.viewport === viewport), preview: result.preview.find((page) => page.viewport === viewport) })) : [], [result, viewports]);
  const toggleViewport = (viewport: ViewportName) => setViewports((current) => current.includes(viewport) ? current.filter((item) => item !== viewport) : [...current, viewport]);
  const comparisonThemes = themes.filter((theme) => theme.role === "UNPUBLISHED" && theme.id !== baselineThemeId);
  const selectBaseline = (themeId: string) => {
    setBaselineThemeId(themeId);
    if (themeId === comparisonThemeId) setComparisonThemeId("");
  };
  const submit = () => fetcher.submit({ pagePath, baselineThemeId, comparisonThemeId, storePassword, viewports }, { method: "POST", encType: "application/json" });

  return <s-page heading="Shopify QA Agent"><div className="qa-main"><header className="hero"><span className="brand">THEME QA</span><h1>Compare one theme against another.</h1><p>Select a baseline theme and an unpublished theme from the installed store. No preview link is required.</p></header>
    <section className="scan-form"><div className="field-grid"><label><span>Installed storefront</span><input value={liveBase} readOnly/></label><label><span>Page path</span><input value={pagePath} onChange={(event) => setPagePath(event.target.value)} placeholder="/products/example"/></label><label><span>Baseline theme</span><select value={baselineThemeId} onChange={(event) => selectBaseline(event.target.value)}>{themes.map((theme) => <option key={theme.id} value={theme.id} disabled={theme.processing}>{theme.name}{theme.role === "MAIN" ? " — Live" : ` — ${theme.role.toLowerCase()}`}{theme.processing ? " (processing)" : ""}</option>)}</select></label><label><span>Unpublished comparison theme</span><select required value={comparisonThemeId} onChange={(event) => setComparisonThemeId(event.target.value)}><option value="">Select an unpublished theme…</option>{comparisonThemes.map((theme) => <option key={theme.id} value={theme.id} disabled={theme.processing}>{theme.name}{theme.processing ? " (processing)" : ""}</option>)}</select></label><label><span>Storefront password <em>optional</em></span><input type="password" autoComplete="off" value={storePassword} onChange={(event) => setStorePassword(event.target.value)} placeholder="Used only if Shopify asks"/></label></div><div className="form-footer"><fieldset><legend>Viewports</legend><label className="check"><input type="checkbox" checked={viewports.includes("desktop")} onChange={() => toggleViewport("desktop")}/> Desktop</label><label className="check"><input type="checkbox" checked={viewports.includes("mobile")} onChange={() => toggleViewport("mobile")}/> Mobile</label></fieldset><button disabled={loading || !baselineThemeId || !comparisonThemeId || viewports.length === 0} onClick={submit}>{loading ? "Scanning…" : "Run comparison"}</button></div><p className="privacy">Theme IDs and storefront passwords are never exposed in reports.</p></section>
    {fetcher.data && !fetcher.data.ok && <div className="error" role="alert">{fetcher.data.error}</div>}{loading && <section className="loading"><div className="loader"/><div><strong>Chromium is scanning both themes</strong><p>This can take a minute.</p></div></section>}
    {result && <section className="results"><div className="section-heading"><div><span className="eyebrow">Scan complete</span><h2>Theme comparison</h2></div></div>{pairs.map(({ viewport, live, preview }) => live && preview && <section key={viewport} className="viewport-group"><h2>{viewport === "desktop" ? "Desktop view" : "Mobile view"}</h2><VisualComparison live={live} preview={preview}/><ThemeDelta live={live} preview={preview}/></section>)}</section>}
    {recentScans.length > 0 && <details className="recent-scans"><summary>Previous scan activity</summary>{recentScans.map((scan) => <p key={scan.id}>{scan.status === "completed" ? "Completed" : scan.status === "failed" ? "Failed" : "In progress"} · {new Date(scan.createdAt).toLocaleString()}</p>)}</details>}
  </div></s-page>;
}

export function ErrorBoundary() { return boundary.error(useRouteError()); }
export const headers: HeadersFunction = (args) => boundary.headers(args);
