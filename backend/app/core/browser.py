"""
LarpLabs V2 - Chrome Driver Ultra-Leger Turbo
Instances Chromium minimales (~5-15 MB RAM), demarrage eclair, zero cache.
"""
import asyncio
import logging
import random
from contextlib import asynccontextmanager
from typing import Any, List, Optional

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# User-Agent pool réaliste
# ──────────────────────────────────────────────────────────────────────────────

UA_POOL: List[str] = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/116.0.0.0",
]

def random_ua() -> str:
    return random.choice(UA_POOL)


# ──────────────────────────────────────────────────────────────────────────────
# Flags Chrome ultra-minimal pour 5-15 MB RAM par instance
# ──────────────────────────────────────────────────────────────────────────────

def get_browser_args(
    proxy: Optional[str] = None,
    load_images: bool = False,
    window_width: int = 1280,
    window_height: int = 720,
) -> List[str]:
    """
    Construit la liste de flags Chrome pour une instance ultra-légère.
    Chaque instance vise 5-15 MB de RAM.
    """
    args = [
        # ── Désactiver le GPU (économise ~50 MB) ──────────────────────────
        "--disable-gpu",
        "--disable-gpu-sandbox",
        "--disable-software-rasterizer",
        "--disable-gpu-compositing",

        # ── Sandbox & sécurité (économise ~30 MB) ─────────────────────────
        "--no-sandbox",
        "--disable-setuid-sandbox",

        # ── Mémoire partagée (critique pour serveurs/Docker) ──────────────
        "--disable-dev-shm-usage",
        "--shm-size=128m",

        # ── Extensions & plugins ──────────────────────────────────────────
        "--disable-extensions",
        "--disable-plugins",
        "--disable-plugins-discovery",
        "--disable-component-extensions-with-background-pages",
        "--disable-default-apps",

        # ── Images (gros économie de RAM et bande passante) ───────────────
        f"--blink-settings=imagesEnabled={'true' if load_images else 'false'}",

        # ── Cache disque OFF (demarrage + navigation plus rapides) ─────────
        "--disk-cache-size=1",
        "--media-cache-size=1",
        "--aggressive-cache-discard",
        "--disable-application-cache",
        "--disable-offline-load-stale-cache",

        # ── Rendu allege ────────────────────────────────────────────────────
        "--disable-lcd-text",
        "--disable-font-subpixel-positioning",
        "--disable-skia-runtime-opts",
        "--disable-threaded-animation",
        "--disable-threaded-scrolling",
        "--disable-checker-imaging",
        "--disable-image-animation-resync",
        "--disable-partial-raster",

        # ── Reseau & background ───────────────────────────────────────────
        "--disable-background-networking",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-breakpad",
        "--disable-client-side-phishing-detection",
        "--disable-component-update",
        "--disable-domain-reliability",
        "--disable-features=AudioServiceOutOfProcess,TranslateUI,BlinkGenPropertyTrees,IsolateOrigins,site-per-process,VizDisplayCompositor,MediaSessionService,OptimizationHints,InterestFeedContentSuggestions,CalculateNativeWinOcclusion",
        "--js-flags=--max-old-space-size=64 --max-semi-space-size=8",
        "--disable-hang-monitor",
        "--disable-ipc-flooding-protection",
        "--disable-popup-blocking",
        "--disable-prompt-on-repost",
        "--disable-renderer-backgrounding",
        "--disable-sync",
        "--disable-translate",
        "--disable-web-resources",
        "--disable-logging",

        # ── Processus ─────────────────────────────────────────────────────
        "--process-per-site",          # Moins de processus que site-per-process
        "--renderer-process-limit=2",  # Max 2 renderer processes

        # ── Misc ──────────────────────────────────────────────────────────
        "--no-first-run",
        "--no-default-browser-check",
        "--no-pings",
        "--mute-audio",
        "--metrics-recording-only",
        "--safebrowsing-disable-auto-update",
        "--password-store=basic",
        "--use-mock-keychain",
        "--hide-scrollbars",
        "--autoplay-policy=user-gesture-required",
        "--disable-notifications",
        "--ignore-certificate-errors",
        "--ignore-ssl-errors",
        "--allow-running-insecure-content",

        # ── Fenêtre ───────────────────────────────────────────────────────
        f"--window-size={window_width},{window_height}",
        "--window-position=0,0",
    ]

    # ── Proxy ─────────────────────────────────────────────────────────────
    if proxy:
        args.append(f"--proxy-server={proxy}")
        args.append("--disable-web-security")
        args.append("--allow-running-insecure-content")

    return args


# ──────────────────────────────────────────────────────────────────────────────
# Driver wrapper nodriver
# ──────────────────────────────────────────────────────────────────────────────

class ChromeDriver:
    """
    Wrapper autour d'une instance nodriver (Chromium ultra-léger).
    Utilisation via context manager async :
        async with ChromeDriver(proxy="http://1.2.3.4:8080") as driver:
            page = await driver.new_page("https://example.com")
            ...
    """

    def __init__(
        self,
        proxy: Optional[str] = None,
        load_images: bool = False,
        headless: bool = True,
        user_agent: Optional[str] = None,
    ):
        self.proxy = proxy
        self.load_images = load_images
        self.headless = headless
        self.user_agent = user_agent or random_ua()
        self._browser: Any = None
        self._tab: Any = None

    async def start(self):
        """Lance le browser Chromium."""
        try:
            import nodriver as uc  # type: ignore
        except ImportError:
            raise RuntimeError(
                "nodriver n'est pas installé. Lancez: pip install nodriver"
            )

        args = get_browser_args(
            proxy=self.proxy,
            load_images=self.load_images,
        )

        browser_config = uc.Config(
            headless=self.headless,
            browser_args=args,
            lang="en-US",
        )

        self._browser = await uc.start(config=browser_config)
        logger.debug(f"browser: started (proxy={self.proxy}, ua={self.user_agent[:40]}...)")
        return self

    async def new_page(self, url: str = "about:blank") -> Any:
        """Ouvre un nouvel onglet et navigue vers l'URL."""
        if not self._browser:
            raise RuntimeError("Browser non démarré. Appelle start() d'abord.")
        tab = await self._browser.get(url)
        self._tab = tab
        return tab

    async def close(self):
        """Ferme le browser proprement."""
        if self._browser:
            try:
                self._browser.stop()
            except Exception as e:
                logger.debug(f"browser: close error (ignoré): {e}")
            finally:
                self._browser = None
                self._tab = None

    async def __aenter__(self):
        await self.start()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
        return False


# ──────────────────────────────────────────────────────────────────────────────
# Context manager helper
# ──────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def create_driver(
    proxy: Optional[str] = None,
    load_images: bool = False,
    headless: bool = True,
    user_agent: Optional[str] = None,
):
    """
    Context manager pour créer et détruire automatiquement un Chrome driver.

    Usage:
        async with create_driver(proxy="http://1.2.3.4:8080") as (driver, tab):
            await tab.get("https://example.com")
            ...
    """
    driver = ChromeDriver(
        proxy=proxy,
        load_images=load_images,
        headless=headless,
        user_agent=user_agent,
    )
    try:
        await driver.start()
        tab = await driver.new_page()
        yield driver, tab
    finally:
        await driver.close()
