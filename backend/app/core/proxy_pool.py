"""
LarpLabs V2 - Proxy Pool
Scraping multi-sources (GitHub + APIs publiques), vetting asynchrone
a 10 workers simultanes, rotation round-robin, stats par pays/source.
"""
import asyncio
import logging
import random
import re
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import aiohttp

from app.core.config import settings

logger = logging.getLogger(__name__)

LINE_RE = re.compile(r"^(?:(?:https?|socks[45])://)?(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$")


# ──────────────────────────────────────────────────────────────────────────────
# Data types
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class ProxyEntry:
    kind: str        # "http" | "socks4" | "socks5"
    hostport: str    # "1.2.3.4:8080"
    url: str         # "http://1.2.3.4:8080"
    source: str = "unknown"
    country: str = "??"
    latency_ms: int = 0
    failures: int = 0
    successes: int = 0
    last_used: float = field(default_factory=time.time)


# ──────────────────────────────────────────────────────────────────────────────
# Sources : GitHub (raw txt) + APIs publiques
# Chaque entree: {name, url, kind, format}
# kind = "http" | "socks4" | "socks5" | "mixed" (detecte par ligne/entree)
# format = "txt" | "geonode"
# ──────────────────────────────────────────────────────────────────────────────

def _hproxy_sources() -> List[Dict]:
    base = settings.HPROXY_BASE_URL
    return [
        {"name": "hproxy/http", "url": f"{base}/http.txt", "kind": "http", "format": "txt"},
        {"name": "hproxy/https", "url": f"{base}/https.txt", "kind": "http", "format": "txt"},
        {"name": "hproxy/socks4", "url": f"{base}/socks4.txt", "kind": "socks4", "format": "txt"},
        {"name": "hproxy/socks5", "url": f"{base}/socks5.txt", "kind": "socks5", "format": "txt"},
    ]


SOURCES: List[Dict] = [
    # ── monosans/proxy-list ──────────────────────────────────────────────
    {"name": "monosans/http", "url": "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt", "kind": "http", "format": "txt"},
    {"name": "monosans/socks4", "url": "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks4.txt", "kind": "socks4", "format": "txt"},
    {"name": "monosans/socks5", "url": "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt", "kind": "socks5", "format": "txt"},
    # ── TheSpeedX/PROXY-List ─────────────────────────────────────────────
    {"name": "thespeedx/http", "url": "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt", "kind": "http", "format": "txt"},
    {"name": "thespeedx/socks4", "url": "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks4.txt", "kind": "socks4", "format": "txt"},
    {"name": "thespeedx/socks5", "url": "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt", "kind": "socks5", "format": "txt"},
    # ── TheSpeedX/SOCKS-List ─────────────────────────────────────────────
    {"name": "thespeedx-socks/http", "url": "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt", "kind": "http", "format": "txt"},
    {"name": "thespeedx-socks/socks5", "url": "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks5.txt", "kind": "socks5", "format": "txt"},
    # ── proxifly/free-proxy-list (tout-en-un) ────────────────────────────
    {"name": "proxifly/http", "url": "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/http/data.txt", "kind": "http", "format": "txt"},
    {"name": "proxifly/socks4", "url": "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/socks4/data.txt", "kind": "socks4", "format": "txt"},
    {"name": "proxifly/socks5", "url": "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/socks5/data.txt", "kind": "socks5", "format": "txt"},
    # ── openproxylist.xyz ────────────────────────────────────────────────
    {"name": "openproxylist/http", "url": "https://api.openproxylist.xyz/http.txt", "kind": "http", "format": "txt"},
    {"name": "openproxylist/socks4", "url": "https://api.openproxylist.xyz/socks4.txt", "kind": "socks4", "format": "txt"},
    {"name": "openproxylist/socks5", "url": "https://api.openproxylist.xyz/socks5.txt", "kind": "socks5", "format": "txt"},
    # ── mmpx12/proxy-list ────────────────────────────────────────────────
    {"name": "mmpx12/http", "url": "https://raw.githubusercontent.com/mmpx12/proxy-list/master/http.txt", "kind": "http", "format": "txt"},
    {"name": "mmpx12/socks4", "url": "https://raw.githubusercontent.com/mmpx12/proxy-list/master/socks4.txt", "kind": "socks4", "format": "txt"},
    {"name": "mmpx12/socks5", "url": "https://raw.githubusercontent.com/mmpx12/proxy-list/master/socks5.txt", "kind": "socks5", "format": "txt"},
    # ── vakhov/fresh-proxy-list ──────────────────────────────────────────
    {"name": "vakhov/http", "url": "https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/http.txt", "kind": "http", "format": "txt"},
    {"name": "vakhov/socks4", "url": "https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/socks4.txt", "kind": "socks4", "format": "txt"},
    {"name": "vakhov/socks5", "url": "https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/socks5.txt", "kind": "socks5", "format": "txt"},
    # ── ShiftyTR/Proxy-List ──────────────────────────────────────────────
    {"name": "shiftytr/http", "url": "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt", "kind": "http", "format": "txt"},
    {"name": "shiftytr/https", "url": "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/https.txt", "kind": "http", "format": "txt"},
    {"name": "shiftytr/socks4", "url": "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks4.txt", "kind": "socks4", "format": "txt"},
    {"name": "shiftytr/socks5", "url": "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks5.txt", "kind": "socks5", "format": "txt"},
    # ── ErcinDedeoglu/proxies ────────────────────────────────────────────
    {"name": "ercindedeoglu/http", "url": "https://raw.githubusercontent.com/ErcinDedeoglu/proxies/main/proxies/http.txt", "kind": "http", "format": "txt"},
    {"name": "ercindedeoglu/https", "url": "https://raw.githubusercontent.com/ErcinDedeoglu/proxies/main/proxies/https.txt", "kind": "http", "format": "txt"},
    {"name": "ercindedeoglu/socks4", "url": "https://raw.githubusercontent.com/ErcinDedeoglu/proxies/main/proxies/socks4.txt", "kind": "socks4", "format": "txt"},
    {"name": "ercindedeoglu/socks5", "url": "https://raw.githubusercontent.com/ErcinDedeoglu/proxies/main/proxies/socks5.txt", "kind": "socks5", "format": "txt"},
    # ── Zaeem20/FREE_PROXIES_LIST ────────────────────────────────────────
    {"name": "zaeem/http", "url": "https://raw.githubusercontent.com/Zaeem20/FREE_PROXIES_LIST/master/http.txt", "kind": "http", "format": "txt"},
    {"name": "zaeem/https", "url": "https://raw.githubusercontent.com/Zaeem20/FREE_PROXIES_LIST/master/https.txt", "kind": "http", "format": "txt"},
    {"name": "zaeem/socks4", "url": "https://raw.githubusercontent.com/Zaeem20/FREE_PROXIES_LIST/master/socks4.txt", "kind": "socks4", "format": "txt"},
    {"name": "zaeem/socks5", "url": "https://raw.githubusercontent.com/Zaeem20/FREE_PROXIES_LIST/master/socks5.txt", "kind": "socks5", "format": "txt"},
    # ── Anonym0usWork1221/Free-Proxies ───────────────────────────────────
    {"name": "anonym0us/http", "url": "https://raw.githubusercontent.com/Anonym0usWork1221/Free-Proxies/main/proxy_files/http_proxies.txt", "kind": "http", "format": "txt"},
    {"name": "anonym0us/socks4", "url": "https://raw.githubusercontent.com/Anonym0usWork1221/Free-Proxies/main/proxy_files/socks4_proxies.txt", "kind": "socks4", "format": "txt"},
    {"name": "anonym0us/socks5", "url": "https://raw.githubusercontent.com/Anonym0usWork1221/Free-Proxies/main/proxy_files/socks5_proxies.txt", "kind": "socks5", "format": "txt"},
    # ── KangProxy ────────────────────────────────────────────────────────
    {"name": "kangproxy/http", "url": "https://raw.githubusercontent.com/officialputuid/KangProxy/KangProxy/http/http.txt", "kind": "http", "format": "txt"},
    {"name": "kangproxy/https", "url": "https://raw.githubusercontent.com/officialputuid/KangProxy/KangProxy/https/https.txt", "kind": "http", "format": "txt"},
    {"name": "kangproxy/socks4", "url": "https://raw.githubusercontent.com/officialputuid/KangProxy/KangProxy/socks4/socks4.txt", "kind": "socks4", "format": "txt"},
    {"name": "kangproxy/socks5", "url": "https://raw.githubusercontent.com/officialputuid/KangProxy/KangProxy/socks5/socks5.txt", "kind": "socks5", "format": "txt"},
    # ── zloi-user/hideip.me ──────────────────────────────────────────────
    {"name": "hideip/http", "url": "https://raw.githubusercontent.com/zloi-user/hideip.me/main/http.txt", "kind": "http", "format": "txt"},
    {"name": "hideip/https", "url": "https://raw.githubusercontent.com/zloi-user/hideip.me/main/https.txt", "kind": "http", "format": "txt"},
    {"name": "hideip/socks4", "url": "https://raw.githubusercontent.com/zloi-user/hideip.me/main/socks4.txt", "kind": "socks4", "format": "txt"},
    {"name": "hideip/socks5", "url": "https://raw.githubusercontent.com/zloi-user/hideip.me/main/socks5.txt", "kind": "socks5", "format": "txt"},
    # ── prxchk/proxy-list ────────────────────────────────────────────────
    {"name": "prxchk/http", "url": "https://raw.githubusercontent.com/prxchk/proxy-list/main/http.txt", "kind": "http", "format": "txt"},
    {"name": "prxchk/socks4", "url": "https://raw.githubusercontent.com/prxchk/proxy-list/main/socks4.txt", "kind": "socks4", "format": "txt"},
    {"name": "prxchk/socks5", "url": "https://raw.githubusercontent.com/prxchk/proxy-list/main/socks5.txt", "kind": "socks5", "format": "txt"},
    # ── UptimerBot/proxy-list ────────────────────────────────────────────
    {"name": "uptimerbot/http", "url": "https://raw.githubusercontent.com/UptimerBot/proxy-list/main/proxies/http.txt", "kind": "http", "format": "txt"},
    {"name": "uptimerbot/socks4", "url": "https://raw.githubusercontent.com/UptimerBot/proxy-list/main/proxies/socks4.txt", "kind": "socks4", "format": "txt"},
    {"name": "uptimerbot/socks5", "url": "https://raw.githubusercontent.com/UptimerBot/proxy-list/main/proxies/socks5.txt", "kind": "socks5", "format": "txt"},
    # ── RX4096/proxy-list ────────────────────────────────────────────────
    {"name": "rx4096/http", "url": "https://raw.githubusercontent.com/RX4096/proxy-list/main/online/http.txt", "kind": "http", "format": "txt"},
    {"name": "rx4096/https", "url": "https://raw.githubusercontent.com/RX4096/proxy-list/main/online/https.txt", "kind": "http", "format": "txt"},
    {"name": "rx4096/socks4", "url": "https://raw.githubusercontent.com/RX4096/proxy-list/main/online/socks4.txt", "kind": "socks4", "format": "txt"},
    {"name": "rx4096/socks5", "url": "https://raw.githubusercontent.com/RX4096/proxy-list/main/online/socks5.txt", "kind": "socks5", "format": "txt"},
    # ── Listes unitaires ─────────────────────────────────────────────────
    {"name": "clarketm/http", "url": "https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt", "kind": "http", "format": "txt"},
    {"name": "mertguvencli/http", "url": "https://raw.githubusercontent.com/mertguvencli/http-proxy-list/main/proxy-list/data.txt", "kind": "http", "format": "txt"},
    {"name": "sunny9577/http", "url": "https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/proxies.txt", "kind": "http", "format": "txt"},
    {"name": "hookzof/socks5", "url": "https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt", "kind": "socks5", "format": "txt"},
    {"name": "proxy4parsing/http", "url": "https://raw.githubusercontent.com/proxy4parsing/list/master/http.txt", "kind": "http", "format": "txt"},
    {"name": "jetkai/http", "url": "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-http.txt", "kind": "http", "format": "txt"},
    {"name": "jetkai/socks5", "url": "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks5.txt", "kind": "socks5", "format": "txt"},
    {"name": "stamparm/socks4", "url": "https://raw.githubusercontent.com/stamparm/aux/master/fetch-socks4.txt", "kind": "socks4", "format": "txt"},
    {"name": "stamparm/socks5", "url": "https://raw.githubusercontent.com/stamparm/aux/master/fetch-socks5.txt", "kind": "socks5", "format": "txt"},
    # ── Formats non standard (scan ip:port dans la page) ────────────────
    {"name": "fate0/all", "url": "https://raw.githubusercontent.com/fate0/proxylist/master/proxy.list", "kind": "mixed", "format": "scan"},
    {"name": "almroot/all", "url": "https://raw.githubusercontent.com/almroot/proxylist/master/list.txt", "kind": "mixed", "format": "scan"},
    {"name": "spys.me/all", "url": "https://spys.me/proxy.txt", "kind": "mixed", "format": "scan"},
    # ── APIs free-proxy (txt) ────────────────────────────────────────────
    {"name": "proxyscrape/http", "url": "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all", "kind": "http", "format": "txt"},
    {"name": "proxyscrape/socks4", "url": "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks4&timeout=10000&country=all&ssl=all&anonymity=all", "kind": "socks4", "format": "txt"},
    {"name": "proxyscrape/socks5", "url": "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=10000&country=all&ssl=all&anonymity=all", "kind": "socks5", "format": "txt"},
    {"name": "proxy-list.download/http", "url": "https://www.proxy-list.download/api/v1/get?type=http", "kind": "http", "format": "txt"},
    {"name": "proxy-list.download/https", "url": "https://www.proxy-list.download/api/v1/get?type=https", "kind": "http", "format": "txt"},
    {"name": "proxy-list.download/socks4", "url": "https://www.proxy-list.download/api/v1/get?type=socks4", "kind": "socks4", "format": "txt"},
    {"name": "proxy-list.download/socks5", "url": "https://www.proxy-list.download/api/v1/get?type=socks5", "kind": "socks5", "format": "txt"},
    {"name": "pubproxy/http", "url": "http://pubproxy.com/api/proxy?limit=20&format=txt&type=http", "kind": "http", "format": "txt"},
    # ── geonode (API JSON avec pays + latence) ───────────────────────────
    {"name": "geonode", "url": "https://proxylist.geonode.com/api/proxy-list?limit=500&page=1&sort_by=lastChecked&sort_type=desc", "kind": "mixed", "format": "geonode"},
]


# ──────────────────────────────────────────────────────────────────────────────
# ProxyPool Singleton
# ──────────────────────────────────────────────────────────────────────────────

class ProxyPool:
    """
    Pool de proxies auto-rafraichi depuis ~78 sources (GitHub + APIs).
    - Vetting asynchrone avec 10 workers simultanes (semaphore)
    - Rotation round-robin sur proxies verifies
    - Stats par protocole, source et pays
    """

    VET_URL = "http://httpbin.org/ip"

    def __init__(self):
        self._all: List[ProxyEntry] = []
        self._live: List[ProxyEntry] = []
        self._cache_at: Optional[float] = None
        self._load_lock = asyncio.Lock()
        self._vet_task: Optional[asyncio.Task] = None
        self._vet_sem = asyncio.Semaphore(settings.PROXY_VET_CONCURRENCY)
        self._cursor = 0
        self._live_cursor = 0
        self._candidate_idx = 0
        self._fails: Dict[str, int] = {}
        self._vetting = False
        self._vet_checked = 0
        self._vet_total = 0
        self._sources_ok = 0
        self._sources_total = 0

    # ── Parsing ────────────────────────────────────────────────────────────

    def _parse_txt(self, text: str, kind: str, source: str) -> List[ProxyEntry]:
        entries: List[ProxyEntry] = []
        for raw_line in text.splitlines():
            line = raw_line.strip().strip(",;\"' ")
            if not line or len(line) > 64:
                continue
            m = LINE_RE.match(line)
            if not m:
                continue
            try:
                port = int(m.group(2))
            except ValueError:
                continue
            if port < 1 or port > 65535:
                continue
            hostport = f"{m.group(1)}:{port}"
            # Detecte le protocole depuis le prefix eventuel
            low = raw_line.strip().lower()
            if low.startswith("socks5://"):
                k = "socks5"
            elif low.startswith("socks4://"):
                k = "socks4"
            elif kind == "mixed":
                k = "http"
            else:
                k = kind
            proto = "socks5" if k == "socks5" else "socks4" if k == "socks4" else "http"
            entries.append(ProxyEntry(kind=k, hostport=hostport, url=f"{proto}://{hostport}", source=source))
        return entries

    def _parse_scan(self, text: str, kind: str, source: str) -> List[ProxyEntry]:
        """Extrait tous les ip:port trouves n'importe ou dans le texte
        (pages HTML, listes exotiques type fate0/spys.me)."""
        entries: List[ProxyEntry] = []
        seen: set = set()
        for m in re.finditer(r"(\d{1,3}(?:\.\d{1,3}){3}):(\d{2,5})", text):
            try:
                port = int(m.group(2))
            except ValueError:
                continue
            if port < 1 or port > 65535:
                continue
            # Ignore les faux positifs (versions, timestamps)
            octets = m.group(1).split(".")
            if any(int(o) > 255 for o in octets):
                continue
            hostport = f"{m.group(1)}:{port}"
            if hostport in seen:
                continue
            seen.add(hostport)
            k = "http" if kind == "mixed" else kind
            proto = "socks5" if k == "socks5" else "socks4" if k == "socks4" else "http"
            entries.append(ProxyEntry(kind=k, hostport=hostport, url=f"{proto}://{hostport}", source=source))
        return entries

    def _parse_geonode(self, payload: dict, source: str) -> List[ProxyEntry]:
        entries: List[ProxyEntry] = []
        try:
            items = payload.get("data", [])
        except AttributeError:
            return []
        for item in items:
            try:
                ip = str(item.get("ip", "")).strip()
                port = str(item.get("port", "")).strip()
                if not ip or not port:
                    continue
                hostport = f"{ip}:{port}"
                if not LINE_RE.match(hostport):
                    continue
                protocols = item.get("protocols") or []
                proto_raw = str(protocols[0]).lower() if protocols else "http"
                if "socks5" in proto_raw:
                    k, url_proto = "socks5", "socks5"
                elif "socks4" in proto_raw:
                    k, url_proto = "socks4", "socks4"
                else:
                    k, url_proto = "http", "http"
                country = str(item.get("country") or "??").upper()[:2]
                entries.append(ProxyEntry(
                    kind=k, hostport=hostport, url=f"{url_proto}://{hostport}",
                    source=source, country=country,
                ))
            except Exception:
                continue
        return entries

    # ── Pull multi-sources ─────────────────────────────────────────────────

    async def _fetch_source(self, session: aiohttp.ClientSession, spec: Dict) -> List[ProxyEntry]:
        name = spec["name"]
        try:
            async with session.get(spec["url"], timeout=aiohttp.ClientTimeout(total=20)) as resp:
                if resp.status != 200:
                    logger.warning(f"proxy: {name} returned HTTP {resp.status}")
                    return []
                if spec.get("format") == "geonode":
                    try:
                        payload = await resp.json()
                    except Exception:
                        return []
                    out = self._parse_geonode(payload, name)
                elif spec.get("format") == "scan":
                    text = await resp.text()
                    out = self._parse_scan(text, spec.get("kind", "mixed"), name)
                else:
                    text = await resp.text()
                    out = self._parse_txt(text, spec.get("kind", "http"), name)
                logger.info(f"proxy: {name} -> {len(out)} entries")
                return out
        except Exception as e:
            logger.warning(f"proxy: failed to fetch {name}: {e}")
            return []

    async def _load_all(self) -> List[ProxyEntry]:
        specs = _hproxy_sources() + SOURCES
        self._sources_total = len(specs)
        connector = aiohttp.TCPConnector(limit=50, ssl=False)
        async with aiohttp.ClientSession(connector=connector) as session:
            tasks = [self._fetch_source(session, spec) for spec in specs]
            chunks = await asyncio.gather(*tasks, return_exceptions=True)

        seen: set = set()
        entries: List[ProxyEntry] = []
        ok = 0
        for chunk in chunks:
            if isinstance(chunk, Exception) or not chunk:
                continue
            ok += 1
            for e in chunk:
                if e.url not in seen:
                    seen.add(e.url)
                    entries.append(e)
        self._sources_ok = ok

        random.shuffle(entries)
        logger.info(f"proxy_pool: loaded {len(entries)} proxies from {ok}/{len(specs)} sources")
        return entries

    # ── Cache ──────────────────────────────────────────────────────────────

    async def get_all(self, force: bool = False) -> List[ProxyEntry]:
        """Retourne tous les proxies, avec cache TTL."""
        ttl = settings.PROXY_TTL_SECONDS
        fresh = (
            self._cache_at is not None
            and time.time() - self._cache_at < ttl
        )
        if not force and fresh:
            return self._all

        async with self._load_lock:
            fresh = (
                self._cache_at is not None
                and time.time() - self._cache_at < ttl
            )
            if not force and fresh:
                return self._all

            entries = await self._load_all()
            if entries:
                self._all = entries
                self._cache_at = time.time()
                self._candidate_idx = 0
        return self._all

    # ── Vetting (10 workers simultanes) ────────────────────────────────────

    async def _test_proxy(self, entry: ProxyEntry) -> bool:
        """Teste un proxy contre httpbin.org/ip. Max 10 tests simultanes."""
        async with self._vet_sem:
            timeout = aiohttp.ClientTimeout(total=settings.PROXY_VET_TIMEOUT_SECONDS)
            t0 = time.perf_counter()
            try:
                connector = aiohttp.TCPConnector(ssl=False)
                async with aiohttp.ClientSession(connector=connector) as session:
                    async with session.get(
                        self.VET_URL,
                        proxy=entry.url if entry.kind == "http" else None,
                        timeout=timeout,
                        headers={"Cache-Control": "no-cache"},
                    ) as resp:
                        ok = 0 < resp.status < 500
                        if ok:
                            entry.latency_ms = int((time.perf_counter() - t0) * 1000)
                        return ok
            except Exception:
                return False
            finally:
                self._vet_checked += 1

    async def _vet_wave(self, candidates: List[ProxyEntry]) -> List[ProxyEntry]:
        """Teste une vague de proxies (10 en parallele via semaphore)."""
        flags = await asyncio.gather(*[self._test_proxy(e) for e in candidates], return_exceptions=True)
        good = []
        for ok, entry in zip(flags, candidates):
            if ok is True:
                good.append(entry)
        return good

    async def ensure_live(self, min_live: int = None) -> List[ProxyEntry]:
        """
        S'assure qu'il y a au moins `min_live` proxies verifies dans le pool live.
        Lance le vetting en background si necessaire.
        """
        if min_live is None:
            min_live = settings.PROXY_TARGET_LIVE

        if len(self._live) >= min_live:
            return self._live

        if self._vet_task and not self._vet_task.done():
            return self._live

        self._vet_task = asyncio.create_task(self._run_vetting(min_live))
        return self._live

    async def _run_vetting(self, min_live: int):
        """Tache de vetting en background (10 verifications simultanees)."""
        self._vetting = True
        self._vet_checked = 0
        try:
            pool = await self.get_all()
            # Seulement les proxies HTTP pour nodriver/Chrome
            candidates = [p for p in pool if p.kind == "http"]
            if not candidates:
                return

            self._vet_total = min(len(candidates), settings.PROXY_VET_WAVE_SIZE * 12)
            wave_size = settings.PROXY_VET_WAVE_SIZE
            max_waves = 12
            waves = 0

            while len(self._live) < min_live and waves < max_waves:
                waves += 1
                batch: List[ProxyEntry] = []
                for _ in range(wave_size):
                    idx = self._candidate_idx % len(candidates)
                    batch.append(candidates[idx])
                    self._candidate_idx += 1

                good = await self._vet_wave(batch)
                existing_urls = {e.url for e in self._live}
                for e in good:
                    if e.url not in existing_urls:
                        self._live.append(e)
                        existing_urls.add(e.url)

                logger.info(
                    f"proxy_pool vetting wave {waves}: "
                    f"+{len(good)} live (total live={len(self._live)})"
                )

                if len(self._live) >= min_live:
                    break

            # Enrichissement pays (best-effort, background, non-bloquant)
            if settings.PROXY_GEO_ENABLED and self._live:
                asyncio.create_task(self._enrich_countries(list(self._live[:settings.PROXY_GEO_MAX])))

        except Exception as e:
            logger.error(f"proxy_pool vetting error: {e}")
        finally:
            self._vetting = False
            logger.info(f"proxy_pool vetting done: {len(self._live)} live proxies")

    # ── Geolocalisation (best-effort, ip-api batch) ────────────────────────

    async def _enrich_countries(self, entries: List[ProxyEntry]):
        """Remplit `country` pour les live proxies via ip-api.com (batch)."""
        targets = [e for e in entries if (e.country or "??") == "??"]
        if not targets:
            return
        try:
            ips = [e.hostport.split(":")[0] for e in targets[:100]]
            payload = [{"query": ip, "fields": "status,countryCode,query"} for ip in ips]
            timeout = aiohttp.ClientTimeout(total=15)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post("http://ip-api.com/batch?fields=status,countryCode,query", json=payload) as resp:
                    if resp.status != 200:
                        return
                    data = await resp.json()
            by_ip: Dict[str, str] = {}
            for row in data or []:
                try:
                    if row.get("status") == "success" and row.get("countryCode"):
                        by_ip[str(row.get("query"))] = str(row.get("countryCode")).upper()
                except Exception:
                    continue
            for e in targets:
                ip = e.hostport.split(":")[0]
                if ip in by_ip:
                    e.country = by_ip[ip]
            logger.info(f"proxy_pool: geo enriched {len(by_ip)}/{len(ips)} countries")
        except Exception as e:
            logger.debug(f"proxy_pool geo enrich skipped: {e}")

    # ── Rotation ───────────────────────────────────────────────────────────

    def next_live(self) -> Optional[ProxyEntry]:
        """Round-robin sur proxies verifies."""
        if not self._live:
            return None
        entry = self._live[self._live_cursor % len(self._live)]
        self._live_cursor = (self._live_cursor + 1) % len(self._live)
        return entry

    def next_any(self) -> Optional[ProxyEntry]:
        """Round-robin sur tous les proxies (non vettes)."""
        if not self._all:
            return None
        entry = self._all[self._cursor % len(self._all)]
        self._cursor = (self._cursor + 1) % len(self._all)
        return entry

    # ── Report ─────────────────────────────────────────────────────────────

    def report_failure(self, entry: ProxyEntry):
        """Retire un proxy du pool live apres trop d'echecs."""
        n = self._fails.get(entry.url, 0) + 1
        self._fails[entry.url] = n
        entry.failures += 1
        if n >= settings.PROXY_FAIL_THRESHOLD:
            self._live = [l for l in self._live if l.url != entry.url]
            self._fails.pop(entry.url, None)
            # Relancer le vetting si pool live faible
            threshold = settings.PROXY_TARGET_LIVE // 2
            if len(self._live) < threshold:
                asyncio.create_task(self.ensure_live())

    def report_success(self, entry: ProxyEntry):
        """Efface les echecs d'un proxy qui a reussi."""
        self._fails.pop(entry.url, None)
        entry.successes += 1

    # ── Stats ──────────────────────────────────────────────────────────────

    def stats(self) -> dict:
        by_kind: Dict[str, int] = {}
        by_source: Dict[str, int] = {}
        for e in self._all:
            by_kind[e.kind] = by_kind.get(e.kind, 0) + 1
            by_source[e.source] = by_source.get(e.source, 0) + 1
        by_country: Dict[str, int] = {}
        for e in self._live:
            c = (e.country or "??").upper()
            by_country[c] = by_country.get(c, 0) + 1
        # Top pays tries par volume
        by_country = dict(sorted(by_country.items(), key=lambda kv: kv[1], reverse=True)[:20])
        # Top sources triees par volume
        by_source = dict(sorted(by_source.items(), key=lambda kv: kv[1], reverse=True)[:20])
        return {
            "total": len(self._all),
            "alive": len(self._live),
            "vetting": self._vetting,
            "by_kind": by_kind,
            "by_source": by_source,
            "by_country": by_country,
            "vet_checked": self._vet_checked,
            "vet_total": self._vet_total,
            "vet_concurrency": settings.PROXY_VET_CONCURRENCY,
            "sources_ok": self._sources_ok,
            "sources_total": self._sources_total,
            "refreshed_at": self._cache_at,
        }

    def reset(self):
        """Force reset du pool live (re-vet tout)."""
        self._live = []
        self._live_cursor = 0
        self._candidate_idx = 0
        self._fails.clear()
        self._vet_task = None
        self._vet_checked = 0
        self._vet_total = 0

    @property
    def live_count(self) -> int:
        return len(self._live)

    @property
    def is_vetting(self) -> bool:
        return self._vetting


# Singleton global
proxy_pool = ProxyPool()
