import type { MetaFunction } from "react-router";
import { PublicPage } from "../public-page";

export const meta: MetaFunction = () => [{ title: "Support | Theme QA Agent" }, { name: "description", content: "Get help with Theme QA Agent." }];

export default function Support() {
  return <PublicPage title="How can we help?">
    <p>For installation, scanning, billing, privacy, or report questions, email <a href="mailto:lauruska.giedrius@gmail.com">lauruska.giedrius@gmail.com</a>. Include your shop domain and scan ID, but never send a storefront password or Shopify access token.</p>
    <h2>Before contacting support</h2>
    <ol><li>Open Scan history and retry the scan once.</li><li>Confirm both selected themes still exist.</li><li>For a protected development store, re-enter the storefront password in the scan form.</li><li>If the app has just woken from the free Render tier, allow up to one minute.</li></ol>
    <h2>Response target</h2><p>Private-beta support requests are normally answered within two business days.</p>
    <h2>Service status</h2><p>The public health endpoint is available at <a href="/healthz">/healthz</a>.</p>
  </PublicPage>;
}
