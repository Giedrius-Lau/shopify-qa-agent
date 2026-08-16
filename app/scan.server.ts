import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import type { PageScanResult, ViewportName } from "../src/domain";
import { redactUrl } from "../src/normalize";
import { runScan } from "../src/scanner";
import prisma from "./db.server";

export interface EmbeddedScanResult {
  scanId: string;
  live: PageScanResult[];
  preview: PageScanResult[];
}

export function shopArtifactKey(shop: string): string {
  return createHash("sha256").update(shop).digest("hex").slice(0, 16);
}

function artifactUrl(page: PageScanResult, scanId: string): PageScanResult {
  return { ...page, screenshotPath: `/app/artifacts/${scanId}/${path.basename(page.screenshotPath)}` };
}

export async function runEmbeddedComparison(options: {
  shop: string;
  pagePath: string;
  baselineThemeId: string;
  baselineThemeRole: string;
  comparisonThemeId: string;
  viewports: ViewportName[];
  storefrontPassword?: string;
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
    const pages = await runScan([baselineUrl.toString(), comparisonUrl.toString()], options.viewports, artifactDirectory, undefined, [password, password]);
    const splitAt = options.viewports.length;
    const result: EmbeddedScanResult = {
      scanId,
      live: pages.slice(0, splitAt).map((page) => artifactUrl(page, scanId)),
      preview: pages.slice(splitAt).map((page) => artifactUrl(page, scanId)),
    };
    await prisma.scan.update({ where: { id: scanId }, data: { status: "completed", resultJson: JSON.stringify(result) } });
    return result;
  } catch (error) {
    await prisma.scan.update({ where: { id: scanId }, data: { status: "failed", error: error instanceof Error ? error.message : "Scan failed" } });
    throw error;
  }
}
