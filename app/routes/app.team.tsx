import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { isShopRole } from "../../src/roles";
import { registerShopMember, requireTeamOwner, setMemberRole } from "../team.server";
import "../globals.css";

type ActionData = { error?: string; success?: string };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const current = await registerShopMember(session);
  const members = await prisma.shopMember.findMany({ where: { shop: session.shop }, orderBy: [{ role: "asc" }, { createdAt: "asc" }] });
  return { members, currentRole: current.role };
};

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionData> => {
  const { session } = await authenticate.admin(request);
  await requireTeamOwner(session);
  const form = await request.formData();
  const memberId = form.get("memberId");
  const role = form.get("role");
  if (typeof memberId !== "string" || !isShopRole(role)) return { error: "Select a valid role." };
  try {
    await setMemberRole(session.shop, memberId, role);
    return { success: "Team role updated." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Role could not be updated." };
  }
};

export default function Team() {
  const { members, currentRole } = useLoaderData<typeof loader>();
  const result = useActionData<ActionData>();
  const busy = useNavigation().state !== "idle";
  return <s-page heading="Team"><div className="qa-main team-page"><header className="history-heading"><div><span className="eyebrow">Store access</span><h1>Your QA team</h1><p>Roles apply to Shopify staff members who have opened this app.</p></div><span className="status-pill completed">You are {currentRole}</span></header>{result?.error && <div className="error" role="alert">{result.error}</div>}{result?.success && <div className="success" role="status">{result.success}</div>}<section className="team-list">{members.map((member) => <article className="team-row" key={member.id}><div><span className="member-avatar" aria-hidden="true">{member.displayName.slice(0, 1).toUpperCase()}</span><div><h2>{member.displayName}</h2><p>{member.email ?? "Shopify identity"} · Last active {new Date(member.lastSeenAt).toLocaleString()}</p></div></div>{currentRole === "owner" ? <Form method="post"><input type="hidden" name="memberId" value={member.id}/><select name="role" defaultValue={member.role} aria-label={`Role for ${member.displayName}`}><option value="owner">Owner</option><option value="editor">Editor</option><option value="viewer">Viewer</option></select><button disabled={busy} type="submit">Save</button></Form> : <span className="status-pill">{member.role}</span>}</article>)}</section><div className="role-guide"><article><strong>Owner</strong><p>Manages roles, settings, schedules, and scans.</p></article><article><strong>Editor</strong><p>Runs scans and manages schedules and notifications.</p></article><article><strong>Viewer</strong><p>Can open reports and history without changing settings.</p></article></div></div></s-page>;
}

export function ErrorBoundary() { return boundary.error(useRouteError()); }
export const headers: HeadersFunction = (args) => boundary.headers(args);
