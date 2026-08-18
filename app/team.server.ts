import { randomUUID } from "node:crypto";
import prisma from "./db.server";
import { canManageTeam, canRunScans, type ShopRole } from "../src/roles";

type ShopifySessionIdentity = {
  id: string;
  shop: string;
  userId?: bigint | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  accountOwner?: boolean | null;
};

function memberIdentity(session: ShopifySessionIdentity): string {
  if (session.userId) return `shopify:${session.userId.toString()}`;
  if (session.email) return `email:${session.email.toLowerCase()}`;
  return `session:${session.id}`;
}

export async function registerShopMember(session: ShopifySessionIdentity) {
  const identity = memberIdentity(session);
  const existing = await prisma.shopMember.findUnique({ where: { shop_identity: { shop: session.shop, identity } } });
  const displayName = [session.firstName, session.lastName].filter(Boolean).join(" ") || session.email || "Shopify staff member";
  if (existing) return prisma.shopMember.update({ where: { id: existing.id }, data: { displayName, email: session.email ?? existing.email, lastSeenAt: new Date(), ...(session.accountOwner ? { role: "owner" } : {}) } });
  const ownerCount = await prisma.shopMember.count({ where: { shop: session.shop, role: "owner" } });
  return prisma.shopMember.create({ data: { id: randomUUID(), shop: session.shop, identity, displayName, email: session.email ?? null, role: session.accountOwner || ownerCount === 0 ? "owner" : "viewer" } });
}

export async function requireScanPermission(session: ShopifySessionIdentity): Promise<void> {
  const member = await registerShopMember(session);
  if (!canRunScans(member.role)) throw new Response("Your team role cannot run scans.", { status: 403 });
}

export async function requireTeamOwner(session: ShopifySessionIdentity): Promise<void> {
  const member = await registerShopMember(session);
  if (!canManageTeam(member.role)) throw new Response("Only a team owner can manage roles.", { status: 403 });
}

export async function setMemberRole(shop: string, memberId: string, role: ShopRole): Promise<void> {
  const member = await prisma.shopMember.findFirst({ where: { id: memberId, shop } });
  if (!member) throw new Error("Team member not found.");
  if (member.role === "owner" && role !== "owner") {
    const owners = await prisma.shopMember.count({ where: { shop, role: "owner" } });
    if (owners <= 1) throw new Error("A store must keep at least one owner.");
  }
  await prisma.shopMember.update({ where: { id: member.id }, data: { role } });
}
