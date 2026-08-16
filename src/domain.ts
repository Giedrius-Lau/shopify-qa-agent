export type ViewportName = "desktop" | "mobile";
export type Severity = "critical" | "high" | "medium" | "low";
export type IssueCategory = "accessibility" | "console" | "network" | "seo" | "dom" | "image";
export type ShopifyPageType = "home" | "product" | "collection" | "cart" | "search" | "page" | "unknown";

export interface QaIssue {
  type: IssueCategory;
  severity: Severity;
  rule: string;
  message: string;
  selector?: string;
  evidence?: Record<string, unknown>;
  fingerprint: string;
  section?: { id: string; name: string };
}

export interface SectionSnapshot {
  id: string;
  name: string;
  index: number;
  imageCount: number;
  headingCount: number;
  buttonCount: number;
  linkCount: number;
  textLength: number;
  structureFingerprint: string;
}

export interface PageMetadata {
  title: string | null;
  description: string | null;
  canonical: string | null;
  lang: string | null;
  h1Count: number;
  imageCount: number;
}

export interface PageScanResult {
  requestedUrl: string;
  finalUrl: string;
  viewport: ViewportName;
  viewportSize: { width: number; height: number };
  pageType: ShopifyPageType;
  sections: SectionSnapshot[];
  startedAt: string;
  durationMs: number;
  screenshotPath: string;
  metadata: PageMetadata;
  issues: QaIssue[];
}

export interface ScanResult {
  schemaVersion: "1.0";
  requestedUrls: string[];
  startedAt: string;
  durationMs: number;
  pages: PageScanResult[];
  summary: Record<Severity, number>;
}

export function summarizeIssues(pages: PageScanResult[]): Record<Severity, number> {
  const summary: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const page of pages) {
    for (const issue of page.issues) summary[issue.severity] += 1;
  }
  return summary;
}
