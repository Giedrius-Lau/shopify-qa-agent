import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { shopUsage, syncShopPlan } from "../usage.server";
import "../globals.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  try {
    const { hasActivePayment } = await billing.check();
    await syncShopPlan(session.shop, hasActivePayment, new URL(request.url).searchParams.get("plan_handle"));
  } catch (error) {
    console.error("Could not refresh Shopify plan status:", error);
  }
  const usage = await shopUsage(session.shop);
  const storeHandle = session.shop.replace(/\.myshopify\.com$/i, "");
  const appHandle = process.env.SHOPIFY_APP_HANDLE || "theme-qa-agent";
  return { usage, pricingUrl: `https://admin.shopify.com/store/${encodeURIComponent(storeHandle)}/charges/${encodeURIComponent(appHandle)}/pricing_plans` };
};

export default function Billing() {
  const { usage, pricingUrl } = useLoaderData<typeof loader>();
  return <s-page heading="Plans"><div className="qa-main billing-page"><header className="history-heading"><div><span className="eyebrow">Usage and billing</span><h1>Your plan</h1><p>Billing is handled securely by Shopify. Development-store test plans do not create a real charge.</p></div><a className="new-scan-link" href={pricingUrl} target="_top">View Shopify plans</a></header><section className="plan-current"><div><span className="status-pill completed">{usage.tier === "paid" ? "Paid" : "Beta"}</span><h2>{usage.tier === "paid" ? "Professional" : "Free beta"}</h2><p>{usage.planHandle ? `Shopify plan: ${usage.planHandle}` : "No active paid Shopify subscription."}</p></div><div className="usage-grid"><article><strong>{usage.scansThisMonth}</strong><span>of {usage.limits.scansPerMonth} scans this month</span><progress value={usage.scansThisMonth} max={usage.limits.scansPerMonth}/></article><article><strong>{usage.activeSchedules}</strong><span>of {usage.limits.activeSchedules} active schedules</span><progress value={usage.activeSchedules} max={usage.limits.activeSchedules}/></article></div></section><section className="role-guide plan-guide"><article><h3>Free beta</h3><p>25 comparisons each month and one active schedule. Reports, code checks, screenshots, history, and notifications are included.</p></article><article><h3>Professional</h3><p>1,000 comparisons each month and up to 20 active schedules. Shopify plan selection becomes available after pricing is configured in the Partner Dashboard.</p></article></section></div></s-page>;
}

export function ErrorBoundary() { return boundary.error(useRouteError()); }
export const headers: HeadersFunction = (args) => boundary.headers(args);
