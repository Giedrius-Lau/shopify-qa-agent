import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import prisma from "./db.server";
import { unauthenticated } from "./shopify.server";
import { refreshArtifactUrls, runEmbeddedComparison, type EmbeddedScanResult } from "./scan.server";
import { auditChangedThemeAccessibility, compareThemeFiles } from "./theme-code.server";
import type { ShopifyPageType, ViewportName } from "../src/domain";
import { redactUrl } from "../src/normalize";

export type ScanJobPayload = {
  pagePaths: string[];
  baselineThemeId: string;
  baselineThemeRole: string;
  comparisonThemeId: string;
  viewports: ViewportName[];
  storefrontPassword?: string;
  codeOnly: boolean;
};

function encryptionKey(): Buffer {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) throw new Error("SHOPIFY_API_SECRET is required to queue scans.");
  return createHash("sha256").update(secret).digest();
}

export function encryptJobPayload(payload: ScanJobPayload): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptJobPayload(value: string): ScanJobPayload {
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !encrypted) throw new Error("Invalid scan job payload.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")) as ScanJobPayload;
}

function pageTypeFromPath(pagePath: string): ShopifyPageType {
  if (pagePath === "/") return "home";
  const segment = pagePath.split("/").filter(Boolean)[0];
  return segment === "products" ? "product" : segment === "collections" ? "collection" : segment === "cart" ? "cart" : segment === "search" ? "search" : segment === "pages" ? "page" : "unknown";
}

export async function enqueueScan(shop: string, payload: ScanJobPayload): Promise<string> {
  const scanId = randomUUID();
  const liveUrl = new URL(payload.pagePaths[0], `https://${shop}`);
  const previewUrl = new URL(liveUrl);
  const comparisonId = payload.comparisonThemeId.match(/\/(\d+)$/)?.[1];
  if (comparisonId) previewUrl.searchParams.set("preview_theme_id", comparisonId);
  await prisma.scan.create({ data: {
    id: scanId,
    shop,
    status: "queued",
    liveUrl: redactUrl(liveUrl.toString()),
    previewUrl: redactUrl(previewUrl.toString()),
    viewports: payload.codeOnly ? "" : payload.viewports.join(","),
    jobPayload: encryptJobPayload(payload),
    progress: 1,
    progressMessage: "Queued",
  } });
  return scanId;
}

async function updateProgress(scanId: string, message: string, progress: number): Promise<void> {
  await prisma.scan.update({ where: { id: scanId }, data: { progress, progressMessage: message } });
}

async function executeJob(scan: { id: string; shop: string; jobPayload: string | null }): Promise<void> {
  if (!scan.jobPayload) throw new Error("Scan job payload is missing.");
  const payload = decryptJobPayload(scan.jobPayload);
  const pagePaths = payload.pagePaths?.length ? payload.pagePaths : ["/"];
  const { admin } = await unauthenticated.admin(scan.shop);
  const result = await runEmbeddedComparison({
    shop: scan.shop,
    pagePaths,
    baselineThemeId: payload.baselineThemeId,
    baselineThemeRole: payload.baselineThemeRole,
    comparisonThemeId: payload.comparisonThemeId,
    viewports: payload.codeOnly ? [] : payload.viewports,
    storefrontPassword: payload.storefrontPassword,
    skipPageScan: payload.codeOnly,
    scanId: scan.id,
    existingRecord: true,
    deferCompletion: true,
    onProgress: (message, percent) => { void updateProgress(scan.id, message, percent); },
  });
  await updateProgress(scan.id, "Comparing Shopify theme files", 84);
  const representativePage = result.preview[0];
  result.codeChanges = await compareThemeFiles(admin, payload.baselineThemeId, payload.comparisonThemeId, representativePage?.pageType ?? pageTypeFromPath(pagePaths[0]), representativePage?.sections ?? []);
  if (payload.codeOnly) {
    await updateProgress(scan.id, "Checking changed code for accessibility", 93);
    result.codeAccessibilityIssues = await auditChangedThemeAccessibility(admin, payload.comparisonThemeId, result.codeChanges.filter((change) => change.status !== "removed").map((change) => change.filename));
  }
  await prisma.scan.update({ where: { id: scan.id }, data: { status: "completed", progress: 100, progressMessage: "Report ready", resultJson: JSON.stringify(result), jobPayload: null, error: null } });
}

declare global {
  // eslint-disable-next-line no-var
  var scanWorkerPromise: Promise<void> | undefined;
}

async function workQueue(): Promise<void> {
  const staleBefore = new Date(Date.now() - 15 * 60_000);
  await prisma.scan.updateMany({ where: { status: "running", updatedAt: { lt: staleBefore }, jobPayload: { not: null }, attempts: { lt: 3 } }, data: { status: "queued", progressMessage: "Resuming after interruption" } });
  await prisma.scan.updateMany({ where: { status: "running", updatedAt: { lt: staleBefore }, attempts: { gte: 3 } }, data: { status: "failed", error: "Scan could not be resumed after three attempts.", jobPayload: null } });
  for (;;) {
    const next = await prisma.scan.findFirst({ where: { status: "queued", jobPayload: { not: null } }, orderBy: { createdAt: "asc" }, select: { id: true, shop: true, jobPayload: true } });
    if (!next) return;
    const claimed = await prisma.scan.updateMany({ where: { id: next.id, status: "queued" }, data: { status: "running", progress: 3, progressMessage: "Starting comparison", attempts: { increment: 1 } } });
    if (!claimed.count) continue;
    try {
      await executeJob(next);
    } catch (error) {
      await prisma.scan.update({ where: { id: next.id }, data: { status: "failed", error: error instanceof Error ? error.message : "Scan failed.", progressMessage: "Scan failed", jobPayload: null } });
    }
  }
}

export function kickScanWorker(): void {
  if (global.scanWorkerPromise) return;
  global.scanWorkerPromise = workQueue().catch((error) => {
    console.error("Scan worker could not check the queue:", error);
  }).finally(() => { global.scanWorkerPromise = undefined; });
}

export async function scanJobStatus(scanId: string, shop: string): Promise<{ status: string; progress: number; message: string; error: string | null; result?: EmbeddedScanResult }> {
  const scan = await prisma.scan.findFirst({ where: { id: scanId, shop }, select: { status: true, progress: true, progressMessage: true, error: true, resultJson: true } });
  if (!scan) throw new Response("Not found", { status: 404 });
  let result: EmbeddedScanResult | undefined;
  if (scan.resultJson && scan.status === "completed") result = refreshArtifactUrls(JSON.parse(scan.resultJson) as EmbeddedScanResult, shop);
  return { status: scan.status, progress: scan.progress, message: scan.progressMessage ?? "Working", error: scan.error, result };
}
