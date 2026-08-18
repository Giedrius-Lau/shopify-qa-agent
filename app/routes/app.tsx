import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import { registerShopMember } from "../team.server";
import { syncShopPlan } from "../usage.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  await registerShopMember(session);
  try {
    const { hasActivePayment } = await billing.check();
    await syncShopPlan(session.shop, hasActivePayment, new URL(request.url).searchParams.get("plan_handle"));
  } catch (error) {
    console.error("Could not refresh Shopify plan status:", error);
  }

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <NavMenu>
        <a href="/app" rel="home">New comparison</a>
        <a href="/app/scans">Scan history</a>
        <a href="/app/schedules">Schedules</a>
        <a href="/app/notifications">Notifications</a>
        <a href="/app/team">Team</a>
        <a href="/app/billing">Plans</a>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
