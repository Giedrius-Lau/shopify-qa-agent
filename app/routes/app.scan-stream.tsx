import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { enqueueScan, kickScanWorker, scanJobStatus } from "../scan-jobs.server";
import { getStoreThemes } from "../themes.server";
import type { ViewportName } from "../../src/domain";
import { normalizePagePaths } from "../../src/page-paths";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const scanId = new URL(request.url).searchParams.get("scanId");
  if (!scanId) return Response.json({ error: "Missing scan identifier." }, { status: 400 });
  kickScanWorker();
  return Response.json(await scanJobStatus(scanId, session.shop), { headers: { "cache-control": "no-store" } });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  try {
    const body = await request.json() as { pagePaths?: unknown; pagePath?: unknown; baselineThemeId?: unknown; comparisonThemeId?: unknown; storePassword?: unknown; viewports?: unknown; codeOnly?: unknown };
    const pagePaths = normalizePagePaths(body.pagePaths, body.pagePath);
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
    const scanId = await enqueueScan(session.shop, {
      pagePaths,
      baselineThemeId: baselineTheme.id,
      baselineThemeRole: baselineTheme.role,
      comparisonThemeId: comparisonTheme.id,
      viewports,
      storefrontPassword: typeof body.storePassword === "string" && body.storePassword ? body.storePassword : undefined,
      codeOnly,
    });
    kickScanWorker();
    return Response.json({ scanId }, { status: 202 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Scan could not be queued." }, { status: 400 });
  }
};
