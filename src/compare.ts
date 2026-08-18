import type { PageMetadata, QaIssue, SectionSnapshot } from "./domain";

function resourceIdentity(issue: QaIssue): string | null {
  const rawUrl = issue.evidence?.url;
  if (typeof rawUrl !== "string") return null;
  try {
    const url = new URL(rawUrl);
    return `${url.pathname}:${String(issue.evidence?.status ?? "")}:${String(issue.evidence?.resourceType ?? "")}`;
  } catch {
    return rawUrl;
  }
}

function isVolatileRuntimeObservation(issue: QaIssue): boolean {
  if (issue.rule === "request-failed") return true;
  if (issue.rule === "http-error" && [401, 403, 429].includes(Number(issue.evidence?.status))) return true;
  if (issue.rule === "console-error" && /invalid ['"]x-frame-options|allow-from/i.test(issue.message)) return true;
  if (issue.rule === "frame-title" && /(?:src=|https?:\/\/)[^>"']*shop\.app/i.test(String(issue.evidence?.html ?? ""))) return true;
  return false;
}

export function issueComparisonKey(issue: QaIssue): string {
  const section = issue.section ? sectionKey(issue.section.id, issue.section.name) : null;
  const selector = section ? null : issue.selector
    ?.replace(/template--\d+/g, "template--id")
    .replace(/shopify-section-[a-z0-9_-]*\d[a-z0-9_-]*/gi, "shopify-section-dynamic")
    .replace(/([#.][a-z_-]*)(?:\d{6,})([a-z0-9_-]*)/gi, "$1dynamic$2");
  return JSON.stringify({ type: issue.type, rule: issue.rule, section, selector: selector ?? null, message: issue.message, resource: resourceIdentity(issue) });
}

export function compareIssues(live: QaIssue[], preview: QaIssue[]) {
  const stableLive = live.filter((issue) => !isVolatileRuntimeObservation(issue));
  const stablePreview = preview.filter((issue) => !isVolatileRuntimeObservation(issue));
  const remainingLive = new Map<string, QaIssue[]>();
  for (const issue of stableLive) {
    const key = issueComparisonKey(issue);
    remainingLive.set(key, [...(remainingLive.get(key) ?? []), issue]);
  }
  const added: QaIssue[] = [];
  const unchanged: QaIssue[] = [];
  for (const issue of stablePreview) {
    const key = issueComparisonKey(issue);
    const matches = remainingLive.get(key);
    if (!matches?.length) {
      added.push(issue);
      continue;
    }
    matches.pop();
    unchanged.push(issue);
  }
  return {
    added,
    resolved: [...remainingLive.values()].flat(),
    unchanged,
  };
}

export function compareMetadata(live: PageMetadata, preview: PageMetadata) {
  const labels: Record<keyof PageMetadata, string> = { title: "Title", description: "Meta description", canonical: "Canonical URL", lang: "Language", h1Count: "H1 count", imageCount: "Image count" };
  return (Object.keys(labels) as Array<keyof PageMetadata>).flatMap((field) => live[field] === preview[field] ? [] : [{ field, label: labels[field], live: live[field], preview: preview[field] }]);
}

export function sectionKey(id: string, name: string): string {
  const normalizedId = id.replace(/^shopify-section-/, "").replace(/^template--[^_]+__/, "").replace(/^sections--[^_]+__/, "");
  return normalizedId.startsWith("index-") ? name.toLowerCase() : normalizedId;
}

export function compareSections(live: SectionSnapshot[], preview: SectionSnapshot[]) {
  const liveByKey = new Map(live.map((section) => [sectionKey(section.id, section.name), section]));
  const previewByKey = new Map(preview.map((section) => [sectionKey(section.id, section.name), section]));
  const fields = ["imageCount", "headingCount", "buttonCount", "linkCount"] as const;
  const changed = preview.flatMap((previewSection) => {
    const liveSection = liveByKey.get(sectionKey(previewSection.id, previewSection.name));
    if (!liveSection) return [];
    const metrics = fields.flatMap((field) => liveSection[field] === previewSection[field] ? [] : [{ field, live: liveSection[field], preview: previewSection[field], delta: previewSection[field] - liveSection[field] }]);
    const structureChanged = liveSection.structureFingerprint !== previewSection.structureFingerprint;
    return metrics.length > 0 || structureChanged ? [{ key: sectionKey(previewSection.id, previewSection.name), name: previewSection.name, live: liveSection, preview: previewSection, metrics, structureChanged }] : [];
  });
  return {
    added: preview.filter((section) => !liveByKey.has(sectionKey(section.id, section.name))),
    removed: live.filter((section) => !previewByKey.has(sectionKey(section.id, section.name))),
    changed,
  };
}

export function groupIssuesBySection(issues: QaIssue[]) {
  const groups = new Map<string, { key: string; name: string; issues: QaIssue[] }>();
  for (const issue of issues) {
    const key = issue.section ? sectionKey(issue.section.id, issue.section.name) : "global";
    const existing = groups.get(key) ?? { key, name: issue.section?.name || "Page-wide / network", issues: [] };
    existing.issues.push(issue);
    groups.set(key, existing);
  }
  return [...groups.values()];
}
