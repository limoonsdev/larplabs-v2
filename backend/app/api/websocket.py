"""
LarpLabs V2 - WebSocket Panel
Broadcast temps réel des stats, workers, logs via WebSocket
"""
import asyncio
import json
import logging
import time
from typing import Any, Set

from fastapi import WebSocket, WebSocketDisconnect

from app.core.config import settings
from app.core.proxy_pool import proxy_pool
from app.workers.pool import worker_pool

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# Connection Manager
# ──────────────────────────────────────────────────────────────────────────────

class ConnectionManager:
    """Gère les connexions WebSocket actives."""

    def __init__(self):
        self._connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        async with self._lock:
            self._connections.add(ws)
        logger.info(f"ws: new connection ({len(self._connections)} total)")

    async def disconnect(self, ws: WebSocket):
        async with self._lock:
            self._connections.discard(ws)
        logger.info(f"ws: disconnected ({len(self._connections)} remaining)")

    async def broadcast(self, message: dict):
        """Envoie un message à tous les clients connectés."""
        if not self._connections:
            return
        data = json.dumps(message)
        dead: Set[WebSocket] = set()
        async with self._lock:
            connections = set(self._connections)
        for ws in connections:
            try:
                await ws.send_text(data)
            except Exception:
                dead.add(ws)
        if dead:
            async with self._lock:
                self._connections -= dead

    @property
    def count(self) -> int:
        return len(self._connections)


manager = ConnectionManager()


# ──────────────────────────────────────────────────────────────────────────────
# WebSocket endpoint
# ──────────────────────────────────────────────────────────────────────────────

async def websocket_endpoint(ws: WebSocket):
    """
    Endpoint WebSocket principal.
    - Accepte la connexion
    - Envoie les stats en continu toutes les 500ms
    - Ping/pong pour keepalive
    """
    await manager.connect(ws)
    try:
        # Envoyer un message de bienvenue avec l'état actuel
        await ws.send_text(json.dumps({
            "type": "CONNECTED",
            "data": {
                "message": "LarpLabs V2 Backend connected",
                "timestamp": int(time.time() * 1000),
                "version": "2.0.0",
            }
        }))

        # Écouter les messages entrants (ping/pong, commandes)
        while True:
            try:
                data = await asyncio.wait_for(ws.receive_text(), timeout=1.0)
                await _handle_client_message(ws, data)
            except asyncio.TimeoutError:
                pass  # Normal, on continue la boucle
            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.debug(f"ws receive error: {e}")
                break

    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(ws)


async def _handle_client_message(ws: WebSocket, raw: str):
    """Traite un message reçu du client WebSocket."""
    try:
        msg = json.loads(raw)
        msg_type = msg.get("type", "")

        if msg_type == "PING":
            await ws.send_text(json.dumps({"type": "PONG", "ts": int(time.time() * 1000)}))
        elif msg_type == "GET_STATS":
            await ws.send_text(json.dumps({
                "type": "STATS_UPDATE",
                "data": worker_pool.get_global_stats(),
            }))
        elif msg_type == "GET_LOGS":
            limit = msg.get("limit", 50)
            await ws.send_text(json.dumps({
                "type": "LOGS_UPDATE",
                "data": worker_pool.get_logs(limit=limit),
            }))
    except Exception as e:
        logger.debug(f"ws message handling error: {e}")


# ──────────────────────────────────────────────────────────────────────────────
# Background broadcast task
# ──────────────────────────────────────────────────────────────────────────────

_broadcast_task: asyncio.Task | None = None


async def start_broadcast_loop():
    """Lance la boucle de broadcast en background."""
    global _broadcast_task
    if _broadcast_task and not _broadcast_task.done():
        return
    _broadcast_task = asyncio.create_task(_broadcast_loop())
    logger.info("ws: broadcast loop started")


async def stop_broadcast_loop():
    """Arrête la boucle de broadcast."""
    global _broadcast_task
    if _broadcast_task and not _broadcast_task.done():
        _broadcast_task.cancel()
        try:
            await _broadcast_task
        except asyncio.CancelledError:
            pass
    logger.info("ws: broadcast loop stopped")


async def _broadcast_loop():
    """
    Boucle de broadcast : envoie stats + workers + proxies toutes les 500ms.
    """
    interval = settings.WS_BROADCAST_INTERVAL_MS / 1000
    last_proxy_broadcast = 0.0
    PROXY_BROADCAST_INTERVAL = 5.0  # Proxy stats toutes les 5s

    while True:
        try:
            await asyncio.sleep(interval)

            if manager.count == 0:
                continue

            now = time.time()

            # ── Stats globales ────────────────────────────────────────────
            await manager.broadcast({
                "type": "STATS_UPDATE",
                "data": worker_pool.get_global_stats(),
                "ts": int(now * 1000),
            })

            # ── Workers list ──────────────────────────────────────────────
            workers = worker_pool.get_workers_list()
            if workers:
                await manager.broadcast({
                    "type": "WORKER_UPDATE",
                    "data": workers[:100],  # Limiter à 100 workers pour le panel
                    "ts": int(now * 1000),
                })

            # ── Sessions ──────────────────────────────────────────────────
            sessions = worker_pool.get_sessions()
            if sessions:
                await manager.broadcast({
                    "type": "SESSION_UPDATE",
                    "data": sessions,
                    "ts": int(now * 1000),
                })

            # ── Logs récents ──────────────────────────────────────────────
            logs = worker_pool.get_logs(limit=20)
            if logs:
                await manager.broadcast({
                    "type": "LOGS_UPDATE",
                    "data": logs,
                    "ts": int(now * 1000),
                })

            # ── Proxy stats (moins fréquent) ──────────────────────────────
            if now - last_proxy_broadcast > PROXY_BROADCAST_INTERVAL:
                last_proxy_broadcast = now
                await manager.broadcast({
                    "type": "PROXY_UPDATE",
                    "data": proxy_pool.stats(),
                    "ts": int(now * 1000),
                })

        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error(f"ws broadcast error: {e}")
            await asyncio.sleep(1)


# ──────────────────────────────────────────────────────────────────────────────
# Callback pour nouveaux logs en temps réel
# ──────────────────────────────────────────────────────────────────────────────

async def on_worker_event(event: str, data: Any):
    """Callback appelé par le pool à chaque événement worker."""
    if event == "new_log" and manager.count > 0:
        log_dict = {
            "id": data.id,
            "worker_id": data.worker_id,
            "session_id": data.session_id,
            "status_code": data.status_code,
            "ms": data.ms,
            "url": data.url,
            "proxy": data.proxy,
            "action": data.action,
            "error": data.error,
            "timestamp": data.timestamp,
        }
        await manager.broadcast({"type": "NEW_LOG", "data": log_dict})
