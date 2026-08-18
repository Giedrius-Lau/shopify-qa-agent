import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData, useNavigation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { isValidNotificationEmail } from "../../src/email";
import "../globals.css";

type ActionData = { error?: string; success?: string };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [notifications, settings] = await Promise.all([
    prisma.notification.findMany({ where: { shop: session.shop }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.shopNotificationSettings.findUnique({ where: { shop: session.shop } }),
  ]);
  return { notifications, settings, emailAvailable: Boolean(process.env.RESEND_API_KEY && process.env.NOTIFICATION_FROM_EMAIL) };
};

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionData> => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");
  if (intent === "read-all") {
    await prisma.notification.updateMany({ where: { shop: session.shop, readAt: null }, data: { readAt: new Date() } });
    return { success: "Notifications marked as read." };
  }
  const emailEnabled = form.get("emailEnabled") === "on";
  const email = form.get("email");
  if (emailEnabled && !isValidNotificationEmail(email)) return { error: "Enter a valid notification email." };
  await prisma.shopNotificationSettings.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, email: isValidNotificationEmail(email) ? email : null, emailEnabled },
    update: { email: isValidNotificationEmail(email) ? email : null, emailEnabled },
  });
  return { success: "Notification preferences saved." };
};

export default function Notifications() {
  const { notifications, settings, emailAvailable } = useLoaderData<typeof loader>();
  const result = useActionData<ActionData>();
  const busy = useNavigation().state !== "idle";
  const unread = notifications.filter((item) => !item.readAt).length;
  return <s-page heading="Notifications"><div className="qa-main notification-page"><header className="history-heading"><div><span className="eyebrow">Automatic QA alerts</span><h1>Notifications</h1><p>Scheduled scan results stay attached to your Shopify store.</p></div>{unread > 0 && <Form method="post"><button name="intent" value="read-all" disabled={busy}>Mark all read</button></Form>}</header>{result?.error && <div className="error" role="alert">{result.error}</div>}{result?.success && <div className="success" role="status">{result.success}</div>}<section className="notification-settings"><h2>Email delivery</h2><Form method="post" className="notification-form"><label>Email<input type="email" name="email" defaultValue={settings?.email ?? ""} placeholder="qa@example.com"/></label><label className="check-row"><input type="checkbox" name="emailEnabled" defaultChecked={settings?.emailEnabled ?? false}/> Email scheduled scan results</label><button disabled={busy || !emailAvailable} type="submit">Save preferences</button></Form>{!emailAvailable && <p className="repeat-privacy">In-app notifications work now. Add RESEND_API_KEY and NOTIFICATION_FROM_EMAIL in Render to enable email delivery.</p>}</section><section className="notification-list">{notifications.length === 0 ? <p className="empty">No scheduled scan notifications yet.</p> : notifications.map((item) => <article className={`notification-row ${item.readAt ? "" : "unread"}`} key={item.id}><div><span className={`status-pill ${item.kind === "failed" ? "failed" : "completed"}`}>{item.kind}</span><h3>{item.title}</h3><p>{item.message}</p><small>{new Date(item.createdAt).toLocaleString()}{item.emailedAt ? " · Email sent" : ""}</small></div><Link className="report-link secondary" to={`/app?scan=${encodeURIComponent(item.scanId)}`}>View report</Link></article>)}</section></div></s-page>;
}

export function ErrorBoundary() { return boundary.error(useRouteError()); }
export const headers: HeadersFunction = (args) => boundary.headers(args);
