/**
 * LarpLabs V2 — Layout partagé des pages légales.
 */
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function LegalPage({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-cream text-ink font-sans selection:bg-lemon">
      <header className="border-b-2 border-ink bg-cream/95">
        <div className="max-w-[860px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="text-xs font-mono text-ink/50 hover:text-berry">
            ← LarpLabs V2
          </Link>
          <div className="flex items-center gap-4 text-xs font-bold">
            <Link to="/tos" className="hover:text-berry">CGU</Link>
            <Link to="/guidelines" className="hover:text-berry">Règles</Link>
            <Link to="/privacy" className="hover:text-berry">Confidentialité</Link>
          </div>
        </div>
      </header>
      <div className="max-w-[860px] mx-auto px-6 py-12">
        <div className="bg-white rounded-[2rem] border-2 border-ink p-8 md:p-10 shadow-[10px_10px_0_0_var(--ink)]">
          <h1 className="font-display font-extrabold text-4xl leading-none">{title}</h1>
          <p className="text-xs font-mono text-ink/40 mt-2">Dernière mise à jour : {updated}</p>
          <p className="text-ink/60 mt-4 leading-relaxed">{intro}</p>
          <div className="mt-8 flex flex-col gap-6">{children}</div>
        </div>
        <footer className="text-center text-[11px] font-mono text-ink/40 py-8">
          LarpLabs V2 · Paiements LarpPay Services · support@larplabs-v2.com
        </footer>
      </div>
    </div>
  );
}

export function Clause({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display font-extrabold text-xl mb-1.5">
        <span className="text-berry">{n}.</span> {title}
      </h2>
      <div className="text-sm text-ink/70 leading-relaxed flex flex-col gap-2">{children}</div>
    </section>
  );
}
