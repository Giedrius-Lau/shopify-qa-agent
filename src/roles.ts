export type ShopRole = "owner" | "editor" | "viewer";

export function isShopRole(value: unknown): value is ShopRole {
  return value === "owner" || value === "editor" || value === "viewer";
}

export function canManageTeam(role: string): boolean {
  return role === "owner";
}

export function canRunScans(role: string): boolean {
  return role === "owner" || role === "editor";
}
