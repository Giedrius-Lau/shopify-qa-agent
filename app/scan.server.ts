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
  previewUrl: string;
  viewports: ViewportName[];
  storefrontPassword?: string;
}): Promise<EmbeddedScanResult> {
  const liveBase = new URL(`https://${options.shop}`);
  const liveUrl = new URL(options.pagePath, liveBase);
  if (liveUrl.origin !== liveBase.origin) throw new Error("The live page path must belong to the installed shop.");

  const scanId = randomUUID();
  const artifactDirectory = path.resolve("scan-artifacts", shopArtifactKey(options.shop), scanId);
  await prisma.scan.create({ data: { id: scanId, shop: options.shop, status: "running", liveUrl: redactUrl(liveUrl.toString()), previewUrl: redactUrl(options.previewUrl), viewports: options.viewports.join(",") } });

  try {
    const password = options.storefrontPassword || undefined;
    const pages = await runScan([liveUrl.toString(), options.previewUrl], options.viewports, artifactDirectory, undefined, [password, password]);
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
