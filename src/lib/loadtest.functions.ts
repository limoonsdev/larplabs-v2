import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getPool,
  poolStats,
  proxySupported,
  proxiedFetch,
  ensureLive,
  nextLive,
  reportFailure,
  reportSuccess,
  liveCount,
  resetLive,
} from "./proxy-pool.server";


const BatchInput = z.object({
  url: z.string().url(),
  batchSize: z.number().int().min(1).max(64),
  method: z.enum(["GET", "HEAD"]).default("GET"),
  useProxies: z.boolean().default(false),
  browserMode: z.boolean().default(true),
});


const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
]);

function assertPublicUrl(raw: string) {
  const u = new URL(raw);
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Only http and https targets are allowed.");
  }
  const host = u.hostname.toLowerCase();
  if (
    BLOCKED_HOSTS.has(host) ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    throw new Error("Private and loopback addresses are not allowed.");
  }
  return u.toString();
}

export type BatchResult = {
  status: number;
  ms: number;
  ok: boolean;
  error?: string;
  proxy?: string;
  /** Sub-resources (css/js/img) pulled like a browser would. */
  assets?: number;
  /** Path of the link the session "clicked" after the page loaded. */
  clicked?: string;
};

const UA_POOL = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0",
];

const ASSET_RE = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
const LINK_RE = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["']/gi;

function collect(html: string, base: string, re: RegExp, max: number, assetsOnly: boolean) {
  const out: string[] = [];
  const seen = new Set<string>();
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < max) {
    const raw = m[1];
    if (!raw || raw.startsWith("data:") || raw.startsWith("mailto:") || raw.startsWith("javascript:")) continue;
    let abs: string;
    try {
      abs = new URL(raw, base).toString();
    } catch {
      continue;
    }
    if (!abs.startsWith("http")) continue;
    if (new URL(abs).origin !== new URL(base).origin) continue;
    if (assetsOnly && !/\.(css|js|mjs|png|jpe?g|webp|svg|gif|woff2?|ico)(\?|$)/i.test(abs)) continue;
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push(abs);
  }
  return out;
}


export const runBatch = createServerFn({ method: "POST" })
  .inputValidator((data) => BatchInput.parse(data))
  .handler(async ({ data }): Promise<{
    results: BatchResult[];
    startedAt: number;
    poolSize: number;
    proxySupported: boolean;
  }> => {
    const target = assertPublicUrl(data.url);
    const startedAt = Date.now();

    let useProxies = data.useProxies;
    if (useProxies) {
      await ensureLive();
      if (liveCount() === 0) useProxies = false;
    }

    const PROXY_TRIES = 4;
    const MAX_ASSETS = 6;

    /** One session = navigate, pull sub-resources, click an internal link. */
    const one = async (): Promise<BatchResult> => {
      const t0 = Date.now();
      let lastErr = "error";
      let lastProxy: string | undefined;
      const ua = UA_POOL[Math.floor(Math.random() * UA_POOL.length)]!;

      const attempts = useProxies ? PROXY_TRIES : 1;
      for (let i = 0; i < attempts; i++) {
        const entry = useProxies ? nextLive() : null;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), entry ? 7_000 : 10_000);
        const go = (u: string, headers: Record<string, string>) => {
          const init = {
            method: data.method,
            redirect: "follow" as const,
            signal: controller.signal,
            headers,
          };
          return entry ? proxiedFetch(u, entry.url, init) : fetch(u, init);
        };
        const navHeaders = {
          "user-agent": ua,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
          "cache-control": "no-cache",
          "upgrade-insecure-requests": "1",
          "sec-fetch-dest": "document",
          "sec-fetch-mode": "navigate",
          "sec-fetch-site": "none",
        };

        try {
          const res = await go(target, navHeaders);
          if (!res) {
            const direct = await fetch(target, { method: data.method, redirect: "follow", signal: controller.signal, headers: navHeaders });
            if (data.method === "GET") await direct.arrayBuffer();
            return { status: direct.status, ms: Date.now() - t0, ok: direct.ok };
          }

          let assets = 0;
          let clicked: string | undefined;

          if (data.method === "GET") {
            const html = await res.text();
            if (data.browserMode && res.ok && html.includes("<")) {
              const finalUrl = res.url || target;
              // Sub-resources, like a browser painting the page.
              const subs = collect(html, finalUrl, ASSET_RE, MAX_ASSETS, true);
              const subHeaders = {
                "user-agent": ua,
                accept: "*/*",
                referer: finalUrl,
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "no-cors",
                "sec-fetch-site": "same-origin",
              };
              const got = await Promise.all(
                subs.map((s) =>
                  go(s, subHeaders)
                    .then(async (r) => {
                      if (r) await r.arrayBuffer();
                      return true;
                    })
                    .catch(() => false),
                ),
              );
              assets = got.filter(Boolean).length;

              // The click: pick an internal link and navigate to it.
              const links = collect(html, finalUrl, LINK_RE, 12, false).filter((l) => l !== finalUrl);
              if (links.length) {
                const pick = links[Math.floor(Math.random() * links.length)]!;
                try {
                  const r2 = await go(pick, { ...navHeaders, referer: finalUrl, "sec-fetch-site": "same-origin" });
                  if (r2) {
                    await r2.arrayBuffer();
                    clicked = new URL(pick).pathname;
                  }
                } catch {
                  /* click missed, the page view still counts */
                }
              }
            }
          }

          if (entry) reportSuccess(entry);
          return {
            status: res.status,
            ms: Date.now() - t0,
            ok: res.ok,
            ...(entry ? { proxy: entry.hostport } : {}),
            ...(assets ? { assets } : {}),
            ...(clicked ? { clicked } : {}),
          };
        } catch (err) {
          lastErr =
            err instanceof Error
              ? err.name === "AbortError"
                ? "timeout"
                : err.name
              : "error";
          if (entry) {
            lastProxy = entry.hostport;
            reportFailure(entry);
          }
        } finally {
          clearTimeout(timer);
        }
      }

      return {
        status: 0,
        ms: Date.now() - t0,
        ok: false,
        error: lastErr,
        ...(lastProxy ? { proxy: lastProxy } : {}),
      };
    };


    const results = await Promise.all(Array.from({ length: data.batchSize }, one));
    return {
      results,
      startedAt,
      poolSize: useProxies ? liveCount() : 0,
      proxySupported: proxySupported() !== false,
    };
  });


export const getProxyPool = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ refresh: z.boolean().default(false) }).parse(data))
  .handler(async ({ data }) => {
    if (data.refresh) resetLive();
    const pool = await getPool(data.refresh);
    void ensureLive();
    return { ...poolStats(pool), supported: proxySupported() !== false };
  });



export const probeTarget = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ url: z.string().url() }).parse(data))
  .handler(async ({ data }) => {
    const target = assertPublicUrl(data.url);
    const t0 = Date.now();
    try {
      const res = await fetch(target, { method: "GET", redirect: "follow" });
      await res.arrayBuffer();
      return { reachable: true, status: res.status, ms: Date.now() - t0, url: target };
    } catch {
      return { reachable: false, status: 0, ms: Date.now() - t0, url: target };
    }
  });
