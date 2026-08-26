import type { SectionSnapshot, ShopifyPageType } from "../src/domain";

type ThemeAdmin = { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> };
export type ThemeFileSnapshot = { filename: string; checksumMd5: string | null; size: string | number; updatedAt?: string };

export type ThemeCodeChange = {
  filename: string;
  status: "changed" | "added" | "removed";
  kind: "template" | "section" | "snippet" | "asset" | "layout" | "config" | "locale" | "other";
  scope: "current-page" | "theme-wide";
  affectedSections: string[];
  summary: string;
};

export type CodeAccessibilityIssue = {
  rule: string;
  severity: "high" | "medium" | "low";
  filename: string;
  line: number;
  message: string;
  suggestion: string;
};

function fileKind(filename: string): ThemeCodeChange["kind"] {
  const folder = filename.split("/", 1)[0];
  return (["templates", "sections", "snippets", "assets", "layout", "config", "locales"] as const).find((item) => item === folder)?.replace(/s$/, "") as ThemeCodeChange["kind"] || "other";
}

function templateMatchesPage(filename: string, pageType: ShopifyPageType): boolean {
  const base = filename.replace(/^templates\//, "").replace(/\.(json|liquid)$/, "").split(".", 1)[0];
  if (pageType === "home") return base === "index";
  return base === pageType;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/^shopify-section-/, "").replace(/^template--[^_]+__/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function themeFiles(admin: ThemeAdmin, themeId: string): Promise<ThemeFileSnapshot[]> {
  const response = await admin.graphql(`#graphql
    query ThemeQaFiles($themeId: ID!) {
      theme(id: $themeId) {
        files(first: 2500) { nodes { filename checksumMd5 size updatedAt } userErrors { code filename } }
      }
    }
  `, { variables: { themeId } });
  const payload = await response.json() as { data?: { theme?: { files?: { nodes?: ThemeFileSnapshot[]; userErrors?: Array<{ code: string; filename: string }> } } }; errors?: Array<{ message: string }> };
  if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message).join(" "));
  return payload.data?.theme?.files?.nodes ?? [];
}

export function compareThemeFileLists(baseline: ThemeFileSnapshot[], comparison: ThemeFileSnapshot[], pageType: ShopifyPageType, sections: SectionSnapshot[]): ThemeCodeChange[] {
  const before = new Map(baseline.map((file) => [file.filename, file]));
  const after = new Map(comparison.map((file) => [file.filename, file]));
  const filenames = [...new Set([...before.keys(), ...after.keys()])].sort();
  return filenames.flatMap((filename): ThemeCodeChange[] => {
    const live = before.get(filename);
    const preview = after.get(filename);
    const sameContent = Boolean(live && preview && (
      live.checksumMd5 && preview.checksumMd5
        ? live.checksumMd5 === preview.checksumMd5
        : live.updatedAt && preview.updatedAt
          ? String(live.size) === String(preview.size) && live.updatedAt === preview.updatedAt
          : false
    ));
    if (sameContent) return [];
    const status = !live ? "added" : !preview ? "removed" : "changed";
    const kind = fileKind(filename);
    const sectionType = kind === "section" ? filename.replace(/^sections\//, "").replace(/\.liquid$/, "") : null;
    const affectedSections = sectionType ? sections.filter((section) => normalize(section.id).includes(normalize(sectionType)) || normalize(section.name) === normalize(sectionType)).map((section) => section.name) : [];
    const currentTemplate = kind === "template" && templateMatchesPage(filename, pageType);
    const scope = currentTemplate || affectedSections.length > 0 ? "current-page" : "theme-wide";
    const summary = currentTemplate ? "The template used by this page is different." : affectedSections.length > 0 ? `This file controls ${affectedSections.join(", ")} on the scanned page.` : kind === "section" ? "This section code differs, but the section was not found on the scanned page." : `This ${kind === "other" ? "theme file" : kind} change can affect the theme beyond one section.`;
    return [{ filename, status, kind, scope, affectedSections: [...new Set(affectedSections)], summary }];
  });
}

export async function compareThemeFiles(admin: ThemeAdmin, baselineThemeId: string, comparisonThemeId: string, pageType: ShopifyPageType, sections: SectionSnapshot[]): Promise<ThemeCodeChange[]> {
  const [baseline, comparison] = await Promise.all([themeFiles(admin, baselineThemeId), themeFiles(admin, comparisonThemeId)]);
  return compareThemeFileLists(baseline, comparison, pageType, sections);
}

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

export function auditLiquidAccessibility(filename: string, content: string): CodeAccessibilityIssue[] {
  const issues: CodeAccessibilityIssue[] = [];
  const addMatches = (pattern: RegExp, create: (match: RegExpExecArray) => Omit<CodeAccessibilityIssue, "filename" | "line"> | null) => {
    for (const match of content.matchAll(pattern)) { const issue = create(match); if (issue) issues.push({ ...issue, filename, line: lineAt(content, match.index ?? 0) }); }
  };
  addMatches(/<img\b[^>]*>/gi, (match) => !/\balt\s*=/i.test(match[0]) ? { rule: "image-alt", severity: "high", message: "Image has no alt attribute.", suggestion: "Add alt text, or alt=\"\" when the image is purely decorative." } : null);
  addMatches(/\btabindex\s*=\s*["']?([1-9]\d*)["']?/gi, () => ({ rule: "positive-tabindex", severity: "high", message: "Positive tabindex changes the natural keyboard order.", suggestion: "Use tabindex=\"0\" or rely on the document order." }));
  addMatches(/<video\b[^>]*>([\s\S]*?)<\/video>/gi, (match) => !/<track\b[^>]*kind\s*=\s*["']captions["']/i.test(match[1]) ? { rule: "video-captions", severity: "high", message: "Video has no captions track.", suggestion: "Add a <track kind=\"captions\"> element." } : null);
  addMatches(/<html\b[^>]*>/gi, (match) => !/\blang\s*=/i.test(match[0]) ? { rule: "document-language", severity: "medium", message: "The HTML element has no language attribute.", suggestion: "Add lang=\"{{ request.locale.iso_code }}\" to the html element." } : null);
  addMatches(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (match) => {
    const attrs = match[2]; const body = match[3].replace(/{[%{][\s\S]*?[}%]%}/g, "").replace(/<[^>]+>/g, "").trim();
    const named = body || /\baria-label\s*=|\baria-labelledby\s*=|\btitle\s*=/i.test(attrs) || /<img\b[^>]*alt\s*=\s*["'][^"']+["']/i.test(match[3]);
    return !named ? { rule: "control-name", severity: "high", message: `${match[1].toLowerCase() === "a" ? "Link" : "Button"} may have no accessible name.`, suggestion: "Add visible text or an aria-label that describes the action." } : null;
  });
  return issues;
}

export async function auditChangedThemeAccessibility(admin: ThemeAdmin, themeId: string, filenames: string[]): Promise<CodeAccessibilityIssue[]> {
  const targets = filenames.filter((filename) => filename.endsWith(".liquid"));
  const issues: CodeAccessibilityIssue[] = [];
  for (let index = 0; index < targets.length; index += 50) {
    const response = await admin.graphql(`#graphql
      query ThemeQaAccessibilityFiles($themeId: ID!, $filenames: [String!]!) {
        theme(id: $themeId) { files(first: 50, filenames: $filenames) { nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } } } }
      }
    `, { variables: { themeId, filenames: targets.slice(index, index + 50) } });
    const payload = await response.json() as { data?: { theme?: { files?: { nodes?: Array<{ filename: string; body?: { content?: string } }> } } }; errors?: Array<{ message: string }> };
    if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message).join(" "));
    for (const file of payload.data?.theme?.files?.nodes ?? []) if (file.body?.content) issues.push(...auditLiquidAccessibility(file.filename, file.body.content));
  }
  return issues;
}
