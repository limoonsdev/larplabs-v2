import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  backendApi,
  connectBackendWs,
  type Action,
  type ActionType,
  type GlobalStats,
  type LogEntry,
  type ProxyStats,
  type SessionConfig,
  type WorkerInfo,
} from "@/lib/backend-api";
import { PLATFORM_PRESETS } from "@/lib/presets";
import { PlatformLogo } from "@/components/platform-logos";

export const Route = createFileRoute("/backend")({
  component: BackendPanel,
});

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1) + "k";
  return String(n);
}

function statusColor(code: number): string {
  if (code === 0) return "text-red-400";
  if (code >= 500) return "text-red-400";
  if (code >= 400) return "text-orange-400";
  if (code >= 300) return "text-yellow-400";
  return "text-green-400";
}

const ACTION_TYPES: ActionType[] = [
  "click",
  "type_text",
  "key_press",
  "scroll",
  "wait",
  "hover",
  "navigate",
  "back",
  "refresh",
  "select",
  "clear",
];

const ACTION_LABELS: Record<ActionType, string> = {
  click: "🖱️ Clic",
  type_text: "⌨️ Écrire texte",
  key_press: "🔑 Touche clavier",
  scroll: "📜 Défilement",
  wait: "⏳ Attendre",
  hover: "🎯 Hover",
  screenshot: "📸 Screenshot",
  navigate: "🔗 Naviguer",
  back: "◀ Retour",
  refresh: "🔄 Rafraîchir",
  select: "📋 Sélectionner",
  clear: "🗑️ Effacer",
};

// ──────────────────────────────────────────────────────────────────────────────
// Action Builder
// ──────────────────────────────────────────────────────────────────────────────

function ActionBuilder({
  action,
  index,
  onUpdate,
  onRemove,
}: {
  action: Action;
  index: number;
  onUpdate: (idx: number, a: Action) => void;
  onRemove: (idx: number) => void;
}) {
  const upd = (patch: Partial<Action>) => onUpdate(index, { ...action, ...patch });
  return (
    <div className="bg-cream border-2 border-ink/30 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <select
          value={action.type}
          onChange={(e) => upd({ type: e.target.value as ActionType })}
          className="flex-1 bg-white border-2 border-ink rounded-xl px-3 py-2 text-sm font-medium"
        >
          {ACTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {ACTION_LABELS[t]}
            </option>
          ))}
        </select>
        <button
          onClick={() => onRemove(index)}
          className="w-8 h-8 rounded-xl bg-red-100 border-2 border-red-300 text-red-500 font-bold flex items-center justify-center hover:bg-red-200"
        >
          ✕
        </button>
      </div>

      {/* Selector */}
      {(action.type === "click" || action.type === "hover" || action.type === "select" || action.type === "clear" || action.type === "type_text") && (
        <input
          type="text"
          value={action.selector ?? ""}
          onChange={(e) => upd({ selector: e.target.value })}
          placeholder="Sélecteur CSS (ex: button.cta, #search)"
          className="bg-white border-2 border-ink/30 rounded-xl px-3 py-2 text-sm"
        />
      )}

      {/* Value */}
      {(action.type === "type_text" || action.type === "key_press" || action.type === "navigate" || action.type === "select") && (
        <input
          type="text"
          value={action.value ?? ""}
          onChange={(e) => upd({ value: e.target.value })}
          placeholder={
            action.type === "key_press"
              ? "Touche (Enter, Tab, Escape, F5...)"
              : action.type === "navigate"
              ? "URL cible"
              : action.type === "scroll"
              ? "Direction (up, down, top, bottom)"
              : "Texte à saisir"
          }
          className="bg-white border-2 border-ink/30 rounded-xl px-3 py-2 text-sm"
        />
      )}

      {/* Scroll direction */}
      {action.type === "scroll" && (
        <select
          value={action.value ?? "down"}
          onChange={(e) => upd({ value: e.target.value })}
          className="bg-white border-2 border-ink/30 rounded-xl px-3 py-2 text-sm"
        >
          <option value="down">⬇ Descendre</option>
          <option value="up">⬆ Monter</option>
          <option value="top">⤴ Haut de page</option>
          <option value="bottom">⤵ Bas de page</option>
        </select>
      )}

      {/* Count + delay */}
      {(action.type === "click" || action.type === "scroll" || action.type === "key_press") && (
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-[10px] uppercase tracking-wider text-ink/50 font-bold block mb-1">
              Répétitions
            </label>
            <input
              type="number"
              value={action.count ?? 1}
              min={1}
              max={action.type === "click" ? 5000 : 100}
              onChange={(e) => upd({ count: Number(e.target.value) })}
              className="w-full bg-white border-2 border-ink/30 rounded-xl px-3 py-2 text-sm"
            />
            {action.type === "click" && (
              <span className="text-[10px] text-ink/40">max 5000</span>
            )}
          </div>
          <div className="flex-1">
            <label className="text-[10px] uppercase tracking-wider text-ink/50 font-bold block mb-1">
              Délai (ms)
            </label>
            <input
              type="number"
              value={action.delay_ms ?? 50}
              min={0}
              max={10000}
              onChange={(e) => upd({ delay_ms: Number(e.target.value) })}
              className="w-full bg-white border-2 border-ink/30 rounded-xl px-3 py-2 text-sm"
            />
          </div>
        </div>
      )}

      {/* Wait duration */}
      {action.type === "wait" && (
        <div>
          <label className="text-[10px] uppercase tracking-wider text-ink/50 font-bold block mb-1">
            Durée d'attente (ms)
          </label>
          <input
            type="number"
            value={action.delay_ms ?? 1000}
            min={100}
            max={30000}
            onChange={(e) => upd({ delay_ms: Number(e.target.value) })}
            className="w-full bg-white border-2 border-ink/30 rounded-xl px-3 py-2 text-sm"
          />
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────────────────────────

function BackendPanel() {
  // ── Backend connection ───────────────────────────────────────────────────
  const [connected, setConnected] = useState(false);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  // ── Session config ───────────────────────────────────────────────────────
  const [url, setUrl] = useState("");
  const [numWorkers, setNumWorkers] = useState(10);
  const [useProxies, setUseProxies] = useState(true);
  const [repeat, setRepeat] = useState(true);
  const [thinkTimeMs, setThinkTimeMs] = useState(500);
  const [solveCaptcha, setSolveCaptcha] = useState(true);
  const [captchaOcr, setCaptchaOcr] = useState<boolean | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  // ── Probe ─────────────────────────────────────────────────────────────────
  const [probeState, setProbeState] = useState<"idle" | "probing" | "ok" | "fail">("idle");
  const [probeInfo, setProbeInfo] = useState<{ status_code: number; elapsed_ms: number } | null>(null);

  // ── Live data ─────────────────────────────────────────────────────────────
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [proxyStats, setProxyStats] = useState<ProxyStats | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const logIdRef = useRef(0);
  const MAX_LOGS = 60;

  const validUrl = useMemo(() => {
    try {
      const u = new URL(url);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }, [url]);

  // ── Check backend health ──────────────────────────────────────────────────
  useEffect(() => {
    backendApi
      .health()
      .then(() => setBackendOnline(true))
      .catch(() => setBackendOnline(false));
    backendApi
      .captchaStatus()
      .then((r) => setCaptchaOcr(r.ocr))
      .catch(() => setCaptchaOcr(null));
  }, []);

  // ── WebSocket ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (backendOnline !== true) return;
    const cleanup = connectBackendWs({
      onConnect: () => setConnected(true),
      onDisconnect: () => setConnected(false),
      onStats: (data) => {
        setStats(data);
        setRunning(data.workers_active > 0);
      },
      onWorkers: (data) => setWorkers(data),
      onProxy: (data) => setProxyStats(data),
      onLog: (entry) => {
        setLogs((prev) => [entry, ...prev].slice(0, MAX_LOGS));
      },
      onLogs: (entries) => {
        setLogs((prev) => {
          const existing = new Set(prev.map((l) => l.id));
          const fresh = entries.filter((e) => !existing.has(e.id));
          return [...fresh, ...prev].slice(0, MAX_LOGS);
        });
      },
    });
    return cleanup;
  }, [backendOnline]);

  // ── Probe ─────────────────────────────────────────────────────────────────
  const doProbe = useCallback(async () => {
    if (!validUrl) return;
    setProbeState("probing");
    try {
      const r = await backendApi.probe(url, false);
      if (r.reachable) {
        setProbeState("ok");
        setProbeInfo({ status_code: r.status_code, elapsed_ms: r.elapsed_ms });
      } else {
        setProbeState("fail");
        setProbeInfo(null);
      }
    } catch {
      setProbeState("fail");
      setProbeInfo(null);
    }
  }, [url, validUrl]);

  useEffect(() => {
    setProbeState("idle");
    setProbeInfo(null);
  }, [url]);

  // ── Start / Stop ──────────────────────────────────────────────────────────
  const start = async () => {
    if (!validUrl) return;
    try {
      const config: SessionConfig = {
        url,
        num_workers: numWorkers,
        use_proxies: useProxies,
        actions,
        repeat,
        think_time_ms: thinkTimeMs,
        solve_captcha: solveCaptcha,
      };
      const r = await backendApi.startSession(config);
      setSessionId(r.session_id);
      setRunning(true);
    } catch (e) {
      alert("Erreur au démarrage : " + String(e));
    }
  };

  const stop = async () => {
    if (sessionId) {
      try {
        await backendApi.stopSession(sessionId);
      } catch {
        await backendApi.stopAll();
      }
    } else {
      await backendApi.stopAll();
    }
    setRunning(false);
    setSessionId(null);
  };

  // ── Actions management ────────────────────────────────────────────────────
  const addAction = () =>
    setActions((prev) => [...prev, { type: "click", count: 1, delay_ms: 50 }]);

  const updateAction = (idx: number, a: Action) =>
    setActions((prev) => prev.map((x, i) => (i === idx ? a : x)));

  const removeAction = (idx: number) =>
    setActions((prev) => prev.filter((_, i) => i !== idx));

  // ── Refresh proxies ───────────────────────────────────────────────────────
  const refreshProxies = async () => {
    await backendApi.refreshProxies();
  };

  // ── Presets plateformes ──────────────────────────────────────────────────
  const applyPreset = (id: string) => {
    const p = PLATFORM_PRESETS.find((x) => x.id === id);
    if (!p || running) return;
    setActivePreset(id);
    setUrl(p.url);
    setNumWorkers(p.num_workers);
    setUseProxies(p.use_proxies);
    setRepeat(p.repeat);
    setThinkTimeMs(p.think_time_ms);
    setActions(p.actions);
  };

  return (
    <div className="min-h-screen bg-cream text-ink font-sans">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-cream/95 backdrop-blur border-b-2 border-ink">
        <div className="max-w-[1440px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-ink text-cream grid place-items-center text-xl font-display font-extrabold">
              C
            </div>
            <div>
              <div className="font-display font-extrabold text-2xl leading-none tracking-tight">
                LarpLabs<span className="text-berry"> V2</span>
              </div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-ink/50 mt-1">
                Chrome Engine Turbo
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Backend status */}
            <div className="flex items-center gap-2 text-sm">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  backendOnline === null
                    ? "bg-ink/25"
                    : backendOnline
                    ? connected
                      ? "bg-mint animate-pulse"
                      : "bg-lemon"
                    : "bg-berry"
                }`}
              />
              <span className="font-medium text-sm">
                {backendOnline === null
                  ? "Connexion..."
                  : backendOnline
                  ? connected
                    ? "Backend connecté"
                    : "Backend en ligne (WS...)"
                  : "Backend hors ligne"}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Backend offline warning */}
      {backendOnline === false && (
        <div className="bg-berry text-white text-center py-4 px-6 text-sm font-medium">
          ⚠️ Backend Python hors ligne. Lance{" "}
          <code className="bg-white/20 px-2 py-0.5 rounded font-mono">
            cd backend && python start.py
          </code>{" "}
          dans un terminal.
        </div>
      )}

      <div className="max-w-[1440px] mx-auto px-6 py-8 grid grid-cols-12 gap-6">
        {/* ── LEFT: Controls ─────────────────────────────────────────────── */}
        <section className="col-span-12 lg:col-span-4 flex flex-col gap-6">
          {/* Presets plateformes */}
          <div className="bg-white rounded-[2rem] border-2 border-ink p-6 shadow-[10px_10px_0_0_var(--ink)]">
            <h2 className="font-display font-extrabold text-3xl leading-none mb-1">
              Presets 🚀
            </h2>
            <p className="text-sm text-ink/55 mb-4">
              1 clic = URL + workers + actions optimisés.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {PLATFORM_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.id)}
                  disabled={running}
                  title={`${p.description} · ${p.num_workers} workers`}
                  className={`flex flex-col items-center gap-1 rounded-2xl border-2 px-2 py-3 text-xs font-bold transition-all disabled:opacity-40 ${
                    activePreset === p.id
                      ? "border-ink bg-lemon shadow-[3px_3px_0_0_var(--ink)]"
                      : "border-ink/20 bg-cream hover:border-ink hover:bg-lemon/50"
                  }`}
                >
                  <span className={`w-8 h-8 rounded-xl ${p.color} grid place-items-center text-white`}>
                    <PlatformLogo id={p.id} className="w-5 h-5" />
                  </span>
                  <span className="leading-tight">{p.name}</span>
                  <span className="text-[10px] font-mono font-normal text-ink/50">
                    {p.num_workers} w.
                  </span>
                </button>
              ))}
            </div>
            {activePreset && (
              <p className="text-[11px] font-mono text-ink/50 mt-3">
                ✅ {PLATFORM_PRESETS.find((x) => x.id === activePreset)?.description}
              </p>
            )}
          </div>

          {/* Config card */}
          <div className="bg-white rounded-[2rem] border-2 border-ink p-6 shadow-[10px_10px_0_0_var(--ink)]">
            <h2 className="font-display font-extrabold text-3xl leading-none mb-1">
              Chrome Workers
            </h2>
            <p className="text-sm text-ink/55 mb-5">
              Moteur turbo custom · 5-15 MB RAM/instance · 1500 max.
            </p>

            {/* URL */}
            <label className="block text-[11px] uppercase tracking-[0.16em] text-ink/50 font-bold mb-2">
              URL Cible
            </label>
            <div className="flex items-center gap-2 bg-cream border-2 border-ink rounded-2xl px-4 py-3 mb-3">
              <span className="text-ink/40 text-sm font-mono">https://</span>
              <input
                type="text"
                value={url.replace(/^https?:\/\//, "")}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  if (!raw) return setUrl("");
                  setUrl(raw.startsWith("http") ? raw : "https://" + raw);
                }}
                placeholder="example.com"
                className="flex-1 bg-transparent outline-none text-sm font-medium placeholder:text-ink/30"
                disabled={running}
              />
              <button
                onClick={doProbe}
                disabled={!validUrl || running || probeState === "probing" || !backendOnline}
                className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border-2 border-ink bg-white hover:bg-lemon disabled:opacity-40 transition-colors"
              >
                {probeState === "probing" ? "…" : "Test"}
              </button>
            </div>

            <div className="mb-5 min-h-[22px] text-xs font-mono">
              {probeState === "ok" && probeInfo && (
                <span className="text-mint">
                  ● accessible · {probeInfo.status_code} · {probeInfo.elapsed_ms}ms
                </span>
              )}
              {probeState === "fail" && (
                <span className="text-berry">● inaccessible</span>
              )}
              {probeState === "idle" && (
                <span className="text-ink/40">Teste l'URL avant de démarrer.</span>
              )}
            </div>

            {/* Workers count */}
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-[11px] uppercase tracking-[0.16em] text-ink/50 font-bold">
                Workers Chrome
              </span>
              <span className="font-mono font-bold text-2xl">{numWorkers}</span>
            </div>
            <input
              type="range"
              min={1}
              max={1500}
              value={numWorkers}
              disabled={running}
              onChange={(e) => setNumWorkers(Number(e.target.value))}
              className="w-full accent-berry mb-1"
            />
            <div className="flex justify-between text-[11px] font-mono text-ink/40 mb-5">
              <span>1</span>
              <span>750</span>
              <span>1500</span>
            </div>

            {/* Options */}
            <div className="flex flex-col gap-3 mb-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useProxies}
                  onChange={(e) => setUseProxies(e.target.checked)}
                  disabled={running}
                  className="w-4 h-4 accent-berry"
                />
                <span className="text-sm font-medium">Rotation proxies multi-sources</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={repeat}
                  onChange={(e) => setRepeat(e.target.checked)}
                  disabled={running}
                  className="w-4 h-4 accent-berry"
                />
                <span className="text-sm font-medium">Boucle infinie</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={solveCaptcha}
                  onChange={(e) => setSolveCaptcha(e.target.checked)}
                  disabled={running}
                  className="w-4 h-4 accent-berry"
                />
                <span className="text-sm font-medium">
                  Resolver auto Cloudflare/captcha
                  <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-cream border border-ink/20 text-ink/60">
                    {captchaOcr === null ? "OCR…" : captchaOcr ? "OCR ✅" : "OCR ➕"}
                  </span>
                </span>
              </label>
            </div>

            <div className="mb-5">
              <label className="text-[11px] uppercase tracking-[0.16em] text-ink/50 font-bold block mb-2">
                Pause entre cycles ({thinkTimeMs}ms)
              </label>
              <input
                type="range"
                min={0}
                max={10000}
                step={100}
                value={thinkTimeMs}
                disabled={running}
                onChange={(e) => setThinkTimeMs(Number(e.target.value))}
                className="w-full accent-ink"
              />
            </div>

            {/* Start/Stop */}
            {running ? (
              <button
                onClick={stop}
                className="w-full bg-berry text-white font-display font-extrabold text-lg py-4 rounded-2xl border-2 border-ink shadow-[5px_5px_0_0_var(--ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[3px_3px_0_0_var(--ink)] transition-transform"
              >
                Stop ■
              </button>
            ) : (
              <button
                onClick={start}
                disabled={!validUrl || !backendOnline}
                className="w-full bg-mint text-ink font-display font-extrabold text-lg py-4 rounded-2xl border-2 border-ink shadow-[5px_5px_0_0_var(--ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[3px_3px_0_0_var(--ink)] transition-transform disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              >
                Démarrer →
              </button>
            )}
          </div>

          {/* Actions card */}
          <div className="bg-white rounded-[2rem] border-2 border-ink p-6 shadow-[10px_10px_0_0_var(--ink)]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-extrabold text-xl">Actions sur page</h3>
              <button
                onClick={addAction}
                disabled={running}
                className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-xl border-2 border-ink bg-lemon hover:bg-yellow-200 disabled:opacity-40"
              >
                + Ajouter
              </button>
            </div>
            {actions.length === 0 && (
              <p className="text-xs text-ink/40 font-mono">
                Aucune action. Les workers feront juste charger la page.
              </p>
            )}
            <div className="flex flex-col gap-3">
              {actions.map((a, i) => (
                <ActionBuilder
                  key={i}
                  action={a}
                  index={i}
                  onUpdate={updateAction}
                  onRemove={removeAction}
                />
              ))}
            </div>
          </div>

          {/* Proxy card */}
          <div className="bg-ink text-cream rounded-[2rem] p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-cream/50 font-bold">
                Pool Proxies multi-sources
              </div>
              {proxyStats && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cream/10 text-cream/70">
                  {proxyStats.sources_ok ?? 0}/{proxyStats.sources_total ?? 0} sources
                </span>
              )}
            </div>
            {proxyStats ? (
              <>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="font-display font-extrabold text-3xl">
                    {proxyStats.alive}
                  </span>
                  <span className="text-cream/60 text-sm">live / {proxyStats.total} scannés</span>
                </div>
                {/* Vetting progress — 10 workers simultanés */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-[11px] font-mono text-cream/60 mb-1">
                    <span>
                      {proxyStats.vetting ? (
                        <span className="text-lemon">🔍 vetting {proxyStats.vet_checked}/{proxyStats.vet_total || "…"}</span>
                      ) : (
                        <span>✅ vetting terminé</span>
                      )}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-mint/20 text-mint font-bold">
                      {proxyStats.vet_concurrency ?? 10} workers
                    </span>
                  </div>
                  {proxyStats.vet_total > 0 && (
                    <div className="h-2 bg-cream/15 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-mint rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, (proxyStats.vet_checked / Math.max(1, proxyStats.vet_total)) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="text-xs font-mono text-cream/50 mb-3">
                  {Object.entries(proxyStats.by_kind ?? {}).map(([k, n]) => (
                    <span key={k} className="mr-2">
                      {k}: {n}
                    </span>
                  ))}
                </div>
                {/* Top pays */}
                {proxyStats.by_country && Object.keys(proxyStats.by_country).length > 0 && (
                  <div className="mb-3">
                    <div className="text-[10px] uppercase tracking-wider text-cream/40 font-bold mb-1.5">
                      🌍 Top pays (live)
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(proxyStats.by_country).slice(0, 8).map(([c, n]) => (
                        <span key={c} className="text-[11px] font-mono px-2 py-0.5 rounded-lg bg-cream/10">
                          {c} <b className="text-lemon">{n}</b>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Top sources */}
                {proxyStats.by_source && Object.keys(proxyStats.by_source).length > 0 && (
                  <div className="mb-3">
                    <div className="text-[10px] uppercase tracking-wider text-cream/40 font-bold mb-1.5">
                      📦 Top sources
                    </div>
                    <div className="flex flex-col gap-1">
                      {Object.entries(proxyStats.by_source).slice(0, 5).map(([s, n]) => (
                        <div key={s} className="flex items-center gap-2 text-[11px] font-mono">
                          <span className="text-cream/60 truncate flex-1">{s}</span>
                          <div className="w-20 h-1.5 bg-cream/15 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-tangerine rounded-full"
                              style={{ width: `${Math.min(100, (n / Math.max(1, proxyStats.total)) * 100)}%` }}
                            />
                          </div>
                          <span className="text-cream/70 w-12 text-right">{n}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-cream/50 text-sm mb-3">Chargement...</div>
            )}
            <button
              onClick={refreshProxies}
              disabled={!backendOnline}
              className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-xl border-2 border-cream/30 text-cream hover:bg-cream/10 disabled:opacity-40"
            >
              ↺ Refresh
            </button>
          </div>
        </section>

        {/* ── RIGHT: Metrics ─────────────────────────────────────────────── */}
        <section className="col-span-12 lg:col-span-8 flex flex-col gap-6">
          {/* Stats grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              bg="bg-berry"
              fg="text-white"
              label="Requêtes"
              value={fmtNum(stats?.total_requests ?? 0)}
              sub={`+${fmtNum(stats?.rps ?? 0)}/s`}
            />
            <StatCard
              bg="bg-mint"
              fg="text-ink"
              label="Succès"
              value={`${(stats?.success_rate ?? 0).toFixed(1)}%`}
              sub={`${fmtNum(stats?.errors ?? 0)} erreurs`}
            />
            <StatCard
              bg="bg-tangerine"
              fg="text-ink"
              label="Workers actifs"
              value={String(stats?.workers_active ?? 0)}
              sub={`${stats?.browsers_open ?? 0} Chrome ouverts`}
            />
            <StatCard
              bg="bg-lemon"
              fg="text-ink"
              label="Proxies live"
              value={String(stats?.proxy_live ?? 0)}
              sub={proxyStats?.vetting ? "vetting..." : "vérifiés"}
            />
          </div>

          {/* Workers table */}
          <div className="bg-white rounded-[2rem] border-2 border-ink p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-extrabold text-xl">Workers actifs</h3>
              <span className="text-xs font-mono text-ink/50">
                {workers.length} affichés
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-ink/50 border-b-2 border-ink/10">
                    <th className="text-left pb-2">ID</th>
                    <th className="text-left pb-2">Status</th>
                    <th className="text-right pb-2">Req</th>
                    <th className="text-right pb-2">Err</th>
                    <th className="text-right pb-2">RPS</th>
                    <th className="text-left pb-2">Proxy</th>
                    <th className="text-left pb-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {workers.slice(0, 20).map((w) => (
                    <tr key={w.id} className="border-b border-ink/5 hover:bg-cream/50">
                      <td className="py-1.5 text-ink/70">{w.id}</td>
                      <td className="py-1.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            w.status === "running"
                              ? "bg-mint text-ink"
                              : w.status === "error"
                              ? "bg-berry text-white"
                              : "bg-ink/10 text-ink/60"
                          }`}
                        >
                          {w.status}
                        </span>
                      </td>
                      <td className="py-1.5 text-right">{fmtNum(w.requests_done)}</td>
                      <td className="py-1.5 text-right text-berry">{w.errors || "-"}</td>
                      <td className="py-1.5 text-right text-mint">{w.rps.toFixed(1)}</td>
                      <td className="py-1.5 text-ink/50 truncate max-w-[100px]">{w.proxy_used || "—"}</td>
                      <td className="py-1.5 text-ink/60 truncate max-w-[120px]">{w.action_description || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {workers.length === 0 && (
                <div className="text-center text-ink/40 font-mono text-sm py-6">
                  Aucun worker actif.
                </div>
              )}
            </div>
          </div>

          {/* Live log */}
          <div className="bg-ink text-cream rounded-[2rem] border-2 border-ink p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-extrabold text-xl">Log temps réel</h3>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-cream/50">
                  {running ? "● streaming" : "paused"}
                </span>
                <button
                  onClick={() => setLogs([])}
                  className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border border-cream/20 text-cream/50 hover:text-cream hover:border-cream/50"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="font-mono text-sm flex flex-col gap-1.5 min-h-[180px] max-h-[300px] overflow-y-auto">
              {logs.length === 0 && (
                <div className="text-cream/40">
                  En attente de traffic... Démarre une session.
                </div>
              )}
              {logs.map((l) => (
                <div key={l.id} className="flex items-start gap-2 leading-tight">
                  <span className={`shrink-0 ${statusColor(l.status_code)}`}>
                    {l.status_code === 0 ? "err" : l.status_code}
                  </span>
                  <span className="text-cream/50 shrink-0">{l.worker_id}</span>
                  <span className="text-cream/80 truncate">{l.url}</span>
                  {l.proxy && (
                    <span className="text-lemon/70 shrink-0 truncate max-w-[120px]">
                      via {l.proxy}
                    </span>
                  )}
                  {l.action && (
                    <span className="text-tangerine/80 shrink-0">{l.action}</span>
                  )}
                  <span className="text-cream/40 shrink-0 ml-auto">
                    {l.error ? l.error : `${l.ms}ms`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({
  bg,
  fg,
  label,
  value,
  sub,
}: {
  bg: string;
  fg: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className={`${bg} ${fg} rounded-[1.5rem] border-2 border-ink p-5 shadow-[6px_6px_0_0_var(--ink)]`}>
      <div className="text-[11px] uppercase tracking-[0.14em] font-bold opacity-80">{label}</div>
      <div className="font-display font-extrabold text-4xl mt-2 leading-none">{value}</div>
      <div className="text-xs font-mono opacity-70 mt-1">{sub}</div>
    </div>
  );
}
