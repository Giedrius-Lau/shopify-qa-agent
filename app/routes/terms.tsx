import type { MetaFunction } from "react-router";
import { PublicPage } from "../public-page";

export const meta: MetaFunction = () => [{ title: "Terms of Service | Theme QA Agent" }];

export default function Terms() {
  return <PublicPage title="Terms of service" updated="August 18, 2026">
    <p>Theme QA Agent provides automated theme comparison and quality-assurance information. By installing or using the app, you agree to these terms.</p>
    <h2>Authorized use</h2><p>You may scan only stores and themes you are authorized to access. You are responsible for protecting storefront passwords and reviewing findings before changing or publishing a theme.</p>
    <h2>QA results</h2><p>Automated results are decision support, not a guarantee that a storefront is error-free, accessible, legally compliant, or suitable for publication. False positives and missed issues can occur.</p>
    <h2>Availability</h2><p>The beta service is provided as available and may change or experience interruptions. Reasonable safeguards and recovery procedures are used, but uninterrupted operation is not guaranteed.</p>
    <h2>Accounts and plans</h2><p>Access is controlled through Shopify. Usage limits shown in the app apply to each shop. Paid plans, when offered, are purchased and managed through Shopify.</p>
    <h2>Contact</h2><p>Questions about these terms can be sent to <a href="mailto:lauruska.giedrius@gmail.com">lauruska.giedrius@gmail.com</a>.</p>
  </PublicPage>;
}
