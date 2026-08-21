import type { MetaFunction } from "react-router";
import { PublicPage } from "../public-page";

export const meta: MetaFunction = () => [{ title: "Privacy Policy | Theme QA Agent" }, { name: "description", content: "Privacy policy for the Theme QA Agent Shopify app." }];

export default function Privacy() {
  return <PublicPage title="Privacy policy" updated="August 18, 2026">
    <p>Theme QA Agent processes Shopify theme files, selected storefront pages, QA findings, and screenshots to compare published and unpublished themes. It does not request customer or order data.</p>
    <h2>Data we process</h2>
    <ul><li>Shop domain, Shopify session credentials, and authorized staff identity.</li><li>Theme source files and selected storefront page content needed for a scan.</li><li>Scan configuration, results, screenshots, schedules, and notification settings.</li><li>Operational logs needed to secure and troubleshoot the service.</li></ul>
    <h2>How data is used</h2>
    <p>Data is used only to operate, secure, and improve the QA service. Optional AI analysis is disabled by default and receives normalized report facts only—not screenshots, passwords, theme source, or storefront URLs.</p>
    <h2>Storage and retention</h2>
    <p>Application records are stored in PostgreSQL and private screenshots in Cloudflare R2. Completed scan data is retained for up to 90 days by default. Storefront passwords are used in memory only and are never stored.</p>
    <h2>Deletion and privacy requests</h2>
    <p>Uninstalling the app schedules deletion of shop data and private artifacts. Shopify compliance webhooks are supported. For access or deletion questions, contact <a href="mailto:lauruska.giedrius@gmail.com">lauruska.giedrius@gmail.com</a>.</p>
    <h2>Processors and security</h2>
    <p>The service uses Shopify, Render, Neon, Cloudflare, and—only when configured—Resend and OpenAI as service providers. Access is authenticated through Shopify and tenant data is isolated by shop.</p>
  </PublicPage>;
}
