import { createHash, createHmac, randomUUID } from "node:crypto";
import path from "node:path";
import type { PageScanResult, ViewportName } from "../src/domain";
import { redactUrl } from "../src/normalize";
import { runScan } from "../src/scanner";
import prisma from "./db.server";
import type { CodeAccessibilityIssue, ThemeCodeChange } from "./theme-code.server";

export interface EmbeddedScanResult {
  scanId: string;
  live: PageScanResult[];
  preview: PageScanResult[];
  codeChanges?: ThemeCodeChange[];
  codeAccessibilityIssues?: CodeAccessibilityIssue[];
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
  pagePath: string;
  baselineThemeId: string;
  baselineThemeRole: string;
  comparisonThemeId: string;
  viewports: ViewportName[];
  storefrontPassword?: string;
  skipPageScan?: boolean;
  onProgress?: (message: string, percent: number) => void;
}): Promise<EmbeddedScanResult> {
  const liveBase = new URL(`https://${options.shop}`);
  const pageUrl = new URL(options.pagePath, liveBase);
  if (pageUrl.origin !== liveBase.origin) throw new Error("The page path must belong to the installed shop.");
  const numericThemeId = (id: string) => id.match(/^gid:\/\/shopify\/(?:OnlineStoreTheme|Theme)\/(\d+)$/)?.[1];
  const baselineId = numericThemeId(options.baselineThemeId);
  const comparisonId = numericThemeId(options.comparisonThemeId);
  if (!baselineId || !comparisonId) throw new Error("Shopify returned an invalid theme identifier.");
  const baselineUrl = new URL(pageUrl);
  if (options.baselineThemeRole !== "MAIN") baselineUrl.searchParams.set("preview_theme_id", baselineId);
  const comparisonUrl = new URL(pageUrl);
  comparisonUrl.searchParams.set("preview_theme_id", comparisonId);

  const scanId = randomUUID();
  const artifactDirectory = path.resolve("scan-artifacts", shopArtifactKey(options.shop), scanId);
  await prisma.scan.create({ data: { id: scanId, shop: options.shop, status: "running", liveUrl: redactUrl(baselineUrl.toString()), previewUrl: redactUrl(comparisonUrl.toString()), viewports: options.viewports.join(",") } });

  try {
    const password = options.storefrontPassword || undefined;
    const pages = options.skipPageScan ? [] : await runScan([baselineUrl.toString(), comparisonUrl.toString()], options.viewports, artifactDirectory, (message, completed, total) => options.onProgress?.(message, 10 + Math.round(completed / total * 70)), [password, password]);
    const splitAt = options.viewports.length;
    const result: EmbeddedScanResult = {
      scanId,
      live: pages.slice(0, splitAt).map((page) => artifactUrl(page, scanId, options.shop)),
      preview: pages.slice(splitAt).map((page) => artifactUrl(page, scanId, options.shop)),
    };
    await prisma.scan.update({ where: { id: scanId }, data: { status: "completed", resultJson: JSON.stringify(result) } });
    return result;
  } catch (error) {
    await prisma.scan.update({ where: { id: scanId }, data: { status: "failed", error: error instanceof Error ? error.message : "Scan failed" } });
    throw error;
  }
}
