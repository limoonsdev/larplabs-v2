/**
 * LarpLabs V2 - Backend API client
 * Communique avec le backend Python FastAPI sur localhost:8000
 */

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000";
const WS_URL = BACKEND_URL.replace(/^http/, "ws") + "/ws/panel";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type ActionType =
  | "click"
  | "type_text"
  | "key_press"
  | "scroll"
  | "wait"
  | "hover"
  | "screenshot"
  | "navigate"
  | "back"
  | "refresh"
  | "select"
  | "clear";

export type Action = {
  type: ActionType;
  selector?: string;
  value?: string;
  count?: number;
  delay_ms?: number;
  x?: number;
  y?: number;
  timeout_ms?: number;
};

export type SessionConfig = {
  url: string;
  num_workers: number;
  use_proxies: boolean;
  actions: Action[];
  repeat: boolean;
  think_time_ms: number;
  load_images?: boolean;
  headless?: boolean;
  solve_captcha?: boolean;
};

export type WorkerInfo = {
  id: string;
  session_id: string;
  status: "idle" | "starting" | "running" | "done" | "error" | "stopping";
  requests_done: number;
  errors: number;
  current_url: string;
  last_status_code: number;
  proxy_used: string;
  action_description: string;
  rps: number;
  uptime_s: number;
};

export type GlobalStats = {
  total_requests: number;
  ok: number;
  errors: number;
  success_rate: number;
  rps: number;
  workers_active: number;
  workers_total: number;
  sessions: number;
  browsers_open: number;
  proxy_live: number;
};

export type LogEntry = {
  id: number;
  worker_id: string;
  session_id: string;
  status_code: number;
  ms: number;
  url: string;
  proxy: string;
  action: string;
  error: string | null;
  timestamp: number;
};

export type ProxyStats = {
  total: number;
  alive: number;
  vetting: boolean;
  by_kind: Record<string, number>;
  by_country: Record<string, number>;
  by_source: Record<string, number>;
  vet_checked: number;
  vet_total: number;
  vet_concurrency: number;
  sources_ok: number;
  sources_total: number;
  refreshed_at: number | null;
};

export type WsMessage =
  | { type: "CONNECTED"; data: { message: string; timestamp: number } }
  | { type: "STATS_UPDATE"; data: GlobalStats; ts: number }
  | { type: "WORKER_UPDATE"; data: WorkerInfo[]; ts: number }
  | { type: "SESSION_UPDATE"; data: unknown[]; ts: number }
  | { type: "PROXY_UPDATE"; data: ProxyStats; ts: number }
  | { type: "LOGS_UPDATE"; data: LogEntry[]; ts: number }
  | { type: "NEW_LOG"; data: LogEntry }
  | { type: "PONG"; ts: number };

// ──────────────────────────────────────────────────────────────────────────────
// REST API
// ──────────────────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export const backendApi = {
  // ── Health ─────────────────────────────────────────────────────────────────
  health: () => apiFetch<{ status: string }>("/api/health"),

  // ── Session ────────────────────────────────────────────────────────────────
  startSession: (config: SessionConfig) =>
    apiFetch<{ ok: boolean; session_id: string; num_workers: number; url: string }>(
      "/api/session/start",
      { method: "POST", body: JSON.stringify(config) }
    ),

  stopSession: (session_id: string) =>
    apiFetch<{ ok: boolean }>("/api/session/stop", {
      method: "POST",
      body: JSON.stringify({ session_id }),
    }),

  stopAll: () =>
    apiFetch<{ ok: boolean; stopped_sessions: number }>("/api/session/stop-all", {
      method: "POST",
      body: JSON.stringify({}),
    }),

  sessionStatus: () =>
    apiFetch<{ ok: boolean; stats: GlobalStats; sessions: unknown[] }>("/api/session/status"),

  // ── Proxies ────────────────────────────────────────────────────────────────
  getProxies: () =>
    apiFetch<{ ok: boolean; stats: ProxyStats; live_sample: unknown[] }>("/api/proxies"),

  refreshProxies: () =>
    apiFetch<{ ok: boolean; message: string }>("/api/proxies/refresh", { method: "POST", body: "{}" }),

  // ── Captcha ────────────────────────────────────────────────────────────────
  captchaStatus: () =>
    apiFetch<{ ok: boolean; resolver: boolean; ocr: boolean; handles: string[] }>("/api/captcha/status"),

  // ── Workers ────────────────────────────────────────────────────────────────
  getWorkers: () =>
    apiFetch<{ ok: boolean; count: number; workers: WorkerInfo[] }>("/api/workers"),

  // ── Probe ──────────────────────────────────────────────────────────────────
  probe: (url: string, use_proxy = false) =>
    apiFetch<{ ok: boolean; reachable: boolean; status_code: number; elapsed_ms: number; error?: string }>(
      "/api/probe",
      { method: "POST", body: JSON.stringify({ url, use_proxy }) }
    ),
};

// ──────────────────────────────────────────────────────────────────────────────
// WebSocket
// ──────────────────────────────────────────────────────────────────────────────

export type WsCallbacks = {
  onStats?: (data: GlobalStats) => void;
  onWorkers?: (data: WorkerInfo[]) => void;
  onProxy?: (data: ProxyStats) => void;
  onLog?: (data: LogEntry) => void;
  onLogs?: (data: LogEntry[]) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
};

export function connectBackendWs(callbacks: WsCallbacks): () => void {
  let ws: WebSocket | null = null;
  let pingInterval: ReturnType<typeof setInterval> | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  const connect = () => {
    if (destroyed) return;
    try {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        callbacks.onConnect?.();
        // Ping toutes les 20s pour keepalive
        pingInterval = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "PING" }));
          }
        }, 20_000);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as WsMessage;
          switch (msg.type) {
            case "STATS_UPDATE":
              callbacks.onStats?.(msg.data);
              break;
            case "WORKER_UPDATE":
              callbacks.onWorkers?.(msg.data);
              break;
            case "PROXY_UPDATE":
              callbacks.onProxy?.(msg.data);
              break;
            case "NEW_LOG":
              callbacks.onLog?.(msg.data);
              break;
            case "LOGS_UPDATE":
              callbacks.onLogs?.(msg.data);
              break;
            default:
              break;
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        if (pingInterval) clearInterval(pingInterval);
        callbacks.onDisconnect?.();
        // Reconnexion auto après 3s
        if (!destroyed) {
          reconnectTimeout = setTimeout(connect, 3_000);
        }
      };

      ws.onerror = () => {
        ws?.close();
      };
    } catch {
      if (!destroyed) {
        reconnectTimeout = setTimeout(connect, 5_000);
      }
    }
  };

  connect();

  // Retourne une fonction de cleanup
  return () => {
    destroyed = true;
    if (pingInterval) clearInterval(pingInterval);
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    ws?.close();
  };
}

export { BACKEND_URL, WS_URL };
