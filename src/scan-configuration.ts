import type { ViewportName } from "./domain";
import { normalizePagePaths } from "./page-paths";

export type RepeatableScanConfiguration = {
  pagePaths: string[];
  baselineThemeId: string;
  comparisonThemeId: string;
  viewports: ViewportName[];
  codeOnly: boolean;
};

type ScanConfigurationSource = RepeatableScanConfiguration & {
  baselineThemeRole?: string;
  storefrontPassword?: string;
  explainWithAi?: boolean;
};

const THEME_ID = /^gid:\/\/shopify\/OnlineStoreTheme\/\d+$/;

export function repeatableScanConfiguration(payload: ScanConfigurationSource): RepeatableScanConfiguration {
  return {
    pagePaths: normalizePagePaths(payload.pagePaths),
    baselineThemeId: payload.baselineThemeId,
    comparisonThemeId: payload.comparisonThemeId,
    viewports: [...payload.viewports],
    codeOnly: payload.codeOnly,
  };
}

export function parseRepeatableScanConfiguration(value: string): RepeatableScanConfiguration {
  const parsed = JSON.parse(value) as Partial<RepeatableScanConfiguration>;
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid scan configuration.");
  if (typeof parsed.baselineThemeId !== "string" || !THEME_ID.test(parsed.baselineThemeId)) throw new Error("Invalid baseline theme.");
  if (typeof parsed.comparisonThemeId !== "string" || !THEME_ID.test(parsed.comparisonThemeId)) throw new Error("Invalid comparison theme.");
  if (typeof parsed.codeOnly !== "boolean" || !Array.isArray(parsed.viewports)) throw new Error("Invalid scan mode.");
  const viewports = [...new Set(parsed.viewports)];
  if (viewports.some((viewport) => viewport !== "desktop" && viewport !== "mobile")) throw new Error("Invalid viewport.");
  if (!parsed.codeOnly && viewports.length === 0) throw new Error("Select at least one viewport.");
  return {
    pagePaths: normalizePagePaths(parsed.pagePaths),
    baselineThemeId: parsed.baselineThemeId,
    comparisonThemeId: parsed.comparisonThemeId,
    viewports: viewports as ViewportName[],
    codeOnly: parsed.codeOnly,
  };
}
