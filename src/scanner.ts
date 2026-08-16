import { mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type ConsoleMessage, type Page, type Request } from "playwright";
import type { PageMetadata, PageScanResult, QaIssue, SectionSnapshot, Severity, ShopifyPageType, ViewportName } from "./domain";
import { normalizeIssues, redactUrl } from "./normalize";
import { assertSafePublicUrl } from "./security";

const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } } as const;
const LINK_CHECK_LIMIT = 25;
type PendingIssue = Omit<QaIssue, "fingerprint">;
type AxeResult = { violations: Array<{ id: string; impact: string | null; help: string; helpUrl: string; nodes: Array<{ target: string[]; html: string; failureSummary?: string }> }> };
type RawSection = Omit<SectionSnapshot, "structureFingerprint"> & { structure: string };
let cachedAxeSource: string | undefined;

async function loadAxeSource(): Promise<string> {
  cachedAxeSource ??= await readFile(path.resolve("node_modules", "axe-core", "axe.min.js"), "utf8");
  return cachedAxeSource;
}

function sectionFingerprint(structure: string): string {
  return createHash("sha256").update(structure).digest("hex").slice(0, 16);
}

function axeSeverity(impact: string | null): Severity {
  return impact === "critical" ? "critical" : impact === "serious" ? "high" : impact === "moderate" ? "medium" : "low";
}

export function detectShopifyPageType(url: string, bodyClasses = "", hasProductForm = false): ShopifyPageType {
  const pathname = new URL(url).pathname.replace(/\/+$/, "") || "/";
  if (pathname === "/") return "home";
  if (pathname.startsWith("/products/")) return "product";
  if (pathname.startsWith("/collections/")) return "collection";
  if (pathname === "/cart") return "cart";
  if (pathname === "/search") return "search";
  if (pathname.startsWith("/pages/")) return "page";
  if (hasProductForm || /template-product/i.test(bodyClasses)) return "product";
  return "unknown";
}

async function collectBrokenLinks(context: BrowserContext, links: string[]): Promise<PendingIssue[]> {
  const issues: PendingIssue[] = [];
  for (const link of links.slice(0, LINK_CHECK_LIMIT)) {
    try {
      let response = await context.request.head(link, { failOnStatusCode: false, maxRedirects: 0, timeout: 5_000 });
      if (response.status() === 403 || response.status() === 405) response = await context.request.get(link, { failOnStatusCode: false, maxRedirects: 0, timeout: 5_000 });
      if (response.status() >= 400) issues.push({ type: "network", severity: response.status() >= 500 ? "high" : "medium", rule: "broken-link", message: `Link returned HTTP ${response.status()}`, evidence: { url: redactUrl(link), status: response.status() } });
    } catch (error) {
      issues.push({ type: "network", severity: "high", rule: "broken-link", message: "Link request failed", evidence: { url: redactUrl(link), error: error instanceof Error ? error.message : String(error) } });
    }
  }
  return issues;
}

async function unlockShopifyStorefront(page: Page, originalUrl: string, password?: string): Promise<void> {
  const passwordInput = page.locator('form[action*="/password"] input[type="password"], input[name="password"][type="password"]').first();
  if (await passwordInput.count() === 0) return;
  if (!password) throw new Error("This Shopify storefront is password protected. Enter its storefront password and retry.");
  await passwordInput.fill(password);
  const submit = page.locator('form[action*="/password"] button[type="submit"], form[action*="/password"] input[type="submit"]').first();
  if (await submit.count() === 0) throw new Error("Shopify password form submit button was not found.");
  await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => null), submit.click()]);
  if (await page.locator('input[name="password"][type="password"]').count() > 0) throw new Error("The Shopify storefront password was rejected.");
  await page.goto(originalUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
}

export async function scanViewport(browser: Browser, url: string, viewport: ViewportName, artifactDirectory: string, artifactStem: string, storefrontPassword?: string): Promise<PageScanResult> {
  await assertSafePublicUrl(url);
  const started = Date.now();
  const issues: PendingIssue[] = [];
  const context = await browser.newContext({ viewport: VIEWPORTS[viewport], userAgent: viewport === "mobile" ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148" : undefined });
  try {
    await context.route("**/*", async (route) => {
      if (route.request().isNavigationRequest()) {
        try { await assertSafePublicUrl(route.request().url()); } catch { await route.abort("blockedbyclient"); return; }
      }
      await route.continue();
    });
    const page = await context.newPage();
    page.on("console", (message: ConsoleMessage) => {
      if (message.type() === "error" && !/^Failed to load resource:/i.test(message.text())) issues.push({ type: "console", severity: "medium", rule: "console-error", message: message.text(), evidence: { location: { ...message.location(), url: redactUrl(message.location().url) } } });
    });
    page.on("requestfailed", (request: Request) => issues.push({ type: "network", severity: "high", rule: "request-failed", message: `${request.method()} request failed`, evidence: { url: redactUrl(request.url()), failure: request.failure()?.errorText, resourceType: request.resourceType() } }));
    page.on("response", (response) => {
      if (response.status() >= 400) issues.push({ type: "network", severity: response.status() >= 500 ? "high" : "medium", rule: "http-error", message: `HTTP ${response.status()} response`, evidence: { url: redactUrl(response.url()), status: response.status(), resourceType: response.request().resourceType() } });
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await unlockShopifyStorefront(page, url, storefrontPassword);
    await page.waitForTimeout(1_000);
    await assertSafePublicUrl(page.url());
    const finalUrl = page.url();
    const pageInfo = await page.evaluate<PageMetadata & { bodyClasses: string; hasProductForm: boolean }>(() => ({
      title: document.title.trim() || null,
      description: document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content.trim() || null,
      canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href || null,
      lang: document.documentElement.lang.trim() || null,
      h1Count: document.querySelectorAll("h1").length,
      imageCount: document.images.length,
      bodyClasses: document.body.className,
      hasProductForm: Boolean(document.querySelector('form[action*="/cart/add"]')),
    }));
    const { bodyClasses, hasProductForm, ...metadata } = pageInfo;
    const pageType = detectShopifyPageType(finalUrl, bodyClasses, hasProductForm);
    const rawSections = await page.evaluate<RawSection[]>(() => Array.from(document.querySelectorAll<HTMLElement>('[id^="shopify-section-"], .shopify-section')).map((section, index) => {
      const id = section.id || `shopify-section-index-${index}`;
      const heading = section.querySelector<HTMLElement>("h1,h2,h3")?.innerText.trim();
      const type = section.dataset.sectionType || section.getAttribute("data-section-type");
      const name = type || heading || id.replace(/^shopify-section-(template--[^_]+__)?/, "").replaceAll("-", " ");
      const structure = Array.from(section.querySelectorAll<HTMLElement>("*")).map((element) => `${element.tagName.toLowerCase()}.${[...element.classList].sort().join(".")}[role=${element.getAttribute("role") || ""}]`).join("|");
      const rect = section.getBoundingClientRect();
      const bounds = { x: rect.left + window.scrollX, y: rect.top + window.scrollY, width: rect.width, height: rect.height };
      return { id, name, index, imageCount: section.querySelectorAll("img,[data-src],[data-bgset]").length, headingCount: section.querySelectorAll("h1,h2,h3,h4,h5,h6").length, buttonCount: section.querySelectorAll('button,[role="button"]').length, linkCount: section.querySelectorAll("a[href]").length, textLength: (section.innerText || "").trim().length, structure, bounds };
    }));
    const sections: SectionSnapshot[] = rawSections.map(({ structure, ...section }) => ({ ...section, structureFingerprint: sectionFingerprint(structure) }));
    const pageHeight = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
    if (!metadata.title) issues.push({ type: "seo", severity: "high", rule: "missing-title", message: "Page is missing a title" });
    if (!metadata.description) issues.push({ type: "seo", severity: "medium", rule: "missing-meta-description", message: "Page is missing a meta description" });
    if (metadata.h1Count !== 1) issues.push({ type: "dom", severity: "medium", rule: "h1-count", message: `Expected one H1, found ${metadata.h1Count}`, evidence: { count: metadata.h1Count } });

    const imageIssues = await page.evaluate(() => Array.from(document.images).flatMap((image) => {
      const selector = image.id ? `#${CSS.escape(image.id)}` : image.getAttribute("src") ? `img[src="${CSS.escape(image.getAttribute("src")!)}"]` : "img";
      const parentSection = image.closest<HTMLElement>('[id^="shopify-section-"], .shopify-section');
      const section = parentSection ? { id: parentSection.id, name: parentSection.dataset.sectionType || parentSection.querySelector<HTMLElement>("h1,h2,h3")?.innerText.trim() || parentSection.id.replace(/^shopify-section-(template--[^_]+__)?/, "").replaceAll("-", " ") } : undefined;
      const result: Array<{ rule: string; message: string; selector: string; section?: { id: string; name: string } }> = [];
      if (!image.hasAttribute("alt")) result.push({ rule: "missing-alt", message: "Image is missing an alt attribute", selector, section });
      if (image.complete && image.naturalWidth === 0) result.push({ rule: "broken-image", message: "Image failed to load", selector, section });
      return result;
    }));
    for (const item of imageIssues) issues.push({ type: "image", severity: item.rule === "broken-image" ? "high" : "medium", ...item });

    const origin = new URL(finalUrl).origin;
    const links = await page.evaluate((pageOrigin) => [...new Set(Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"), (anchor) => anchor.href).filter((href) => { try { const candidate = new URL(href); return candidate.origin === pageOrigin && ["http:", "https:"].includes(candidate.protocol) && !candidate.hash; } catch { return false; } }))], origin);
    issues.push(...await collectBrokenLinks(context, links));

    await page.addScriptTag({ content: await loadAxeSource() });
    const axeResult = await page.evaluate<AxeResult>(async () => await (globalThis as unknown as { axe: { run(): Promise<AxeResult> } }).axe.run());
    const axeNodes = axeResult.violations.flatMap((violation) => violation.nodes.map((node) => ({ violation, node, selector: node.target.join(" ") })));
    const axeSections = await page.evaluate((selectors) => selectors.map((selector) => {
      try {
        const parent = document.querySelector(selector)?.closest<HTMLElement>('[id^="shopify-section-"], .shopify-section');
        return parent ? { id: parent.id, name: parent.dataset.sectionType || parent.querySelector<HTMLElement>("h1,h2,h3")?.innerText.trim() || parent.id.replace(/^shopify-section-(template--[^_]+__)?/, "").replaceAll("-", " ") } : null;
      } catch { return null; }
    }), axeNodes.map(({ selector }) => selector));
    for (const [index, { violation, node, selector }] of axeNodes.entries()) issues.push({ type: "accessibility", severity: axeSeverity(violation.impact), rule: violation.id, selector, message: violation.help, section: axeSections[index] ?? undefined, evidence: { helpUrl: violation.helpUrl, html: node.html, failureSummary: node.failureSummary } });

    await mkdir(artifactDirectory, { recursive: true });
    const screenshotPath = path.resolve(artifactDirectory, `${artifactStem}-${viewport}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const redactedFinalUrl = redactUrl(finalUrl);
    return { requestedUrl: redactUrl(url), finalUrl: redactedFinalUrl, viewport, viewportSize: VIEWPORTS[viewport], pageHeight, pageType, sections, startedAt: new Date(started).toISOString(), durationMs: Date.now() - started, screenshotPath, metadata: { ...metadata, canonical: metadata.canonical ? redactUrl(metadata.canonical) : null }, issues: normalizeIssues(issues, redactedFinalUrl) };
  } finally {
    await context.close();
  }
}

export async function runScan(urls: string[], viewports: ViewportName[], artifactDirectory: string, onProgress?: (message: string) => void, storefrontPasswords: Array<string | undefined> = []): Promise<PageScanResult[]> {
  const browser = await chromium.launch({ headless: true });
  try {
    const pages: PageScanResult[] = [];
    for (const [urlIndex, url] of urls.entries()) for (const viewport of viewports) {
      onProgress?.(`Scanning ${redactUrl(url)} (${viewport})...`);
      pages.push(await scanViewport(browser, url, viewport, artifactDirectory, `page-${urlIndex + 1}`, storefrontPasswords[urlIndex]));
    }
    return pages;
  } finally {
    await browser.close();
  }
}
