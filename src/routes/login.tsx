import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { getAuthUser, login } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState(getAuthUser()?.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Entre un email valide pour continuer.");
      return;
    }
    if (password.length < 4) {
      setError("Mot de passe trop court (4 caractères min, démo).");
      return;
    }
    login(email);
    void navigate({ to: "/backend" });
  };

  return (
    <div className="min-h-screen bg-cream text-ink font-sans selection:bg-lemon grid place-items-center px-6 py-12">
      <div className="w-full max-w-[440px]">
        <Link to="/" className="inline-block text-xs font-mono text-ink/50 hover:text-berry mb-4">
          ← Retour à l'accueil
        </Link>
        <div className="bg-white rounded-[2rem] border-2 border-ink p-8 shadow-[10px_10px_0_0_var(--ink)]">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-ink text-cream grid place-items-center text-xl font-display font-extrabold">
              L
            </div>
            <div>
              <div className="font-display font-extrabold text-2xl leading-none">
                LarpLabs<span className="text-berry"> V2</span>
              </div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-ink/50 mt-1">
                Connexion démo
              </div>
            </div>
          </div>

          <h1 className="font-display font-extrabold text-3xl leading-none mb-1">Bon retour 👋</h1>
          <p className="text-sm text-ink/55 mb-6">
            Fictif — aucun compte requis, tout reste dans ton navigateur.
          </p>

          <form onSubmit={submit} className="flex flex-col gap-4">
            <div>
              <label className="block text-[11px] uppercase tracking-[0.16em] text-ink/50 font-bold mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="toi@exemple.com"
                className="w-full bg-cream border-2 border-ink rounded-2xl px-4 py-3 text-sm font-medium outline-none placeholder:text-ink/30 focus:bg-lemon/30 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-[0.16em] text-ink/50 font-bold mb-2">
                Mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-cream border-2 border-ink rounded-2xl px-4 py-3 text-sm font-medium outline-none placeholder:text-ink/30 focus:bg-lemon/30 transition-colors"
              />
            </div>
            {error && (
              <div className="text-xs font-mono bg-berry/10 border-2 border-berry/40 text-berry rounded-xl px-3 py-2">
                {error}
              </div>
            )}
            <button
              type="submit"
              className="w-full bg-mint text-ink font-display font-extrabold text-lg py-4 rounded-2xl border-2 border-ink shadow-[5px_5px_0_0_var(--ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[3px_3px_0_0_var(--ink)] transition-transform"
            >
              Se connecter →
            </button>
          </form>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-0.5 bg-ink/10 rounded-full" />
            <span className="text-[11px] font-mono text-ink/40">ou</span>
            <div className="flex-1 h-0.5 bg-ink/10 rounded-full" />
          </div>

          <Link
            to="/backend"
            className="block text-center w-full py-3.5 rounded-2xl border-2 border-ink font-bold text-sm hover:bg-lemon transition-colors"
          >
            Continuer sans compte
          </Link>
        </div>
        <p className="text-center text-[11px] font-mono text-ink/40 mt-4">
          LarpLabs V2 — login fictif, zéro donnée envoyée.
        </p>
      </div>
    </div>
  );
}
