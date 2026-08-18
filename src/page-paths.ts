export function normalizePagePaths(value: unknown, fallback?: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof fallback === "string" ? [fallback] : [];
  const paths = values.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  const unique = [...new Set(paths)];
  if (unique.length === 0) throw new Error("Select at least one storefront page.");
  if (unique.length > 10) throw new Error("Select no more than 10 pages per scan.");
  for (const pagePath of unique) {
    if (!pagePath.startsWith("/") || pagePath.startsWith("//")) throw new Error("Enter valid storefront page paths.");
    const parsed = new URL(pagePath, "https://shop.example");
    if (parsed.origin !== "https://shop.example" || parsed.username || parsed.password) throw new Error("Enter valid storefront page paths.");
  }
  return unique;
}
