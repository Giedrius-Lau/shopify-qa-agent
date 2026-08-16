export type StoreTheme = { id: string; name: string; role: string; processing: boolean };
export type ThemeAdmin = { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> };

export async function getStoreThemes(admin: ThemeAdmin): Promise<StoreTheme[]> {
  const response = await admin.graphql(`#graphql
    query ThemeQaThemes { themes(first: 50) { nodes { id name role processing } } }
  `);
  const payload = await response.json() as { data?: { themes?: { nodes?: StoreTheme[] } }; errors?: Array<{ message: string }> };
  if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message).join(" "));
  return payload.data?.themes?.nodes ?? [];
}
