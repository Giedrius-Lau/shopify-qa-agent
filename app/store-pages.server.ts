import type { ThemeAdmin } from "./themes.server";

export type StorePageOption = {
  path: string;
  label: string;
  type: "home" | "product" | "collection" | "page" | "cart" | "search";
};

type ResourceNode = { title: string; handle: string };

async function queryResources(admin: ThemeAdmin, field: "products" | "collections" | "pages"): Promise<ResourceNode[]> {
  try {
    const response = await admin.graphql(`#graphql
      query ThemeQaPageDiscovery { ${field}(first: 12) { nodes { title handle } } }
    `);
    const payload = await response.json() as { data?: Record<string, { nodes?: ResourceNode[] }>; errors?: Array<{ message: string }> };
    if (payload.errors?.length) return [];
    return payload.data?.[field]?.nodes ?? [];
  } catch {
    return [];
  }
}

export async function discoverStorePages(admin: ThemeAdmin): Promise<StorePageOption[]> {
  const [products, collections, pages] = await Promise.all([
    queryResources(admin, "products"),
    queryResources(admin, "collections"),
    queryResources(admin, "pages"),
  ]);
  return [
    { path: "/", label: "Home page", type: "home" },
    ...products.map((item) => ({ path: `/products/${item.handle}`, label: item.title, type: "product" as const })),
    ...collections.map((item) => ({ path: `/collections/${item.handle}`, label: item.title, type: "collection" as const })),
    ...pages.map((item) => ({ path: `/pages/${item.handle}`, label: item.title, type: "page" as const })),
    { path: "/cart", label: "Cart", type: "cart" },
    { path: "/search", label: "Search", type: "search" },
  ];
}
