"""
LarpLabs V2 - REST API Routes
Endpoints cohérents avec les interfaces de proxy_pool et worker_pool
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Dict, List, Optional

import aiohttp
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.proxy_pool import proxy_pool
from app.workers.actions import Action
from app.workers.pool import SessionConfig, worker_pool

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["LarpLabsV2"])


# ──────────────────────────────────────────────────────────────────────────────
# Request schemas
# ──────────────────────────────────────────────────────────────────────────────

class StartSessionRequest(BaseModel):
    url: str = Field(..., description="URL cible à visiter")
    num_workers: int = Field(1, ge=1, le=1500, description="Nombre de workers Chrome (1-1500)")
    use_proxies: bool = Field(True, description="Utiliser la rotation de proxies multi-sources")
    actions: List[Action] = Field(default_factory=list, description="Actions à effectuer sur chaque page")
    repeat: bool = Field(True, description="Boucler indéfiniment (True) ou 1 seul passage (False)")
    think_time_ms: int = Field(500, ge=0, le=30000, description="Pause entre cycles en millisecondes")
    load_images: bool = Field(False, description="Charger les images (augmente la consommation RAM)")
    headless: bool = Field(True, description="Mode headless (invisible)")
    solve_captcha: bool = Field(True, description="Resolver auto Cloudflare/captcha + OCR")


class StopSessionRequest(BaseModel):
    session_id: str = Field(..., description="ID de la session à arrêter")


class ProbeRequest(BaseModel):
    url: str = Field(..., description="URL à tester")
    use_proxy: bool = Field(False, description="Router via un proxy")


# ──────────────────────────────────────────────────────────────────────────────
# Session endpoints
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/session/start", summary="Démarrer une session de workers")
async def start_session(body: StartSessionRequest) -> Dict:
    """
    Lance N workers Chrome qui vont visiter l'URL et exécuter les actions configurées.
    Retourne un `session_id` pour gérer la session.

    **Exemple avec actions :**
    ```json
    {
      "url": "https://example.com",
      "num_workers": 50,
      "use_proxies": true,
      "actions": [
        {"type": "scroll", "value": "down", "count": 3},
        {"type": "click", "selector": "a.nav-link", "count": 1},
        {"type": "wait", "delay_ms": 2000}
      ]
    }
    ```
    """
    try:
        config = SessionConfig(
            url=body.url,
            num_workers=body.num_workers,
            use_proxies=body.use_proxies,
            actions=body.actions,
            repeat=body.repeat,
            think_time_ms=body.think_time_ms,
            load_images=body.load_images,
            headless=body.headless,
            solve_captcha=body.solve_captcha,
        )
        session_id = await worker_pool.start_session(config)
        logger.info(f"Session démarrée: {session_id} ({body.num_workers} workers → {body.url})")
        return {
            "ok": True,
            "session_id": session_id,
            "num_workers": body.num_workers,
            "url": body.url,
            "message": f"{body.num_workers} workers lancés vers {body.url}",
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"start_session error: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/session/stop", summary="Arrêter une session")
async def stop_session(body: StopSessionRequest) -> Dict:
    """Arrête tous les workers de la session et libère les ressources Chrome."""
    if body.session_id not in worker_pool._sessions:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{body.session_id}' non trouvée.",
        )
    await worker_pool.stop_session(body.session_id)
    return {"ok": True, "session_id": body.session_id, "stopped": True}


@router.post("/session/stop-all", summary="Arrêter toutes les sessions")
async def stop_all_sessions() -> Dict:
    """Arrête toutes les sessions actives."""
    count = len(worker_pool._sessions)
    await worker_pool.stop_all()
    return {"ok": True, "stopped_sessions": count}


@router.get("/session/status", summary="Stats globales + liste des sessions")
async def session_status() -> Dict:
    """Retourne les statistiques agrégées et la liste des sessions actives."""
    return {
        "ok": True,
        "stats": worker_pool.get_global_stats(),
        "sessions": worker_pool.get_sessions(),
    }


@router.get("/session/{session_id}", summary="Statut d'une session spécifique")
async def get_session(session_id: str) -> Dict:
    """Détail complet d'une session incluant ses workers."""
    session = worker_pool._sessions.get(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{session_id}' non trouvée.",
        )
    return {
        "ok": True,
        **session.stats(),
        "workers": [w.to_dict() for w in session.workers.values()],
    }


# ──────────────────────────────────────────────────────────────────────────────
# Proxy endpoints
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/proxies", summary="Stats du pool de proxies")
async def get_proxies() -> Dict:
    """Stats multi-sources : protocoles, sources, pays, progression du vetting."""
    stats = proxy_pool.stats()
    live_sample = [
        {
            "hostport": e.hostport,
            "kind": e.kind,
            "country": e.country,
            "source": e.source,
            "latency_ms": e.latency_ms,
        }
        for e in proxy_pool._live[:100]
    ]
    return {
        "ok": True,
        "stats": stats,
        "live_sample": live_sample,
    }


@router.post("/proxies/refresh", summary="Forcer le refresh des proxies")
async def refresh_proxies() -> Dict:
    """Re-pull multi-sources + re-vet complet en background."""
    proxy_pool.reset()
    asyncio.create_task(proxy_pool.get_all(force=True))
    asyncio.create_task(proxy_pool.ensure_live())
    return {"ok": True, "message": "Refresh des proxies déclenché en background."}


# ──────────────────────────────────────────────────────────────────────────────
# Captcha endpoint
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/captcha/status", summary="Etat du resolver captcha/Cloudflare")
async def get_captcha_status() -> Dict:
    """Indique si le resolver est actif et si l'OCR (pillow+tesseract) est dispo."""
    from app.core.captcha import captcha_status
    status = await captcha_status()
    return {"ok": True, **status}


# ──────────────────────────────────────────────────────────────────────────────
# Workers endpoint
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/workers", summary="Liste des workers actifs")
async def list_workers() -> Dict:
    """Retourne tous les workers actifs avec leurs stats en temps réel."""
    workers = worker_pool.get_workers_list()
    return {
        "ok": True,
        "count": len(workers),
        "workers": workers[:500],  # cap à 500 pour l'API
    }


# ──────────────────────────────────────────────────────────────────────────────
# Logs endpoint
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/logs", summary="Logs récents")
async def get_logs(limit: int = 50) -> Dict:
    """Retourne les logs récents (max 1000 en mémoire)."""
    return {
        "ok": True,
        "logs": worker_pool.get_logs(limit=min(limit, 1000)),
    }


# ──────────────────────────────────────────────────────────────────────────────
# Probe endpoint
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/probe", summary="Tester si une URL est accessible")
async def probe_url(body: ProbeRequest) -> Dict:
    """
    Teste si une URL est accessible (HTTP GET).
    Optionnellement route via un proxy du pool.
    """
    proxy_url: Optional[str] = None
    proxy_hostport: str = "none"

    if body.use_proxy:
        proxy_entry = proxy_pool.next_live()
        if proxy_entry:
            proxy_url = proxy_entry.url
            proxy_hostport = proxy_entry.hostport

    timeout = aiohttp.ClientTimeout(total=10)
    connector = aiohttp.TCPConnector(ssl=False)
    start = time.perf_counter()

    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
        async with aiohttp.ClientSession(connector=connector, timeout=timeout, headers=headers) as session:
            kwargs: Dict[str, Any] = {}
            if proxy_url:
                kwargs["proxy"] = proxy_url
            async with session.get(body.url, **kwargs) as resp:
                elapsed_ms = int((time.perf_counter() - start) * 1000)
                return {
                    "ok": True,
                    "url": body.url,
                    "status_code": resp.status,
                    "elapsed_ms": elapsed_ms,
                    "reachable": 0 < resp.status < 500,
                    "proxy_used": proxy_hostport,
                }
    except Exception as e:
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        return {
            "ok": False,
            "url": body.url,
            "reachable": False,
            "elapsed_ms": elapsed_ms,
            "error": str(e),
            "proxy_used": proxy_hostport,
        }
