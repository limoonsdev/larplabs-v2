import { createFileRoute, Link } from "@tanstack/react-router";
import { PLATFORM_PRESETS } from "@/lib/presets";
import { PlatformLogo } from "@/components/platform-logos";

export const Route = createFileRoute("/")({
  component: Home,
});

const FEATURES = [
  {
    icon: "📦",
    bg: "bg-berry",
    fg: "text-white",
    title: "Proxies multi-sources",
    text: "28 sources GitHub + APIs publiques aspirées en continu, dédupliquées et mélangées.",
  },
  {
    icon: "⚡",
    bg: "bg-lemon",
    fg: "text-ink",
    title: "Vetting x10 simultanés",
    text: "10 workers de vérification en parallèle, latence mesurée, progression en direct.",
  },
  {
    icon: "🌍",
    bg: "bg-mint",
    fg: "text-ink",
    title: "Stats par pays",
    text: "Top pays des proxies live, top sources et répartition par protocole dans le panel.",
  },
  {
    icon: "🚀",
    bg: "bg-tangerine",
    fg: "text-ink",
    title: "Chrome turbo custom",
    text: "Instances ultra-légères 5-15 MB RAM : zero cache disque, zero GPU, JS bridé.",
  },
  {
    icon: "🎯",
    bg: "bg-ink",
    fg: "text-cream",
    title: "12 presets plateformes",
    text: "YouTube, TikTok, Twitch, X, Spotify… 1 clic = URL + workers + actions optimisés.",
  },
  {
    icon: "🛡️",
    bg: "bg-white",
    fg: "text-ink",
    title: "Resolver Cloudflare/captcha",
    text: "Détection Turnstile, reCAPTCHA, hCaptcha + OCR auto optionnel (pillow + tesseract).",
  },
  {
    icon: "📡",
    bg: "bg-berry",
    fg: "text-white",
    title: "Temps réel WebSocket",
    text: "Stats, workers, logs et proxies poussés toutes les 500ms dans le dashboard.",
  },
  {
    icon: "🧩",
    bg: "bg-lemon",
    fg: "text-ink",
    title: "Builder 12 actions",
    text: "Clic, scroll, saisie, touches, hover, navigation… enchaînés par chaque worker.",
  },
];

const PLANS = [
  {
    name: "Starter",
    price: "0€",
    period: "/mois",
    bg: "bg-white",
    fg: "text-ink",
    cta: "Commencer",
    features: ["50 workers Chrome", "3 presets plateformes", "Proxies communautaires", "Stats temps réel"],
  },
  {
    name: "Pro",
    price: "29€",
    period: "/mois",
    bg: "bg-ink",
    fg: "text-cream",
    cta: "Choisir Pro",
    badge: "Populaire",
    features: [
      "500 workers Chrome",
      "12 presets plateformes",
      "Resolver captcha + OCR",
      "Stats par pays",
      "Vetting prioritaire x10",
    ],
  },
  {
    name: "Max",
    price: "99€",
    period: "/mois",
    bg: "bg-berry",
    fg: "text-white",
    cta: "Choisir Max",
    features: [
      "1500 workers Chrome",
      "Tout le plan Pro",
      "Sources proxies prioritaires",
      "Workers dédiés",
      "Support prioritaire",
    ],
  },
];

function Home() {
  return (
    <div className="min-h-screen bg-cream text-ink font-sans selection:bg-lemon">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-30 bg-cream/95 backdrop-blur border-b-2 border-ink">
        <div className="max-w-[1200px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-ink text-cream grid place-items-center text-xl font-display font-extrabold">
              L
            </div>
            <div className="font-display font-extrabold text-2xl leading-none tracking-tight">
              LarpLabs<span className="text-berry"> V2</span>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-bold">
            <a href="#plateformes" className="hover:text-berry transition-colors">Plateformes</a>
            <a href="#features" className="hover:text-berry transition-colors">Fonctionnalités</a>
            <a href="#tarifs" className="hover:text-berry transition-colors">Tarifs</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="px-4 py-2 rounded-2xl border-2 border-ink text-sm font-bold hover:bg-lemon transition-colors"
            >
              Se connecter
            </Link>
            <Link
              to="/backend"
              className="px-4 py-2 rounded-2xl bg-berry text-white border-2 border-ink text-sm font-bold shadow-[4px_4px_0_0_var(--ink)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_var(--ink)] transition-all"
            >
              Ouvrir le panel →
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="max-w-[1200px] mx-auto px-6 pt-16 pb-12 text-center">
        <div className="inline-block px-4 py-1.5 rounded-full bg-lemon border-2 border-ink text-xs font-bold font-mono mb-6">
          V2 — CHROME ENGINE TURBO
        </div>
        <h1 className="font-display font-extrabold text-5xl md:text-7xl leading-[0.95] tracking-tight">
          Des workers Chrome
          <br />
          <span className="text-berry">ultra-légers</span>, pilotés
          <br />
          comme des pros.
        </h1>
        <p className="text-ink/60 text-lg mt-6 max-w-[640px] mx-auto">
          Jusqu'à 1500 instances à 5-15 MB de RAM, proxies multi-sources vérifiés x10,
          12 presets plateformes et resolver Cloudflare auto. Le tout en temps réel.
        </p>
        <div className="flex items-center justify-center gap-3 mt-8 flex-wrap">
          <Link
            to="/backend"
            className="px-8 py-4 rounded-2xl bg-mint text-ink font-display font-extrabold text-lg border-2 border-ink shadow-[5px_5px_0_0_var(--ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[3px_3px_0_0_var(--ink)] transition-transform"
          >
            Lancer une session →
          </Link>
          <a
            href="#tarifs"
            className="px-8 py-4 rounded-2xl bg-white font-display font-extrabold text-lg border-2 border-ink shadow-[5px_5px_0_0_var(--ink)] hover:bg-lemon active:translate-x-[2px] active:translate-y-[2px] active:shadow-[3px_3px_0_0_var(--ink)] transition-all"
          >
            Voir les tarifs
          </a>
        </div>
        <div className="flex items-center justify-center gap-2 mt-8 flex-wrap font-mono text-xs">
          {["1500 workers max", "28 sources proxy", "10 vérifs simultanées", "12 presets"].map((s) => (
            <span key={s} className="px-3 py-1.5 rounded-full bg-white border-2 border-ink/15">
              {s}
            </span>
          ))}
        </div>
      </section>

      {/* ── Plateformes ── */}
      <section id="plateformes" className="max-w-[1200px] mx-auto px-6 py-10">
        <div className="bg-ink text-cream rounded-[2rem] border-2 border-ink p-8">
          <div className="text-[11px] uppercase tracking-[0.16em] text-cream/50 font-bold mb-1">
            Presets prêts en 1 clic
          </div>
          <h2 className="font-display font-extrabold text-3xl mb-6">12 plateformes supportées</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {PLATFORM_PRESETS.map((p) => (
              <div
                key={p.id}
                className="flex flex-col items-center gap-2 rounded-2xl bg-cream/5 border border-cream/15 px-2 py-4 hover:bg-cream/10 transition-colors"
              >
                <span className={`w-10 h-10 rounded-xl ${p.color} grid place-items-center text-white`}>
                  <PlatformLogo id={p.id} className="w-6 h-6" />
                </span>
                <span className="text-xs font-bold">{p.name}</span>
                <span className="text-[10px] font-mono text-cream/50">{p.num_workers} workers</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="max-w-[1200px] mx-auto px-6 py-10">
        <h2 className="font-display font-extrabold text-4xl text-center mb-2">Tout est inclus</h2>
        <p className="text-center text-ink/55 mb-8">Le moteur, les proxies, les presets, l'anti-captcha. Rien à brancher.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className={`${f.bg} ${f.fg} rounded-[1.5rem] border-2 border-ink p-5 shadow-[6px_6px_0_0_var(--ink)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[4px_4px_0_0_var(--ink)] transition-all`}
            >
              <div className="text-3xl mb-3">{f.icon}</div>
              <div className="font-display font-extrabold text-lg leading-tight">{f.title}</div>
              <div className="text-sm opacity-80 mt-1 leading-snug">{f.text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Tarifs ── */}
      <section id="tarifs" className="max-w-[1200px] mx-auto px-6 py-10">
        <h2 className="font-display font-extrabold text-4xl text-center mb-2">3 plans simples</h2>
        <p className="text-center text-ink/55 mb-1">Plans fictifs — démo, aucun paiement.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8 items-stretch">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`${plan.bg} ${plan.fg} relative rounded-[2rem] border-2 border-ink p-8 shadow-[10px_10px_0_0_var(--ink)] flex flex-col`}
            >
              {plan.badge && (
                <span className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-lemon text-ink text-xs font-bold border-2 border-ink whitespace-nowrap">
                  {plan.badge}
                </span>
              )}
              <div className="font-display font-extrabold text-2xl">{plan.name}</div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-display font-extrabold text-5xl">{plan.price}</span>
                <span className="font-mono text-sm opacity-70">{plan.period}</span>
              </div>
              <ul className="mt-6 flex flex-col gap-2.5 text-sm font-medium flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span>✅</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/login"
                className={`mt-8 text-center w-full py-3.5 rounded-2xl border-2 font-display font-extrabold transition-transform active:translate-x-[2px] active:translate-y-[2px] ${
                  plan.badge
                    ? "bg-lemon text-ink border-ink shadow-[5px_5px_0_0_rgba(0,0,0,0.4)]"
                    : "bg-cream text-ink border-ink shadow-[5px_5px_0_0_var(--ink)]"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA + footer ── */}
      <section className="max-w-[1200px] mx-auto px-6 py-10">
        <div className="bg-mint rounded-[2rem] border-2 border-ink p-10 text-center shadow-[10px_10px_0_0_var(--ink)]">
          <h2 className="font-display font-extrabold text-4xl">Prêt à envoyer du lourd ?</h2>
          <p className="text-ink/60 mt-2">Connecte-toi et lance ta première session en 30 secondes.</p>
          <div className="flex items-center justify-center gap-3 mt-6 flex-wrap">
            <Link
              to="/login"
              className="px-8 py-4 rounded-2xl bg-ink text-cream font-display font-extrabold text-lg border-2 border-ink shadow-[5px_5px_0_0_rgba(0,0,0,0.3)] active:translate-x-[2px] active:translate-y-[2px] transition-transform"
            >
              Se connecter
            </Link>
            <Link
              to="/backend"
              className="px-8 py-4 rounded-2xl bg-white font-display font-extrabold text-lg border-2 border-ink hover:bg-lemon transition-colors"
            >
              Voir le panel
            </Link>
          </div>
        </div>
        <footer className="text-center text-xs font-mono text-ink/40 py-10">
          LarpLabs V2 — démo fictive. Aucun paiement, aucun compte réel.
        </footer>
      </section>
    </div>
  );
}
