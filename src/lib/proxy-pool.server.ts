// Live proxy pool sourced from the public hproxy free-proxy-list repo.
// https://github.com/hproxy-com/free-proxy-list

const BASE = "https://raw.githubusercontent.com/hproxy-com/free-proxy-list/main";

export type ProxyKind = "http" | "socks4" | "socks5";

export type ProxyEntry = {
  kind: ProxyKind;
  hostport: string;
  url: string;
};

const LISTS: { file: string; kind: ProxyKind }[] = [
  { file: "http.txt", kind: "http" },
  { file: "https.txt", kind: "http" },
  { file: "socks4.txt", kind: "socks4" },
  { file: "socks5.txt", kind: "socks5" },
];

const TTL_MS = 5 * 60 * 1000;
const LINE = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/;

let cache: { at: number; entries: ProxyEntry[] } | null = null;
let inflight: Promise<ProxyEntry[]> | null = null;
let cursor = 0;

async function fetchList(file: string, kind: ProxyKind): Promise<ProxyEntry[]> {
  try {
    const res = await fetch(`${BASE}/${file}`, { headers: { accept: "text/plain" } });
    if (!res.ok) return [];
    const text = await res.text();
    const out: ProxyEntry[] = [];
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      const m = LINE.exec(line);
      if (!m) continue;
      const port = Number(m[2]);
      if (!port || port > 65535) continue;
      out.push({ kind, hostport: line, url: `${kind}://${line}` });
    }
    return out;
  } catch {
    return [];
  }
}

async function load(): Promise<ProxyEntry[]> {
  const chunks = await Promise.all(LISTS.map((l) => fetchList(l.file, l.kind)));
  const seen = new Set<string>();
  const entries: ProxyEntry[] = [];
  for (const chunk of chunks) {
    for (const e of chunk) {
      if (seen.has(e.url)) continue;
      seen.add(e.url);
      entries.push(e);
    }
  }
  // Shuffle once so rotation isn't geographically clustered.
  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = entries[i]!;
    entries[i] = entries[j]!;
    entries[j] = a;
  }
  return entries;
}

export async function getPool(force = false): Promise<ProxyEntry[]> {
  const fresh = cache && Date.now() - cache.at < TTL_MS;
  if (!force && fresh && cache) return cache.entries;
  if (inflight) return inflight;
  inflight = load()
    .then((entries) => {
      if (entries.length) cache = { at: Date.now(), entries };
      return cache?.entries ?? [];
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Round-robin over the shuffled pool: every request gets a different proxy. */
export function nextProxy(pool: ProxyEntry[]): ProxyEntry | null {
  if (!pool.length) return null;
  const e = pool[cursor % pool.length]!;
  cursor = (cursor + 1) % pool.length;
  return e;
}

export function poolStats(pool: ProxyEntry[]) {
  const byKind: Record<string, number> = {};
  for (const e of pool) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
  return {
    total: pool.length,
    byKind,
    refreshedAt: cache?.at ?? null,
    alive: live.length,
    vetting: vetInflight !== null,
  };
}


type Dispatcher = unknown;
type UndiciFetch = (
  url: string,
  init: Record<string, unknown>,
) => Promise<{
  status: number;
  ok: boolean;
  url?: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
  text: () => Promise<string>;
  headers: { get: (name: string) => string | null };
}>;

const agents = new Map<string, Dispatcher>();
let proxySupport: boolean | null = null;
let undiciMod: { ProxyAgent: new (o: { uri: string }) => Dispatcher; fetch: UndiciFetch } | null =
  null;

async function loadUndici() {
  if (undiciMod) return undiciMod;
  if (proxySupport === false) return null;
  try {
    undiciMod = (await import("undici")) as unknown as {
      ProxyAgent: new (o: { uri: string }) => Dispatcher;
      fetch: UndiciFetch;
    };
    proxySupport = true;
    return undiciMod;
  } catch {
    proxySupport = false;
    return null;
  }
}

function agentFor(mod: { ProxyAgent: new (o: { uri: string }) => Dispatcher }, proxyUrl: string) {
  const cached = agents.get(proxyUrl);
  if (cached) return cached;
  const agent = new mod.ProxyAgent({ uri: proxyUrl });
  if (agents.size > 400) agents.clear();
  agents.set(proxyUrl, agent);
  return agent;
}

/**
 * Performs a request through a proxy. Returns null when the runtime
 * can't route requests through proxies at all.
 */
export async function proxiedFetch(
  target: string,
  proxyUrl: string,
  init: Record<string, unknown>,
) {
  const mod = await loadUndici();
  if (!mod) return null;
  return mod.fetch(target, { ...init, dispatcher: agentFor(mod, proxyUrl) });
}

export async function proxyRuntimeReady() {
  return (await loadUndici()) !== null;
}

export function proxySupported() {
  return proxySupport;
}

/* -------------------------------------------------------------------------
 * Live pool: only proxies that actually answered a test request are used.
 * ---------------------------------------------------------------------- */

const VET_URL = "http://example.com/";
const VET_TIMEOUT = 6_000;
const VET_WAVE = 150;
const TARGET_LIVE = 80;

let live: ProxyEntry[] = [];
let liveCursor = 0;
let candidateIdx = 0;
const fails = new Map<string, number>();
let vetInflight: Promise<ProxyEntry[]> | null = null;

async function testProxy(entry: ProxyEntry): Promise<boolean> {
  const mod = await loadUndici();
  if (!mod) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VET_TIMEOUT);
  try {
    const res = await mod.fetch(VET_URL, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      dispatcher: agentFor(mod, entry.url),
      headers: { "cache-control": "no-cache" },
    });
    await res.arrayBuffer().catch(() => undefined);
    return res.status > 0 && res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Vets candidates in waves until enough working proxies are found. */
export async function ensureLive(min = TARGET_LIVE): Promise<ProxyEntry[]> {
  if (live.length >= min) return live;
  if (vetInflight) return vetInflight;

  vetInflight = (async () => {
    const pool = (await getPool()).filter((p) => p.kind === "http");
    if (!pool.length) return live;
    let waves = 0;
    while (live.length < min && waves < 12) {
      waves++;
      const batch: ProxyEntry[] = [];
      for (let i = 0; i < VET_WAVE; i++) {
        batch.push(pool[candidateIdx % pool.length]!);
        candidateIdx++;
      }
      const flags = await Promise.all(batch.map(testProxy));
      flags.forEach((ok, i) => {
        const e = batch[i]!;
        if (ok && !live.some((l) => l.url === e.url)) live.push(e);
      });
    }
    return live;
  })().finally(() => {
    vetInflight = null;
  });

  return vetInflight;
}

/** Round-robin over verified proxies only. */
export function nextLive(): ProxyEntry | null {
  if (!live.length) return null;
  const e = live[liveCursor % live.length]!;
  liveCursor = (liveCursor + 1) % live.length;
  return e;
}

/** Drops a proxy from the live set after repeated failures. */
export function reportFailure(entry: ProxyEntry) {
  const n = (fails.get(entry.url) ?? 0) + 1;
  fails.set(entry.url, n);
  if (n >= 2) {
    live = live.filter((l) => l.url !== entry.url);
    fails.delete(entry.url);
    if (live.length < TARGET_LIVE / 2) void ensureLive();
  }
}

export function reportSuccess(entry: ProxyEntry) {
  fails.delete(entry.url);
}

export function liveCount() {
  return live.length;
}

export function resetLive() {
  live = [];
  candidateIdx = 0;
  fails.clear();
}


