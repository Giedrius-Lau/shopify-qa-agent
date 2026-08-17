import { useMemo, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { refreshArtifactUrls, runEmbeddedComparison, type EmbeddedScanResult } from "../scan.server";
import { compareThemeFiles } from "../theme-code.server";
import { getStoreThemes } from "../themes.server";
import { compareIssues, compareMetadata, compareSections, groupIssuesBySection, sectionKey } from "../../src/compare";
import type { PageScanResult, QaIssue, ViewportName } from "../../src/domain";
import "../globals.css";

type ActionData = { ok: true; result: EmbeddedScanResult } | { ok: false; error: string };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const themes = await getStoreThemes(admin);
  const recentScans = await prisma.scan.findMany({ where: { shop: session.shop }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, status: true, createdAt: true, resultJson: true } });
  const selectedId = new URL(request.url).searchParams.get("scan");
  const selectedScan = selectedId ? await prisma.scan.findFirst({ where: { id: selectedId, shop: session.shop, status: "completed" }, select: { resultJson: true } }) : null;
  const saved = selectedScan?.resultJson ?? recentScans.find((scan) => scan.status === "completed" && scan.resultJson)?.resultJson;
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
    const representativePage = result.preview[0];
    if (representativePage) {
      result.codeChanges = await compareThemeFiles(admin, baselineTheme.id, comparisonTheme.id, representativePage.pageType, representativePage.sections);
      await prisma.scan.update({ where: { id: result.scanId }, data: { resultJson: JSON.stringify(result) } });
    }
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
  const diff = compareSections(live.sections, preview.sections);
  const changed = new Map(diff.changed.map((section) => [section.key, { name: section.name, kind: "changed" }]));
  for (const section of diff.added) changed.set(sectionKey(section.id, section.name), { name: section.name, kind: "added" });
  const highlights = preview.sections.flatMap((section) => { const change = changed.get(sectionKey(section.id, section.name)); return change && section.bounds && preview.pageHeight ? [{ ...change, bounds: section.bounds, key: section.id }] : []; });
  return <section className="visual-comparison"><div className="visual-heading"><div><span className="eyebrow">Page preview</span><h3>Compare the two themes</h3><p>Updated sections are outlined on the unpublished theme.</p></div>{highlights.length > 0 && <div className="highlight-legend"><span className="changed">Changed</span><span className="added">Added</span></div>}</div><div className="screenshot-grid"><figure><figcaption><strong>Baseline theme</strong><span>Before</span></figcaption><img src={live.screenshotPath} alt="Baseline theme screenshot" loading="eager"/></figure><figure><figcaption><strong>Unpublished theme</strong><span>After · {highlights.length} highlighted</span></figcaption><div className="annotated-shot"><img src={preview.screenshotPath} alt="Unpublished theme screenshot with changed sections highlighted" loading="eager"/>{highlights.map((item) => <span className={`section-highlight ${item.kind}`} key={item.key} style={{ left: `${item.bounds.x / preview.viewportSize.width * 100}%`, top: `${item.bounds.y / preview.pageHeight! * 100}%`, width: `${item.bounds.width / preview.viewportSize.width * 100}%`, height: `${item.bounds.height / preview.pageHeight! * 100}%` }}><b>{item.name}</b></span>)}</div></figure></div></section>;
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

function CodeChanges({ changes }: { changes: NonNullable<EmbeddedScanResult["codeChanges"]> }) {
  const pageChanges = changes.filter((change) => change.scope === "current-page");
  const themeChanges = changes.filter((change) => change.scope === "theme-wide");
  const list = (items: typeof changes) => items.map((change) => <article className="code-change" key={change.filename}><div><span className={`file-status ${change.status}`}>{change.status}</span><strong>{change.filename}</strong></div><p>{change.summary}</p>{change.affectedSections.length > 0 && <span className="section-map">Section: {change.affectedSections.join(", ")}</span>}</article>);
  return <section className="code-changes"><div className="delta-summary"><div><span className="eyebrow">Theme code</span><h3>Files behind the visible changes</h3><p>Shopify theme files are compared directly, not inferred from screenshots.</p></div><div className="delta-stats"><span><strong>{pageChanges.length}</strong> on this page</span><span><strong>{themeChanges.length}</strong> elsewhere in theme</span></div></div>{changes.length === 0 ? <p className="empty">No theme code differences found.</p> : <><div className="code-change-group"><h4>Connected to this page or its sections</h4>{pageChanges.length ? list(pageChanges) : <p className="empty">No changed files could be connected to this page.</p>}</div>{themeChanges.length > 0 && <details className="other-code-changes"><summary>{themeChanges.length} other theme file changes</summary><div>{list(themeChanges)}</div></details>}</>}</section>;
}

function CodeAccessibility({ issues }: { issues: NonNullable<EmbeddedScanResult["codeAccessibilityIssues"]> }) {
  return <section className="code-accessibility"><div className="delta-summary"><div><span className="eyebrow">Code accessibility</span><h3>Accessibility risks in changed Liquid</h3><p>Static checks only. A browser scan is still needed for contrast, focus behavior, and rendered accessibility.</p></div><div className="delta-stats"><span><strong>{issues.length}</strong> findings</span></div></div>{issues.length === 0 ? <p className="code-pass">No static accessibility problems found in the changed Liquid files.</p> : <div className="code-a11y-list">{issues.map((issue, index) => <article key={`${issue.filename}:${issue.line}:${issue.rule}:${index}`}><div><span className={`severity-label ${issue.severity}`}>{issue.severity}</span><strong>{issue.message}</strong></div><code>{issue.filename}:{issue.line}</code><p><b>Suggested fix</b>{issue.suggestion}</p></article>)}</div>}</section>;
}

function ScanProgress({ percent, message, codeOnly }: { percent: number; message: string; codeOnly: boolean }) {
  return <section className="loading scan-progress" aria-live="polite"><div className="progress-copy"><div><strong>{codeOnly ? "Comparing theme code" : "Chromium is scanning both themes"}</strong><span>{percent}%</span></div><p>{message}</p><div className="progress-track" role="progressbar" aria-label="Theme scan progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }}/></div></div></section>;
}

export default function Index() {
  const { liveBase, themes, defaultThemeId, recentScans, initialResult } = useLoaderData<typeof loader>();
  const [pagePath, setPagePath] = useState("/");
  const [baselineThemeId, setBaselineThemeId] = useState(defaultThemeId);
  const [comparisonThemeId, setComparisonThemeId] = useState("");
  const [storePassword, setStorePassword] = useState("");
  const [viewports, setViewports] = useState<ViewportName[]>(["desktop", "mobile"]);
  const [codeOnly, setCodeOnly] = useState(false);
  const [scanResult, setScanResult] = useState<EmbeddedScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ percent: number; message: string } | null>(null);
  const result = scanResult ?? initialResult;
  const loading = progress !== null;
  const pairs = useMemo(() => result ? viewports.map((viewport) => ({ viewport, live: result.live.find((page) => page.viewport === viewport), preview: result.preview.find((page) => page.viewport === viewport) })) : [], [result, viewports]);
  const toggleViewport = (viewport: ViewportName) => setViewports((current) => current.includes(viewport) ? current.filter((item) => item !== viewport) : [...current, viewport]);
  const comparisonThemes = themes.filter((theme) => theme.role === "UNPUBLISHED" && theme.id !== baselineThemeId);
  const selectBaseline = (themeId: string) => {
    setBaselineThemeId(themeId);
    if (themeId === comparisonThemeId) setComparisonThemeId("");
  };
  const submit = async () => {
    setScanError(null); setProgress({ percent: 1, message: "Starting comparison" }); setScanResult(null);
    try {
      const response = await fetch(`/app/scan-stream${window.location.search}`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ pagePath, baselineThemeId, comparisonThemeId, storePassword, viewports, codeOnly }) });
      const queued = await response.json() as { scanId?: string; error?: string };
      if (!response.ok || !queued.scanId) throw new Error(queued.error || `Scan request failed (${response.status}).`);
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const statusResponse = await fetch(`/app/scan-stream?scanId=${encodeURIComponent(queued.scanId)}`, { credentials: "same-origin", cache: "no-store" });
        const status = await statusResponse.json() as { status?: string; progress?: number; message?: string; error?: string | null; result?: EmbeddedScanResult };
        if (!statusResponse.ok) throw new Error(status.error || "Could not check scan progress.");
        setProgress({ percent: status.progress ?? 1, message: status.message ?? "Working" });
        if (status.status === "completed" && status.result) { setScanResult(status.result); break; }
        if (status.status === "failed") throw new Error(status.error || "Scan failed.");
      }
    } catch (error) { setScanError(error instanceof Error ? error.message : "Scan failed."); } finally { setProgress(null); }
  };

  return <s-page heading="Shopify QA Agent"><div className="qa-main"><header className="hero"><span className="brand">THEME QA</span><h1>Compare one theme against another.</h1><p>Select a baseline theme and an unpublished theme from the installed store. No preview link is required.</p></header>
    <section className="scan-form"><div className="field-grid"><label><span>Installed storefront</span><input value={liveBase} readOnly/></label><label><span>Page path</span><input value={pagePath} onChange={(event) => setPagePath(event.target.value)} placeholder="/products/example"/></label><label><span>Baseline theme</span><select value={baselineThemeId} onChange={(event) => selectBaseline(event.target.value)}>{themes.map((theme) => <option key={theme.id} value={theme.id} disabled={theme.processing}>{theme.name}{theme.role === "MAIN" ? " — Live" : ` — ${theme.role.toLowerCase()}`}{theme.processing ? " (processing)" : ""}</option>)}</select></label><label><span>Unpublished comparison theme</span><select required value={comparisonThemeId} onChange={(event) => setComparisonThemeId(event.target.value)}><option value="">Select an unpublished theme…</option>{comparisonThemes.map((theme) => <option key={theme.id} value={theme.id} disabled={theme.processing}>{theme.name}{theme.processing ? " (processing)" : ""}</option>)}</select></label>{!codeOnly && <label><span>Storefront password <em>optional</em></span><input type="password" autoComplete="off" value={storePassword} onChange={(event) => setStorePassword(event.target.value)} placeholder="Used only if Shopify asks"/></label>}</div><div className="scan-mode"><input id="code-only" type="checkbox" checked={codeOnly} onChange={(event) => setCodeOnly(event.target.checked)}/><label htmlFor="code-only"><strong>Code-only scan</strong><small>Skip Chromium, screenshots, accessibility, links, and visual checks.</small></label></div><div className="form-footer">{!codeOnly && <fieldset><legend>Viewports</legend><label className="check"><input type="checkbox" checked={viewports.includes("desktop")} onChange={() => toggleViewport("desktop")}/> Desktop</label><label className="check"><input type="checkbox" checked={viewports.includes("mobile")} onChange={() => toggleViewport("mobile")}/> Mobile</label></fieldset>}<button disabled={loading || !baselineThemeId || !comparisonThemeId || (!codeOnly && viewports.length === 0)} onClick={submit}>{loading ? "Scanning…" : codeOnly ? "Compare code" : "Run comparison"}</button></div><p className="privacy">Theme IDs and storefront passwords are never exposed in reports.</p></section>
    {scanError && <div className="error" role="alert">{scanError}</div>}{progress && <ScanProgress percent={progress.percent} message={progress.message} codeOnly={codeOnly}/>}
    {result && <section className="results"><div className="section-heading"><div><span className="eyebrow">Scan complete</span><h2>Theme comparison</h2></div></div>{result.codeAccessibilityIssues && <CodeAccessibility issues={result.codeAccessibilityIssues}/>} {result.codeChanges && <CodeChanges changes={result.codeChanges}/>} {pairs.map(({ viewport, live, preview }) => live && preview && <section key={viewport} className="viewport-group"><h2>{viewport === "desktop" ? "Desktop view" : "Mobile view"}</h2><VisualComparison live={live} preview={preview}/><ThemeDelta live={live} preview={preview}/></section>)}</section>}
    {recentScans.length > 0 && <details className="recent-scans"><summary>Previous scan activity</summary>{recentScans.map((scan) => <p key={scan.id}>{scan.status === "completed" ? "Completed" : scan.status === "failed" ? "Failed" : "In progress"} · {new Date(scan.createdAt).toLocaleString()}</p>)}</details>}
  </div></s-page>;
}

export function ErrorBoundary() { return boundary.error(useRouteError()); }
export const headers: HeadersFunction = (args) => boundary.headers(args);
