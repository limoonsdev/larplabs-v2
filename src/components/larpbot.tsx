/**
 * LarpLabs V2 — LarpBot Officiel (widget support flottant).
 * Discute via /api/larpbot/chat, construit des presets (MCP),
 * les applique au panel via event + sessionStorage.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { backendApi, getToken, type ChatPreset } from "@/lib/backend-api";

type Msg = { role: "user" | "assistant"; content: string; preset?: ChatPreset | null };

const GREETING: Msg = {
  role: "assistant",
  content:
    "Salut, c'est LarpBot 🤖 Décris-moi une chaîne, une vidéo ou une plateforme (ex : « ma chaîne YouTube gaming ») et je te construis le workflow parfait, direct dans ta bibliothèque.",
};

export function applyChatPreset(p: ChatPreset) {
  try {
    sessionStorage.setItem("larp_pending_preset", JSON.stringify(p));
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent("larp:apply-preset", { detail: p }));
  window.dispatchEvent(new CustomEvent("larp:library-updated"));
}

export function LarpBot() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [aiOn, setAiOn] = useState<boolean | null>(null);
  const [authed, setAuthed] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setAuthed(!!getToken());
    backendApi
      .larpbotStatus()
      .then((s) => setAiOn(s.ai))
      .catch(() => setAiOn(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    if (!getToken()) {
      setMsgs((m) => [
        ...m,
        { role: "user", content: text },
        {
          role: "assistant",
          content: "Connecte-toi d'abord pour que je construise tes presets 🔒",
        },
      ]);
      setInput("");
      return;
    }
    const history = [...msgs, { role: "user" as const, content: text }]
      .filter((m) => m.content !== GREETING.content)
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setSending(true);
    try {
      const r = await backendApi.larpbotChat(history);
      setMsgs((m) => [...m, { role: "assistant", content: r.reply, preset: r.preset }]);
    } catch (e) {
      setMsgs((m) => [
        ...m,
        { role: "assistant", content: `Oups : ${String(e instanceof Error ? e.message : e)}` },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="w-[min(92vw,380px)] bg-white rounded-[1.5rem] border-2 border-ink shadow-[10px_10px_0_0_var(--ink)] overflow-hidden flex flex-col">
          <div className="bg-ink text-cream px-5 py-3.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-mint text-ink grid place-items-center text-xl font-extrabold">
              🤖
            </div>
            <div className="flex-1">
              <div className="font-display font-extrabold leading-none">LarpBot Officiel</div>
              <div className="text-[11px] font-mono text-cream/60 mt-1">
                {aiOn === null ? "connexion…" : aiOn ? "● en ligne — MCP presets" : "○ IA hors ligne"}
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-8 h-8 rounded-xl border border-cream/30 text-cream/70 hover:text-cream font-bold"
            >
              ✕
            </button>
          </div>

          <div className="h-[340px] overflow-y-auto px-4 py-3 flex flex-col gap-2.5 bg-cream/60">
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-snug whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-ink text-cream rounded-br-md"
                      : "bg-white border-2 border-ink/15 rounded-bl-md"
                  }`}
                >
                  {m.content}
                  {m.preset && (
                    <div className="mt-2 rounded-xl border-2 border-ink bg-lemon/40 p-3">
                      <div className="font-display font-extrabold">📦 {m.preset.name}</div>
                      <div className="text-xs font-mono text-ink/60 mt-0.5 break-all">{m.preset.url}</div>
                      <div className="text-xs font-mono text-ink/60">
                        {m.preset.num_workers} workers · {m.preset.actions.length} actions
                      </div>
                      <button
                        onClick={() => applyChatPreset(m.preset!)}
                        className="mt-2 w-full py-2 rounded-xl bg-ink text-cream text-xs font-bold hover:bg-berry transition-colors"
                      >
                        Appliquer au panel →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="text-xs font-mono text-ink/50 animate-pulse">LarpBot réfléchit…</div>
            )}
            <div ref={bottomRef} />
          </div>

          {!authed ? (
            <div className="p-3 border-t-2 border-ink/10 text-center">
              <Link to="/login" className="text-sm font-bold text-berry hover:underline">
                Se connecter pour builder des presets →
              </Link>
            </div>
          ) : (
            <div className="p-3 border-t-2 border-ink/10 flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void send()}
                placeholder="Décris ta chaîne / plateforme…"
                className="flex-1 bg-cream border-2 border-ink/20 rounded-xl px-3 py-2 text-sm outline-none focus:border-ink"
              />
              <button
                onClick={() => void send()}
                disabled={sending}
                className="px-4 py-2 rounded-xl bg-berry text-white border-2 border-ink text-sm font-bold disabled:opacity-40"
              >
                ➤
              </button>
            </div>
          )}
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-5 py-3.5 rounded-full bg-ink text-cream border-2 border-ink shadow-[5px_5px_0_0_var(--berry)] font-display font-extrabold hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0_0_var(--berry)] transition-all"
      >
        <span className="text-xl">🤖</span>
        {open ? "Fermer" : "Support LarpBot"}
      </button>
    </div>
  );
}
