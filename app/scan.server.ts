import { createHash, createHmac, randomUUID } from "node:crypto";
import path from "node:path";
import type { PageScanResult, ViewportName } from "../src/domain";
import { redactUrl } from "../src/normalize";
import { runScan } from "../src/scanner";
import prisma from "./db.server";
import { artifactObjectKey, persistArtifact } from "./artifact-storage.server";
import type { CodeAccessibilityIssue, ThemeCodeChange } from "./theme-code.server";
import type { AiReportExplanation } from "./ai-report.server";

export interface EmbeddedScanResult {
  scanId: string;
  live: PageScanResult[];
  preview: PageScanResult[];
  codeChanges?: ThemeCodeChange[];
  codeAccessibilityIssues?: CodeAccessibilityIssue[];
  aiExplanation?: AiReportExplanation;
}

export function shopArtifactKey(shop: string): string {
  return createHash("sha256").update(shop).digest("hex").slice(0, 16);
}

export function artifactSignature(shop: string, scanId: string, filename: string): string {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) throw new Error("SHOPIFY_API_SECRET is required to serve scan screenshots.");
  return createHmac("sha256", secret).update(`${shop}\n${scanId}\n${filename}`).digest("hex");
}

function artifactUrl(page: PageScanResult, scanId: string, shop: string): PageScanResult {
  const filename = path.basename(page.screenshotPath.split("?", 1)[0]);
  const signature = artifactSignature(shop, scanId, filename);
  return { ...page, screenshotPath: `/app/artifacts/${scanId}/${filename}?signature=${signature}` };
}

export function refreshArtifactUrls(result: EmbeddedScanResult, shop: string): EmbeddedScanResult {
  return {
    ...result,
    live: result.live.map((page) => artifactUrl(page, result.scanId, shop)),
    preview: result.preview.map((page) => artifactUrl(page, result.scanId, shop)),
  };
}

export async function runEmbeddedComparison(options: {
  shop: string;
  pagePaths: string[];
  baselineThemeId: string;
  baselineThemeRole: string;
  comparisonThemeId: string;
  viewports: ViewportName[];
  storefrontPassword?: string;
  skipPageScan?: boolean;
  scanId?: string;
  existingRecord?: boolean;
  deferCompletion?: boolean;
  onProgress?: (message: string, percent: number) => void;
}): Promise<EmbeddedScanResult> {
  const liveBase = new URL(`https://${options.shop}`);
  const pageUrls = options.pagePaths.map((pagePath) => new URL(pagePath, liveBase));
  if (pageUrls.length === 0 || pageUrls.some((pageUrl) => pageUrl.origin !== liveBase.origin)) throw new Error("The page paths must belong to the installed shop.");
  const numericThemeId = (id: string) => id.match(/^gid:\/\/shopify\/(?:OnlineStoreTheme|Theme)\/(\d+)$/)?.[1];
  const baselineId = numericThemeId(options.baselineThemeId);
  const comparisonId = numericThemeId(options.comparisonThemeId);
  if (!baselineId || !comparisonId) throw new Error("Shopify returned an invalid theme identifier.");
  const baselineUrls = pageUrls.map((pageUrl) => { const url = new URL(pageUrl); if (options.baselineThemeRole !== "MAIN") url.searchParams.set("preview_theme_id", baselineId); return url; });
  const comparisonUrls = pageUrls.map((pageUrl) => { const url = new URL(pageUrl); url.searchParams.set("preview_theme_id", comparisonId); return url; });

  const scanId = options.scanId ?? randomUUID();
  const artifactDirectory = path.resolve("scan-artifacts", shopArtifactKey(options.shop), scanId);
  if (options.existingRecord) {
    await prisma.scan.update({ where: { id: scanId }, data: { status: "running", error: null } });
  } else {
    await prisma.scan.create({ data: { id: scanId, shop: options.shop, status: "running", liveUrl: redactUrl(baselineUrls[0].toString()), previewUrl: redactUrl(comparisonUrls[0].toString()), viewports: options.viewports.join(",") } });
  }

  try {
    const password = options.storefrontPassword || undefined;
    const urls = [...baselineUrls, ...comparisonUrls].map((url) => url.toString());
    const pages = options.skipPageScan ? [] : await runScan(urls, options.viewports, artifactDirectory, (message, completed, total) => options.onProgress?.(message, 10 + Math.round(completed / total * 70)), urls.map(() => password));
    await Promise.all(pages.map((page) => {
      const filename = path.basename(page.screenshotPath);
      return persistArtifact(page.screenshotPath, artifactObjectKey(shopArtifactKey(options.shop), scanId, filename));
    }));
    const splitAt = options.pagePaths.length * options.viewports.length;
    const result: EmbeddedScanResult = {
      scanId,
      live: pages.slice(0, splitAt).map((page) => artifactUrl(page, scanId, options.shop)),
      preview: pages.slice(splitAt).map((page) => artifactUrl(page, scanId, options.shop)),
    };
    await prisma.scan.update({ where: { id: scanId }, data: { status: options.deferCompletion ? "running" : "completed", resultJson: JSON.stringify(result) } });
    return result;
  } catch (error) {
    await prisma.scan.update({ where: { id: scanId }, data: { status: "failed", error: error instanceof Error ? error.message : "Scan failed" } });
    throw error;
  }
}
