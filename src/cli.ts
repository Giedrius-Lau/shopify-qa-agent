#!/usr/bin/env node
import path from "node:path";
import { runScan } from "./scanner";
import { summarizeIssues, type ScanResult, type ViewportName } from "./domain";
import { redactUrl } from "./normalize";

function usage(): never {
  console.error("Usage: npm run scan -- <url> [url...] [--viewport desktop|mobile|both]");
  process.exit(1);
}

const args = process.argv.slice(2);
const viewportIndex = args.indexOf("--viewport");
const choice = viewportIndex >= 0 ? args[viewportIndex + 1] : "both";
if (!choice || !["desktop", "mobile", "both"].includes(choice)) usage();
const urls = args.filter((arg) => arg.startsWith("http://") || arg.startsWith("https://"));
if (urls.length === 0) usage();
const viewports: ViewportName[] = choice === "both" ? ["desktop", "mobile"] : [choice as ViewportName];
const started = Date.now();
const artifactDirectory = path.resolve("scan-artifacts", new Date(started).toISOString().replaceAll(":", "-"));

try {
  const pages = await runScan(urls, viewports, artifactDirectory, (message) => console.error(message));
  const result: ScanResult = { schemaVersion: "1.0", requestedUrls: urls.map(redactUrl), startedAt: new Date(started).toISOString(), durationMs: Date.now() - started, pages, summary: summarizeIssues(pages) };
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
