"""
LarpLabs V2 - Configuration
"""
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:4173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "*",
    ]

    # Worker Pool
    MAX_WORKERS: int = 1500
    DEFAULT_THINK_TIME_MS: int = 500
    MAX_ACTIONS_PER_PAGE: int = 100

    # Browser (moteur Chrome ultra-leger LarpLabs)
    BROWSER_HEADLESS: bool = True
    BROWSER_TIMEOUT_MS: int = 30000
    PAGE_LOAD_TIMEOUT_MS: int = 20000

    # Proxy Pool — scraping multi-sources + vetting
    PROXY_TTL_SECONDS: int = 300      # 5 minutes
    PROXY_VET_TIMEOUT_SECONDS: int = 5
    PROXY_VET_WAVE_SIZE: int = 200
    PROXY_TARGET_LIVE: int = 80
    PROXY_FAIL_THRESHOLD: int = 2
    # Verifications simultanees (vetting turbo : session partagee + endpoint 204)
    PROXY_VET_CONCURRENCY: int = 100
    # Enrichissement pays (best-effort, via ip-api batch, max N live)
    PROXY_GEO_ENABLED: bool = True
    PROXY_GEO_MAX: int = 100

    # WebSocket
    WS_BROADCAST_INTERVAL_MS: int = 500
    WS_MAX_LOG_ENTRIES: int = 1000

    # hproxy GitHub raw base URL (source principale, historique)
    HPROXY_BASE_URL: str = "https://raw.githubusercontent.com/hproxy-com/free-proxy-list/main"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
