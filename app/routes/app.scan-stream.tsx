import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { runEmbeddedComparison } from "../scan.server";
import { compareThemeFiles } from "../theme-code.server";
import { getStoreThemes } from "../themes.server";
import type { ShopifyPageType, ViewportName } from "../../src/domain";

function pageTypeFromPath(pagePath: string): ShopifyPageType {
  if (pagePath === "/") return "home";
  const segment = pagePath.split("/").filter(Boolean)[0];
  return segment === "products" ? "product" : segment === "collections" ? "collection" : segment === "cart" ? "cart" : segment === "search" ? "search" : segment === "pages" ? "page" : "unknown";
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const body = await request.json() as { pagePath?: unknown; baselineThemeId?: unknown; comparisonThemeId?: unknown; storePassword?: unknown; viewports?: unknown; codeOnly?: unknown };
  const encoder = new TextEncoder();
  const stream = new ReadableStream({ start(controller) {
    const send = (value: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
    void (async () => {
      try {
        send({ type: "progress", percent: 3, message: "Validating themes" });
        if (typeof body.pagePath !== "string" || !body.pagePath.startsWith("/") || body.pagePath.startsWith("//")) throw new Error("Enter a valid storefront page path.");
        const themes = await getStoreThemes(admin);
        const baselineTheme = themes.find((theme) => theme.id === body.baselineThemeId);
        const comparisonTheme = themes.find((theme) => theme.id === body.comparisonThemeId && theme.role === "UNPUBLISHED");
        if (!baselineTheme) throw new Error("Select a valid baseline theme.");
        if (!comparisonTheme) throw new Error("Select an unpublished comparison theme.");
        if (baselineTheme.id === comparisonTheme.id) throw new Error("Select two different themes.");
        const codeOnly = body.codeOnly === true;
        const requested = Array.isArray(body.viewports) ? body.viewports : [];
        const viewports = requested.filter((value): value is ViewportName => value === "desktop" || value === "mobile");
        if (!codeOnly && viewports.length === 0) throw new Error("Select at least one viewport.");
        if (body.storePassword !== undefined && (typeof body.storePassword !== "string" || body.storePassword.length > 256)) throw new Error("Storefront password is invalid.");
        send({ type: "progress", percent: 8, message: codeOnly ? "Preparing code comparison" : "Opening storefront themes" });
        const result = await runEmbeddedComparison({ shop: session.shop, pagePath: body.pagePath, baselineThemeId: baselineTheme.id, baselineThemeRole: baselineTheme.role, comparisonThemeId: comparisonTheme.id, viewports: codeOnly ? [] : viewports, storefrontPassword: typeof body.storePassword === "string" ? body.storePassword : undefined, skipPageScan: codeOnly, onProgress: (message, percent) => send({ type: "progress", percent, message }) });
        send({ type: "progress", percent: 84, message: "Comparing Shopify theme files" });
        const representativePage = result.preview[0];
        result.codeChanges = await compareThemeFiles(admin, baselineTheme.id, comparisonTheme.id, representativePage?.pageType ?? pageTypeFromPath(body.pagePath), representativePage?.sections ?? []);
        await prisma.scan.update({ where: { id: result.scanId }, data: { resultJson: JSON.stringify(result) } });
        send({ type: "progress", percent: 100, message: "Report ready" });
        send({ type: "result", result });
      } catch (error) {
        send({ type: "error", error: error instanceof Error ? error.message : "Scan failed." });
      } finally {
        controller.close();
      }
    })();
  } });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
};
