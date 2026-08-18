import type { EmbeddedScanResult } from "./scan.server";
import { buildReportSummary } from "../src/report-summary";

export interface AiReportExplanation {
  summary: string;
  releaseRationale: string;
  actions: Array<{ title: string; reason: string; evidenceIds: string[] }>;
  generatedBy: string;
}

export interface AiReportFactPack {
  releaseDecision: string;
  deterministicSummary: string;
  metrics: { pagesCompared: number; newConcerns: number; resolvedConcerns: number; changedSections: number; changedFiles: number };
  evidence: Array<{ id: string; severity: string; message: string; location: string }>;
  changedFiles: Array<{ filename: string; status: string; summary: string; affectedSections: string[] }>;
}

export function buildAiReportFactPack(result: EmbeddedScanResult): AiReportFactPack {
  const summary = buildReportSummary(result);
  return {
    releaseDecision: summary.decision,
    deterministicSummary: `${summary.headline}. ${summary.description}`,
    metrics: { pagesCompared: summary.pagesCompared, newConcerns: summary.newConcerns, resolvedConcerns: summary.resolvedConcerns, changedSections: summary.changedSections, changedFiles: summary.changedFiles },
    evidence: summary.priorities.map((item, index) => ({ id: `finding-${index + 1}`, severity: item.severity, message: item.message.slice(0, 500), location: `${item.page}${item.page.startsWith("/") ? ` (${item.viewport})` : ""}` })),
    changedFiles: (result.codeChanges ?? []).slice(0, 30).map((change) => ({ filename: change.filename, status: change.status, summary: change.summary.slice(0, 500), affectedSections: change.affectedSections.slice(0, 10) })),
  };
}

export function parseAiReportExplanation(value: string, allowedEvidenceIds: Set<string>, model: string): AiReportExplanation | undefined {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (typeof parsed.summary !== "string" || typeof parsed.releaseRationale !== "string" || !Array.isArray(parsed.actions)) return undefined;
    const actions = parsed.actions.slice(0, 3).flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object") return [];
      const action = candidate as Record<string, unknown>;
      if (typeof action.title !== "string" || typeof action.reason !== "string" || !Array.isArray(action.evidenceIds)) return [];
      const evidenceIds = action.evidenceIds.filter((id): id is string => typeof id === "string" && allowedEvidenceIds.has(id));
      if (action.evidenceIds.length > 0 && evidenceIds.length === 0) return [];
      return [{ title: action.title.slice(0, 160), reason: action.reason.slice(0, 500), evidenceIds }];
    });
    return { summary: parsed.summary.slice(0, 600), releaseRationale: parsed.releaseRationale.slice(0, 600), actions, generatedBy: model };
  } catch { return undefined; }
}

function responseText(payload: { output_text?: unknown; output?: unknown }): string | undefined {
  if (typeof payload.output_text === "string") return payload.output_text;
  if (!Array.isArray(payload.output)) return undefined;
  for (const item of payload.output) {
    if (!item || typeof item !== "object" || !Array.isArray((item as { content?: unknown }).content)) continue;
    for (const content of (item as { content: unknown[] }).content) {
      if (content && typeof content === "object" && typeof (content as { text?: unknown }).text === "string") return (content as { text: string }).text;
    }
  }
  return undefined;
}

export async function generateAiReportExplanation(result: EmbeddedScanResult): Promise<AiReportExplanation | undefined> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return undefined;
  const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";
  const facts = buildAiReportFactPack(result);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model, store: false,
        instructions: "Explain a Shopify theme QA release recommendation to a merchant or QA specialist. Use only the supplied facts. Never invent a defect, page, section, cause, or fix. Every action based on a finding must cite its supplied evidence ID. If there are no findings, do not imply that a problem exists. Be concise and practical.",
        input: JSON.stringify(facts), max_output_tokens: 900,
        text: { format: { type: "json_schema", name: "qa_report_explanation", strict: true, schema: {
          type: "object",
          properties: { summary: { type: "string" }, releaseRationale: { type: "string" }, actions: { type: "array", maxItems: 3, items: { type: "object", properties: { title: { type: "string" }, reason: { type: "string" }, evidenceIds: { type: "array", items: { type: "string" } } }, required: ["title", "reason", "evidenceIds"], additionalProperties: false } } },
          required: ["summary", "releaseRationale", "actions"], additionalProperties: false,
        } } },
      }),
    });
    if (!response.ok) throw new Error(`OpenAI request returned ${response.status}`);
    const payload = await response.json() as { output_text?: unknown; output?: unknown };
    const output = responseText(payload);
    if (!output) return undefined;
    return parseAiReportExplanation(output, new Set(facts.evidence.map((item) => item.id)), model);
  } catch (error) {
    console.warn("AI report explanation was skipped:", error instanceof Error ? error.message : "unknown error");
    return undefined;
  }
}
