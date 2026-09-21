import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { backendApi, setToken } from "@/lib/backend-api";
import { getSessionUser, setSession } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState(getSessionUser()?.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Entre un email valide pour continuer.");
      return;
    }
    if (password.length < 4) {
      setError("Mot de passe trop court (4 caractères min).");
      return;
    }
    setLoading(true);
    try {
      const r =
        mode === "login"
          ? await backendApi.login(email, password)
          : await backendApi.register(email, password);
      setToken(r.token);
      setSession(r.token, r.user);
      await navigate({ to: "/backend" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de connexion.");
    } finally {
      setLoading(false);
    }
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
                {mode === "login" ? "Connexion" : "Créer un compte · Starter free"}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-cream border-2 border-ink/10 mb-6">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
                  mode === m ? "bg-ink text-cream shadow" : "text-ink/50 hover:text-ink"
                }`}
              >
                {m === "login" ? "Connexion" : "Inscription"}
              </button>
            ))}
          </div>

          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
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
              disabled={loading}
              className="w-full bg-mint text-ink font-display font-extrabold text-lg py-4 rounded-2xl border-2 border-ink shadow-[5px_5px_0_0_var(--ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[3px_3px_0_0_var(--ink)] transition-transform disabled:opacity-50"
            >
              {loading ? "…" : mode === "login" ? "Se connecter →" : "Créer mon compte →"}
            </button>
          </form>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-0.5 bg-ink/10 rounded-full" />
            <span className="text-[11px] font-mono text-ink/40">ou</span>
            <div className="flex-1 h-0.5 bg-ink/10 rounded-full" />
          </div>

          {/* OAuth coming soon */}
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled
              title="Bientôt disponible"
              className="relative py-3 rounded-2xl border-2 border-ink/20 font-bold text-sm text-ink/40 cursor-not-allowed bg-cream"
            >
              <span className="mr-1">🎮</span> Discord
              <span className="absolute -top-2.5 right-2 px-2 py-0.5 rounded-full bg-lemon border border-ink/30 text-[9px] font-mono text-ink">
                soon
              </span>
            </button>
            <button
              disabled
              title="Bientôt disponible"
              className="relative py-3 rounded-2xl border-2 border-ink/20 font-bold text-sm text-ink/40 cursor-not-allowed bg-cream"
            >
              <span className="mr-1">🔍</span> Google
              <span className="absolute -top-2.5 right-2 px-2 py-0.5 rounded-full bg-lemon border border-ink/30 text-[9px] font-mono text-ink">
                soon
              </span>
            </button>
          </div>
          <p className="text-center text-[11px] font-mono text-ink/40 mt-3">
            Connexion Discord & Google — coming soon.
          </p>
        </div>
        <p className="text-center text-[11px] font-mono text-ink/40 mt-4">
          Inscription = plan Starter gratuit · le panel exige un compte.
        </p>
      </div>
    </div>
  );
}
