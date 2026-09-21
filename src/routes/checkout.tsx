import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { backendApi, getToken } from "@/lib/backend-api";
import { getSessionUser, setSession } from "@/lib/auth";
import { AmexLogo, CbLogo, LarpPayLogo, MastercardLogo, PayLogosRow, VisaLogo } from "@/components/pay-logos";

export const Route = createFileRoute("/checkout")({
  validateSearch: (s: Record<string, unknown>) => ({
    plan: typeof s["plan"] === "string" ? (s["plan"] as string) : "pro",
  }),
  component: Checkout,
});

const CATALOG = [
  { id: "starter", name: "Starter", price: "0€", workers: 50, tag: "Gratuit pour toujours" },
  { id: "pro", name: "Pro", price: "29€", workers: 500, tag: "Le plus choisi" },
  { id: "max", name: "Max", price: "99€", workers: 1500, tag: "Puissance maximale" },
];

type Brand = "visa" | "mastercard" | "amex" | "cb" | null;

function detectBrand(digits: string): Brand {
  if (/^4/.test(digits)) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(digits)) return "mastercard";
  if (/^3[47]/.test(digits)) return "amex";
  if (/^(4|5|6)/.test(digits) && digits.length >= 4) return "cb";
  return null;
}

function luhnOk(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function BrandBadge({ brand }: { brand: Exclude<Brand, null> }) {
  if (brand === "visa") return <VisaLogo className="h-7" />;
  if (brand === "mastercard") return <MastercardLogo className="h-7" />;
  if (brand === "amex") return <AmexLogo className="h-7" />;
  return <CbLogo className="h-7" />;
}

function Checkout() {
  const navigate = useNavigate();
  const { plan: initialPlan } = Route.useSearch();
  const [plan, setPlan] = useState(
    CATALOG.some((c) => c.id === initialPlan) ? initialPlan : "pro",
  );
  const [number, setNumber] = useState("");
  const [name, setName] = useState(getSessionUser()?.email ?? "");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState<{ plan: string; receipt?: string | undefined; workers?: number | undefined } | null>(null);
  const [step, setStep] = useState<"form" | "bank" | "secure" | "processing">("form");
  const [secureCode, setSecureCode] = useState("");
  const [bankMsg, setBankMsg] = useState("Connexion sécurisée…");

  const digits = useMemo(() => number.replace(/\D/g, ""), [number]);
  const brand = useMemo(() => detectBrand(digits), [digits]);
  const bankName =
    brand === "visa"
      ? "Visa Secure"
      : brand === "mastercard"
        ? "Mastercard Identity Check"
        : brand === "amex"
          ? "Amex SafeKey"
          : "CB Secure";
  const item = CATALOG.find((c) => c.id === plan)!;
  const authed = !!getToken();

  const onNumber = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 19);
    setNumber(d.replace(/(.{4})/g, "$1 ").trim());
  };

  const onExpiry = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 4);
    setExpiry(d.length > 2 ? d.slice(0, 2) + "/" + d.slice(2) : d);
  };

  const expiryOk = (() => {
    const m = expiry.match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
    if (!m) return false;
    const yy = 2000 + Number(m[2]);
    const mm = Number(m[1]);
    const now = new Date();
    return yy > now.getFullYear() || (yy === now.getFullYear() && mm >= now.getMonth() + 1);
  })();

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (plan === "starter") {
      setPaying(true);
      try {
        const r = await backendApi.checkout("starter", "", "", name);
        setSession(getToken() ?? "", { email: r.subscription.email, plan: r.plan });
        setReceipt({ plan: r.plan });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Échec de l'activation.");
      } finally {
        setPaying(false);
      }
      return;
    }
    if (!luhnOk(digits)) {
      setError("Numéro de carte invalide.");
      return;
    }
    if (!brand) {
      setError("Réseau non reconnu (Visa, Mastercard, Amex, CB).");
      return;
    }
    if (!expiryOk) {
      setError("Date d'expiration invalide.");
      return;
    }
    if (!/^\d{3,4}$/.test(cvc)) {
      setError("CVC invalide.");
      return;
    }
    // 1) Contact de la banque émettrice (3D Secure)
    setStep("bank");
    setBankMsg("Connexion sécurisée…");
    await sleep(700);
    setBankMsg(`Vérification ${bankName}…`);
    await sleep(900);
    setBankMsg("Banque émettrice contactée…");
    await sleep(900);
    setSecureCode("");
    setStep("secure");
  };

  const confirmSecure = async () => {
    if (!/^\d{6}$/.test(secureCode)) {
      setError("Saisis le code à 6 chiffres reçu par SMS.");
      return;
    }
    setError(null);
    setStep("processing");
    try {
      // Seuls last4 + réseau + titulaire transitent. Le PAN ne quitte jamais ce navigateur.
      const r = await backendApi.checkout(plan, digits.slice(-4), brand ?? "cb", name || "Titulaire");
      setSession(getToken() ?? "", { email: r.subscription.email, plan: r.plan });
      setReceipt({ plan: r.plan, receipt: r.receipt, workers: r.workers });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Paiement refusé par la banque.");
      setStep("secure");
    }
  };

  // ── Succès ──
  if (receipt) {
    const got = CATALOG.find((c) => c.id === receipt.plan)!;
    return (
      <div className="min-h-screen bg-cream text-ink font-sans grid place-items-center px-6 py-12">
        <div className="w-full max-w-[480px] bg-white rounded-[2rem] border-2 border-ink p-8 shadow-[10px_10px_0_0_var(--ink)] text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-mint border-2 border-ink grid place-items-center text-3xl">
            ✓
          </div>
          <h1 className="font-display font-extrabold text-3xl mt-4">Abonnement {got.name} activé</h1>
          <p className="text-sm text-ink/55 mt-2">
            {got.workers} workers max · payé via LarpPay Services
            {receipt.receipt ? ` · reçu ${receipt.receipt}` : ""}
          </p>
          <div className="flex flex-col gap-2 mt-6">
            <button
              onClick={() => void navigate({ to: "/backend" })}
              className="w-full py-3.5 rounded-2xl bg-mint text-ink font-display font-extrabold border-2 border-ink shadow-[5px_5px_0_0_var(--ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
            >
              Ouvrir le panel →
            </button>
            <Link
              to="/"
              className="w-full py-3 rounded-2xl border-2 border-ink/20 font-bold text-sm hover:bg-lemon transition-colors"
            >
              Retour à l'accueil
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Login requis ──
  if (!authed) {
    return (
      <div className="min-h-screen bg-cream text-ink font-sans grid place-items-center px-6">
        <div className="w-full max-w-[420px] bg-white rounded-[2rem] border-2 border-ink p-8 shadow-[10px_10px_0_0_var(--ink)] text-center">
          <LarpPayLogo />
          <h1 className="font-display font-extrabold text-3xl mt-4">Checkout sécurisé</h1>
          <p className="text-sm text-ink/55 mt-2">Connecte-toi pour finaliser ton abonnement {item.name}.</p>
          <Link
            to="/login"
            className="block mt-6 w-full py-3.5 rounded-2xl bg-ink text-cream font-display font-extrabold border-2 border-ink"
          >
            Se connecter →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream text-ink font-sans selection:bg-lemon">
      <header className="border-b-2 border-ink bg-cream/95">
        <div className="max-w-[1000px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="text-xs font-mono text-ink/50 hover:text-berry">
            ← Retour
          </Link>
          <LarpPayLogo />
          <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-mint/40 border border-ink/20">
            🔒 SSL sécurisé
          </span>
        </div>
      </header>

      <div className="max-w-[1000px] mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── Formulaire ── */}
        <div className="lg:col-span-3 bg-white rounded-[2rem] border-2 border-ink p-7 shadow-[10px_10px_0_0_var(--ink)]">
          <h1 className="font-display font-extrabold text-3xl">Paiement</h1>
          <p className="text-sm text-ink/55 mb-5">Encaissé par LarpPay Services.</p>

          {/* Choix du plan */}
          <div className="grid grid-cols-3 gap-2 mb-6">
            {CATALOG.map((c) => (
              <button
                key={c.id}
                onClick={() => setPlan(c.id)}
                className={`rounded-2xl border-2 px-3 py-3 text-left transition-all ${
                  plan === c.id ? "border-ink bg-lemon shadow-[3px_3px_0_0_var(--ink)]" : "border-ink/15 hover:border-ink"
                }`}
              >
                <div className="font-display font-extrabold">{c.name}</div>
                <div className="font-mono text-sm font-bold">{c.price}<span className="font-normal text-ink/50">/mois</span></div>
                <div className="text-[10px] font-mono text-ink/50">{c.workers} workers</div>
              </button>
            ))}
          </div>

          {plan === "starter" ? (
            <div>
              <div className="rounded-2xl bg-mint/30 border-2 border-ink/15 p-4 text-sm mb-4">
                Le plan Starter est <b>gratuit pour toujours</b> — aucune carte requise.
              </div>
              <button
                onClick={(e) => void pay(e)}
                disabled={paying}
                className="w-full py-4 rounded-2xl bg-mint text-ink font-display font-extrabold text-lg border-2 border-ink shadow-[5px_5px_0_0_var(--ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all disabled:opacity-50"
              >
                {paying ? "Activation…" : "Activer Starter →"}
              </button>
              {error && <p className="text-xs font-mono text-berry mt-3">{error}</p>}
            </div>
          ) : (
            <form onSubmit={(e) => void pay(e)} className="flex flex-col gap-4">
              <div>
                <label className="block text-[11px] uppercase tracking-[0.16em] text-ink/50 font-bold mb-2">
                  Numéro de carte
                </label>
                <div className="relative">
                  <input
                    value={number}
                    onChange={(e) => onNumber(e.target.value)}
                    placeholder="4242 4242 4242 4242"
                    inputMode="numeric"
                    className="w-full bg-cream border-2 border-ink rounded-2xl px-4 py-3 pr-20 text-sm font-mono font-medium outline-none focus:bg-lemon/20 transition-colors"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    {brand ? <BrandBadge brand={brand} /> : <span className="text-[10px] font-mono text-ink/30">CB ?</span>}
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-[0.16em] text-ink/50 font-bold mb-2">
                  Titulaire
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="JEAN DUPONT"
                  className="w-full bg-cream border-2 border-ink rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:bg-lemon/20 transition-colors"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-[0.16em] text-ink/50 font-bold mb-2">
                    Expiration
                  </label>
                  <input
                    value={expiry}
                    onChange={(e) => onExpiry(e.target.value)}
                    placeholder="MM/AA"
                    inputMode="numeric"
                    className="w-full bg-cream border-2 border-ink rounded-2xl px-4 py-3 text-sm font-mono outline-none focus:bg-lemon/20 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-[0.16em] text-ink/50 font-bold mb-2">
                    CVC
                  </label>
                  <input
                    value={cvc}
                    onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="123"
                    inputMode="numeric"
                    className="w-full bg-cream border-2 border-ink rounded-2xl px-4 py-3 text-sm font-mono outline-none focus:bg-lemon/20 transition-colors"
                  />
                </div>
              </div>
              {error && (
                <div className="text-xs font-mono bg-berry/10 border-2 border-berry/40 text-berry rounded-xl px-3 py-2">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={paying}
                className="w-full py-4 rounded-2xl bg-berry text-white font-display font-extrabold text-lg border-2 border-ink shadow-[5px_5px_0_0_var(--ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all disabled:opacity-50"
              >
                {paying ? "Traitement LarpPay…" : `Payer ${item.price}/mois`}
              </button>
              <p className="text-[11px] font-mono text-ink/40 text-center">
                Le numéro complet ne quitte jamais ton navigateur — seuls les 4 derniers chiffres transitent.
              </p>
            </form>
          )}
        </div>

        {/* ── Récap ── */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="bg-ink text-cream rounded-[2rem] p-7">
            <div className="text-[11px] uppercase tracking-[0.16em] text-cream/50 font-bold mb-3">
              Récapitulatif
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-display font-extrabold text-2xl">Plan {item.name}</span>
              <span className="font-mono font-bold">{item.price}<span className="text-cream/50 font-normal">/mois</span></span>
            </div>
            <div className="text-sm text-cream/60 mt-1">{item.workers} workers Chrome · {item.tag}</div>
            <div className="h-px bg-cream/15 my-4" />
            <div className="flex items-baseline justify-between font-display font-extrabold text-xl">
              <span>Total dû</span>
              <span>{item.price}</span>
            </div>
            <div className="mt-5 flex items-center justify-between">
              <PayLogosRow />
            </div>
            <p className="text-[11px] font-mono text-cream/40 mt-3">
              Facturé par LarpPay Services · résiliable à tout moment
            </p>
          </div>
          <div className="bg-white rounded-[2rem] border-2 border-ink p-5 text-xs font-mono text-ink/55">
            En payant, tu acceptes nos <Link to="/tos" className="underline">CGU</Link>, nos{" "}
            <Link to="/guidelines" className="underline">règles d'usage</Link> et notre{" "}
            <Link to="/privacy" className="underline">politique de confidentialité</Link>.
          </div>
        </div>
      </div>

      {/* ── Banque émettrice : contact 3D Secure ── */}
      {step === "bank" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/70 backdrop-blur-sm px-6">
          <div className="w-full max-w-[380px] bg-white rounded-[2rem] border-2 border-ink p-8 shadow-[10px_10px_0_0_var(--berry)] text-center">
            <div className="w-12 h-12 mx-auto rounded-full border-4 border-ink/15 border-t-berry animate-spin" />
            <div className="font-display font-extrabold text-xl mt-4">{bankName}</div>
            <div className="text-sm font-mono text-ink/60 mt-1">{bankMsg}</div>
            <div className="text-[11px] font-mono text-ink/40 mt-3">
              {item.price}/mois · carte •••• {digits.slice(-4)}
            </div>
          </div>
        </div>
      )}

      {/* ── 3D Secure : confirmation banque ── */}
      {step === "secure" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/70 backdrop-blur-sm px-6">
          <div className="w-full max-w-[400px] bg-white rounded-[2rem] border-2 border-ink p-8 shadow-[10px_10px_0_0_var(--berry)]">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-berry text-white grid place-items-center font-display font-extrabold border-2 border-ink">
                3D
              </div>
              <div>
                <div className="font-display font-extrabold text-lg leading-none">{bankName}</div>
                <div className="text-[11px] font-mono text-ink/50 mt-0.5">Confirmation de la banque</div>
              </div>
            </div>
            <p className="text-sm text-ink/60 mt-3">
              Paiement de <b className="font-mono">{item.price}/mois</b> vers{" "}
              <b>LarpPay Services</b>. Saisis le code à 6 chiffres reçu par SMS.
            </p>
            <input
              value={secureCode}
              onChange={(e) => setSecureCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••••"
              inputMode="numeric"
              className="mt-4 w-full text-center tracking-[0.5em] text-2xl font-mono font-bold bg-cream border-2 border-ink rounded-2xl px-4 py-3 outline-none focus:bg-lemon/20 transition-colors"
            />
            {error && (
              <div className="mt-3 text-xs font-mono bg-berry/10 border-2 border-berry/40 text-berry rounded-xl px-3 py-2">
                {error}
              </div>
            )}
            <button
              onClick={() => void confirmSecure()}
              className="mt-4 w-full py-3.5 rounded-2xl bg-mint text-ink font-display font-extrabold border-2 border-ink shadow-[4px_4px_0_0_var(--ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
            >
              Confirmer le paiement
            </button>
            <button
              onClick={() => {
                setError(null);
                setStep("form");
              }}
              className="mt-2 w-full py-2.5 text-sm font-bold text-ink/50 hover:text-berry transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* ── Traitement final ── */}
      {step === "processing" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/70 backdrop-blur-sm px-6">
          <div className="w-full max-w-[380px] bg-white rounded-[2rem] border-2 border-ink p-8 shadow-[10px_10px_0_0_var(--berry)] text-center">
            <div className="w-12 h-12 mx-auto rounded-full border-4 border-ink/15 border-t-mint animate-spin" />
            <div className="font-display font-extrabold text-xl mt-4">Validation bancaire…</div>
            <div className="text-sm font-mono text-ink/60 mt-1">LarpPay finalise ton abonnement {item.name}.</div>
          </div>
        </div>
      )}
    </div>
  );
}
