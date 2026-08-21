import type { ReactNode } from "react";
import "./styles/public.css";

export function PublicPage({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <main className="legal-shell">
      <nav className="legal-nav" aria-label="Legal and support">
        <a className="legal-brand" href="/">Theme QA Agent</a>
        <div><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/support">Support</a></div>
      </nav>
      <article className="legal-card">
        <p className="legal-kicker">SHOPIFY THEME QUALITY ASSURANCE</p>
        <h1>{title}</h1>
        {updated ? <p className="legal-updated">Last updated: {updated}</p> : null}
        {children}
      </article>
    </main>
  );
}
