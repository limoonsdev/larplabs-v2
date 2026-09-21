"""
LarpLabs V2 - FastAPI Application
Wires together: CORS, REST routes, WebSocket panel, lifespan
"""
from __future__ import annotations

import asyncio
import logging
import sys
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import uvicorn
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import router as api_router
from app.api.auth import router as auth_router
from app.api.billing import router as billing_router
from app.api.larpbot import router as larpbot_router
from app.api.websocket import websocket_endpoint, start_broadcast_loop, stop_broadcast_loop, on_worker_event
from app.core.config import settings
from app.core.db import init_db
from app.core.proxy_pool import proxy_pool
from app.workers.pool import worker_pool

# ──────────────────────────────────────────────────────────────────────────────
# Logging
# ──────────────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# Lifespan
# ──────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Démarre les services au startup, les arrête au shutdown."""
    logger.info("===================================================")
    logger.info("  LarpLabs V2 Backend - Démarrage...")
    logger.info("===================================================")

    # Enregistrer le callback WebSocket sur le worker pool
    worker_pool.add_callback(on_worker_event)

    # Base SQLite (users, tokens, bibliotheque presets)
    init_db()

    # Démarrer le pull de proxies en background (non-bloquant)
    asyncio.create_task(proxy_pool.get_all(force=True))
    asyncio.create_task(proxy_pool.ensure_live())

    # Démarrer le broadcast WebSocket
    await start_broadcast_loop()

    paths = sorted({getattr(r, "path", "") for r in app.routes})
    logger.info(f"OK {len(paths)} routes (billing={'/api/billing/checkout' in paths})")

    logger.info("OK Proxy pool -> pull multi-sources en background")
    logger.info("OK WebSocket broadcast loop démarré")
    logger.info(f"OK Serveur prêt sur http://{settings.HOST}:{settings.PORT}")
    logger.info(f"OK Docs disponibles sur http://{settings.HOST}:{settings.PORT}/docs")
    logger.info(f"OK WebSocket panel: ws://{settings.HOST}:{settings.PORT}/ws/panel")

    yield  # ── Application en cours ──────────────────────────────────────────

    # ── Shutdown ──────────────────────────────────────────────────────────────
    logger.info("Arrêt en cours...")

    worker_pool.remove_callback(on_worker_event)
    await worker_pool.stop_all()
    await stop_broadcast_loop()

    logger.info("OK Shutdown complet.")


# ──────────────────────────────────────────────────────────────────────────────
# FastAPI App
# ──────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="LarpLabs V2 Backend",
    version="2.1.0",
    description=(
        "Backend haute performance pour LarpLabs V2. "
        "Chrome drivers turbo ultra-legers (5-15 MB RAM), "
        "jusqu'à 1500 workers simultanés, proxies multi-sources, "
        "et panel temps réel via WebSocket."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── REST Routes ───────────────────────────────────────────────────────────────
app.include_router(api_router)
app.include_router(auth_router)
app.include_router(billing_router)
app.include_router(larpbot_router)


# ── WebSocket Panel ───────────────────────────────────────────────────────────

@app.websocket("/ws/panel")
async def ws_panel(websocket: WebSocket) -> None:
    """
    WebSocket endpoint du panel temps réel.
    Connexion : ws://localhost:8000/ws/panel

    Messages reçus du serveur :
      CONNECTED     – confirmation de connexion
      STATS_UPDATE  – stats globales (toutes les 500ms)
      WORKER_UPDATE – liste des workers actifs (toutes les 500ms)
      SESSION_UPDATE– sessions actives (toutes les 500ms)
      PROXY_UPDATE  – stats proxy pool (toutes les 5s)
      LOGS_UPDATE   – logs récents (toutes les 500ms)
      NEW_LOG       – nouveau log en temps réel

    Messages envoyés par le client :
      {"type": "PING"}         -> {"type": "PONG"}
      {"type": "GET_STATS"}    -> {"type": "STATS_UPDATE", ...}
      {"type": "GET_LOGS", "limit": 50} -> {"type": "LOGS_UPDATE", ...}
    """
    await websocket_endpoint(websocket)


# ── Root ──────────────────────────────────────────────────────────────────────

@app.get("/", include_in_schema=False)
async def root() -> JSONResponse:
    return JSONResponse({
        "app": "LarpLabs V2 Backend",
        "version": "2.1.0",
        "docs": "/docs",
        "ws": "ws://localhost:8000/ws/panel",
        "api": "/api",
    })


@app.get("/api/health", tags=["Health"])
async def health() -> JSONResponse:
    return JSONResponse({
        "status": "ok",
        "app": "LarpLabs V2 Backend",
        "version": "2.1.0",
        "workers_active": len(worker_pool.get_workers_list()),
        "proxy_live": proxy_pool.live_count,
    })


# ── Exception Handler ─────────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def generic_exception_handler(request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled exception: %s", exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "error": str(exc)},
    )


# ── Dev runner ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=False)
