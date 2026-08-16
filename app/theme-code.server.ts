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
    const sameContent = live && preview && (live.checksumMd5 && preview.checksumMd5 ? live.checksumMd5 === preview.checksumMd5 : String(live.size) === String(preview.size) && live.updatedAt === preview.updatedAt);
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
