import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { deleteShopData } from "../retention.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received compliance webhook ${topic} for ${shop}`);

  if (topic === "SHOP_REDACT") {
    await deleteShopData(shop);
  }

  // The app does not request customer/order scopes and stores no customer records,
  // so customer data requests and redactions require no additional action.
  return new Response(null, { status: 200 });
};
