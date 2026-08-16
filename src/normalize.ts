import { createHash } from "node:crypto";
import type { QaIssue } from "./domain";

const SENSITIVE_QUERY_KEYS = new Set(["_bt", "key", "password", "preview_token", "token", "access_token"]);

export function redactUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) url.searchParams.set(key, "REDACTED");
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

export function redactSensitiveText(value: string): string {
  const urlsRedacted = value.replace(/https?:\/\/[^\s"'<>]+/gi, (match) => redactUrl(match));
  return urlsRedacted.replace(/([?&](?:_bt|key|password|preview_token|token|access_token)=)[^&\s"'<>]+/gi, "$1REDACTED");
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return redactSensitiveText(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeValue(item)]));
  return value;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableValue(item)]));
  return value;
}

export function fingerprintIssue(issue: Omit<QaIssue, "fingerprint">, pageUrl: string): string {
  const identity = JSON.stringify(stableValue({ rule: issue.rule, url: redactUrl(pageUrl), selector: issue.selector ?? null, evidence: issue.evidence ?? null }));
  return createHash("sha256").update(identity).digest("hex").slice(0, 20);
}

export function normalizeIssues(issues: Array<Omit<QaIssue, "fingerprint">>, pageUrl: string): QaIssue[] {
  const seen = new Set<string>();
  const result: QaIssue[] = [];
  for (const rawIssue of issues) {
    const issue = sanitizeValue(rawIssue) as Omit<QaIssue, "fingerprint">;
    const fingerprint = fingerprintIssue(issue, pageUrl);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    result.push({ ...issue, fingerprint });
  }
  return result;
}
