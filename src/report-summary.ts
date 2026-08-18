import { compareIssues, compareSections } from "./compare";
import type { PageScanResult, QaIssue, Severity, ViewportName } from "./domain";

export type ReleaseDecision = "ready" | "review" | "blocked";

export interface ReportSummary {
  decision: ReleaseDecision;
  headline: string;
  description: string;
  pagesCompared: number;
  newConcerns: number;
  resolvedConcerns: number;
  changedSections: number;
  changedFiles: number;
  priorities: Array<{ severity: Severity; message: string; page: string; viewport: ViewportName }>;
}

type SummaryInput = {
  live: PageScanResult[];
  preview: PageScanResult[];
  codeChanges?: Array<{ status: string }>;
  codeAccessibilityIssues?: Array<{ severity: Severity; message: string; filename: string }>;
};

function pagePath(page: PageScanResult): string {
  try { return new URL(page.requestedUrl).pathname; } catch { return page.requestedUrl; }
}

function priorityRank(severity: Severity): number {
  return { critical: 0, high: 1, medium: 2, low: 3 }[severity];
}

function uniqueIssues(issues: Array<{ issue: QaIssue; page: string; viewport: ViewportName }>) {
  const seen = new Set<string>();
  return issues.filter(({ issue, page }) => {
    const key = `${page}|${issue.rule}|${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildReportSummary(result: SummaryInput): ReportSummary {
  const added: Array<{ issue: QaIssue; page: string; viewport: ViewportName }> = [];
  let resolvedConcerns = 0;
  let changedSections = 0;
  const comparedPages = new Set<string>();

  for (const live of result.live) {
    const pathname = pagePath(live);
    const preview = result.preview.find((candidate) => pagePath(candidate) === pathname && candidate.viewport === live.viewport);
    if (!preview) continue;
    comparedPages.add(pathname);
    const issueDiff = compareIssues(live.issues, preview.issues);
    added.push(...issueDiff.added.map((issue) => ({ issue, page: pathname, viewport: live.viewport })));
    resolvedConcerns += issueDiff.resolved.length;
    const sectionDiff = compareSections(live.sections, preview.sections);
    changedSections += sectionDiff.changed.length + sectionDiff.added.length + sectionDiff.removed.length;
  }

  const uniqueAdded = uniqueIssues(added);
  const codePriorities = (result.codeAccessibilityIssues ?? []).map((issue) => ({
    severity: issue.severity,
    message: issue.message,
    page: issue.filename,
    viewport: "desktop" as const,
  }));
  const priorities = [...uniqueAdded.map(({ issue, page, viewport }) => ({ severity: issue.severity, message: issue.message, page, viewport })), ...codePriorities]
    .sort((a, b) => priorityRank(a.severity) - priorityRank(b.severity))
    .slice(0, 5);
  const hasCritical = priorities.some((item) => item.severity === "critical");
  const hasHigh = priorities.some((item) => item.severity === "high");
  const decision: ReleaseDecision = hasCritical ? "blocked" : hasHigh || priorities.length > 0 ? "review" : "ready";
  const copy = decision === "blocked"
    ? { headline: "Do not publish yet", description: "At least one critical regression could prevent customers from completing an important storefront action." }
    : decision === "review"
      ? { headline: "Review before publishing", description: "The comparison found new concerns worth checking before this theme becomes live." }
      : { headline: "Ready for final review", description: "No new deterministic QA concerns were found in the pages and code that were checked." };

  return {
    decision,
    ...copy,
    pagesCompared: comparedPages.size,
    newConcerns: uniqueAdded.length + codePriorities.length,
    resolvedConcerns,
    changedSections,
    changedFiles: (result.codeChanges ?? []).filter((change) => change.status !== "unchanged").length,
    priorities,
  };
}
