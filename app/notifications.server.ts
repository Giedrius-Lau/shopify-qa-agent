import { randomUUID } from "node:crypto";
import prisma from "./db.server";
import type { EmbeddedScanResult } from "./scan.server";
import { buildReportSummary } from "../src/report-summary";

async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATION_FROM_EMAIL;
  if (!apiKey || !from) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}.`);
  return true;
}

export async function notifyScheduledScan(scanId: string, status: "completed" | "failed", result?: EmbeddedScanResult, error?: string): Promise<void> {
  const schedule = await prisma.scanSchedule.findFirst({ where: { lastScanId: scanId } });
  if (!schedule) return;
  const summary = result ? buildReportSummary(result) : null;
  const title = status === "failed" ? `${schedule.name} scan failed` : summary?.decision === "blocked" || summary?.decision === "review" ? `${schedule.name} needs attention` : `${schedule.name} is ready`;
  const message = status === "failed" ? (error || "The scheduled scan could not be completed.") : `${summary?.newConcerns ?? 0} new concerns across ${summary?.pagesCompared ?? 0} pages. ${summary?.headline ?? "Report ready."}`;
  const notification = await prisma.notification.upsert({
    where: { scheduleId_scanId_kind: { scheduleId: schedule.id, scanId, kind: status } },
    create: { id: randomUUID(), shop: schedule.shop, scheduleId: schedule.id, scanId, kind: status, title, message },
    update: { title, message },
  });
  const settings = await prisma.shopNotificationSettings.findUnique({ where: { shop: schedule.shop } });
  if (!settings?.emailEnabled || !settings.email || notification.emailedAt) return;
  try {
    if (await sendEmail(settings.email, title, `${message}\n\nOpen the Theme QA Agent in Shopify Admin to view the report.`)) {
      await prisma.notification.update({ where: { id: notification.id }, data: { emailedAt: new Date() } });
    }
  } catch (emailError) {
    console.error("Scheduled scan email could not be sent:", emailError);
  }
}
