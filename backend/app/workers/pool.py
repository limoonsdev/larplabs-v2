"""
CreamyViews Backend - Worker Pool
Gère jusqu'à 1500 workers Chrome simultanés avec asyncio.Semaphore
"""
import asyncio
import logging
import random
import string
import time
from collections import deque
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Deque, Dict, List, Optional

from pydantic import BaseModel, Field

from app.core.browser import ChromeDriver, random_ua
from app.core.config import settings
from app.core.proxy_pool import proxy_pool
from app.workers.actions import Action, ActionResult, execute_actions

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# Models
# ──────────────────────────────────────────────────────────────────────────────

class SessionConfig(BaseModel):
    """Configuration d'une session de workers."""
    url: str = Field(..., description="URL cible")
    num_workers: int = Field(1, ge=1, le=1500, description="Nombre de workers (1-1500)")
    use_proxies: bool = Field(True, description="Utiliser les proxies multi-sources")
    actions: List[Action] = Field(default_factory=list, description="Actions à effectuer sur la page")
    repeat: bool = Field(True, description="Répéter en boucle (True) ou 1 passage (False)")
    think_time_ms: int = Field(500, ge=0, le=30000, description="Pause entre cycles (ms)")
    load_images: bool = Field(False, description="Charger les images (augmente la RAM)")
    headless: bool = Field(True, description="Mode headless")
    solve_captcha: bool = Field(True, description="Resolver auto Cloudflare/captcha + OCR")


class WorkerStatus(str, Enum):
    IDLE = "idle"
    STARTING = "starting"
    RUNNING = "running"
    DONE = "done"
    ERROR = "error"
    STOPPING = "stopping"


@dataclass
class WorkerState:
    """État d'un worker individuel."""
    id: str
    session_id: str
    status: WorkerStatus = WorkerStatus.IDLE
    requests_done: int = 0
    errors: int = 0
    current_url: str = ""
    last_status_code: int = 0
    proxy_used: str = ""
    action_description: str = ""
    started_at: float = field(default_factory=time.time)
    last_request_at: float = 0.0
    _rps_window: Deque[float] = field(default_factory=lambda: deque(maxlen=10))

    def record_request(self):
        now = time.time()
        self._rps_window.append(now)
        self.last_request_at = now
        self.requests_done += 1

    @property
    def rps(self) -> float:
        if len(self._rps_window) < 2:
            return 0.0
        window = list(self._rps_window)
        span = window[-1] - window[0]
        if span <= 0:
            return 0.0
        return (len(window) - 1) / span

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "session_id": self.session_id,
            "status": self.status.value,
            "requests_done": self.requests_done,
            "errors": self.errors,
            "current_url": self.current_url,
            "last_status_code": self.last_status_code,
            "proxy_used": self.proxy_used,
            "action_description": self.action_description,
            "rps": round(self.rps, 2),
            "uptime_s": round(time.time() - self.started_at, 1),
        }


# ──────────────────────────────────────────────────────────────────────────────
# Log Entry
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class LogEntry:
    id: int
    worker_id: str
    session_id: str
    status_code: int
    ms: float
    url: str
    proxy: str
    action: str
    error: Optional[str]
    timestamp: int  # ms epoch


# ──────────────────────────────────────────────────────────────────────────────
# Session
# ──────────────────────────────────────────────────────────────────────────────

class Session:
    """Une session = ensemble de workers pour une URL/config donnée."""

    def __init__(self, session_id: str, config: SessionConfig):
        self.id = session_id
        self.config = config
        self.workers: Dict[str, WorkerState] = {}
        self.tasks: List[asyncio.Task] = []
        self.stopped = False
        self.started_at = time.time()
        self.total_requests = 0
        self.total_ok = 0
        self.total_errors = 0

    def stats(self) -> dict:
        now = time.time()
        elapsed = now - self.started_at
        rps_sum = sum(w.rps for w in self.workers.values())
        active = sum(1 for w in self.workers.values() if w.status == WorkerStatus.RUNNING)
        return {
            "session_id": self.id,
            "url": self.config.url,
            "num_workers": self.config.num_workers,
            "active_workers": active,
            "total_requests": self.total_requests,
            "total_ok": self.total_ok,
            "total_errors": self.total_errors,
            "rps": round(rps_sum, 2),
            "elapsed_s": round(elapsed, 1),
            "running": not self.stopped,
        }


# ──────────────────────────────────────────────────────────────────────────────
# Worker Pool
# ──────────────────────────────────────────────────────────────────────────────

class WorkerPool:
    """
    Pool central gérant jusqu'à 1500 workers Chrome simultanés.
    Utilise asyncio.Semaphore pour limiter la concurrence.
    Chaque worker = 1 Chrome instance (5-15 MB RAM).
    """

    def __init__(self, max_workers: int = None):
        self.max_workers = max_workers or settings.MAX_WORKERS
        self._semaphore = asyncio.Semaphore(self.max_workers)
        self._sessions: Dict[str, Session] = {}
        self._workers: Dict[str, WorkerState] = {}
        self._logs: Deque[LogEntry] = deque(maxlen=settings.WS_MAX_LOG_ENTRIES)
        self._log_counter = 0
        self._callbacks: List[Callable] = []
        self._active_browser_count = 0

    # ── Session management ───────────────────────────────────────────────────

    async def start_session(self, config: SessionConfig) -> str:
        """Démarre une nouvelle session avec `config.num_workers` workers."""
        session_id = "sess-" + "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
        session = Session(session_id, config)
        self._sessions[session_id] = session

        logger.info(
            f"session {session_id}: starting {config.num_workers} workers -> {config.url}"
        )

        # Lancer le vetting des proxies en background si nécessaire
        if config.use_proxies:
            asyncio.create_task(proxy_pool.ensure_live())

        # Lancer les workers
        for i in range(config.num_workers):
            worker_id = f"w-{i+1:04d}"
            state = WorkerState(id=worker_id, session_id=session_id)
            state.status = WorkerStatus.STARTING
            session.workers[worker_id] = state
            self._workers[worker_id] = state

            task = asyncio.create_task(
                self._run_worker(session, state),
                name=f"worker-{worker_id}",
            )
            session.tasks.append(task)

        return session_id

    async def stop_session(self, session_id: str):
        """Arrête tous les workers d'une session."""
        session = self._sessions.get(session_id)
        if not session:
            return

        logger.info(f"session {session_id}: stopping {len(session.tasks)} workers...")
        session.stopped = True

        for task in session.tasks:
            if not task.done():
                task.cancel()

        await asyncio.gather(*session.tasks, return_exceptions=True)

        for w_id in list(session.workers.keys()):
            if w_id in self._workers:
                self._workers[w_id].status = WorkerStatus.DONE
                del self._workers[w_id]

        del self._sessions[session_id]
        logger.info(f"session {session_id}: stopped")

    async def stop_all(self):
        """Arrête toutes les sessions."""
        for session_id in list(self._sessions.keys()):
            await self.stop_session(session_id)

    # ── Worker lifecycle ─────────────────────────────────────────────────────

    async def _run_worker(self, session: Session, state: WorkerState):
        """
        Boucle principale d'un worker :
        1. Acquiert le sémaphore (limite la concurrence)
        2. Lance un Chrome instance
        3. Navigue vers l'URL cible
        4. Exécute les actions configurées
        5. Enregistre le résultat
        6. Ferme le browser
        7. Répète si session.config.repeat == True
        """
        async with self._semaphore:
            self._active_browser_count += 1
            try:
                await self._worker_loop(session, state)
            finally:
                self._active_browser_count -= 1
                state.status = WorkerStatus.DONE

    async def _worker_loop(self, session: Session, state: WorkerState):
        """Boucle interne du worker."""
        config = session.config
        first_run = True

        while not session.stopped:
            if not first_run and not config.repeat:
                break
            first_run = False

            state.status = WorkerStatus.RUNNING
            t0 = time.time()

            # ── Choisir un proxy ──────────────────────────────────────────
            proxy_entry = None
            proxy_url = None
            if config.use_proxies:
                proxy_entry = proxy_pool.next_live()
                if proxy_entry:
                    proxy_url = proxy_entry.url
                    state.proxy_used = proxy_entry.hostport

            driver = ChromeDriver(
                proxy=proxy_url,
                load_images=config.load_images,
                headless=config.headless,
                user_agent=random_ua(),
            )

            status_code = 0
            error_msg: Optional[str] = None
            action_desc = ""

            try:
                await driver.start()
                tab = await driver.new_page(config.url)

                state.current_url = config.url
                # Essayer d'obtenir le status code via JavaScript
                try:
                    status_code = 200  # nodriver ne donne pas le status HTTP directement
                    # On peut vérifier si la page a chargé
                    title = await tab.evaluate("document.title")
                    if title is not None:
                        status_code = 200
                except Exception:
                    status_code = 0

                # ── Resolver auto Cloudflare / captcha ──────────────────────
                captcha_note = ""
                if config.solve_captcha:
                    try:
                        from app.core.captcha import solve_challenge
                        cap = await solve_challenge(tab, timeout_s=15)
                        if cap.get("found"):
                            if cap.get("solved"):
                                captcha_note = f"captcha {cap.get('kind')} auto-résolu ({cap.get('method')})"
                            else:
                                captcha_note = f"captcha {cap.get('kind')} persistant"
                            logger.debug(f"worker {state.id}: {captcha_note}")
                    except Exception as e:
                        logger.debug(f"worker {state.id}: captcha solver skipped: {e}")

                # ── Exécuter les actions ──────────────────────────────────
                if config.actions:
                    results = await execute_actions(tab, config.actions)
                    ok_actions = sum(1 for r in results if r.success)
                    action_desc = f"{ok_actions}/{len(results)} actions ok"
                    if captcha_note:
                        action_desc += f" · {captcha_note}"
                    state.action_description = action_desc

                    # Compter les erreurs d'action
                    action_errors = len(results) - ok_actions
                    if action_errors > 0:
                        session.total_errors += action_errors
                else:
                    action_desc = "page load only"
                    if captcha_note:
                        action_desc += f" · {captcha_note}"
                    state.action_description = action_desc

                ms = (time.time() - t0) * 1000
                state.record_request()
                state.last_status_code = status_code

                session.total_requests += 1
                session.total_ok += 1

                if proxy_entry:
                    proxy_pool.report_success(proxy_entry)

                # ── Log entry ─────────────────────────────────────────────
                self._log_counter += 1
                log = LogEntry(
                    id=self._log_counter,
                    worker_id=state.id,
                    session_id=session.id,
                    status_code=status_code,
                    ms=round(ms, 1),
                    url=config.url,
                    proxy=state.proxy_used,
                    action=action_desc,
                    error=None,
                    timestamp=int(time.time() * 1000),
                )
                self._logs.appendleft(log)
                await self._notify_callbacks("new_log", log)

            except asyncio.CancelledError:
                state.status = WorkerStatus.STOPPING
                raise

            except Exception as e:
                ms = (time.time() - t0) * 1000
                error_msg = str(e)[:120]
                state.errors += 1
                session.total_errors += 1
                session.total_requests += 1

                if proxy_entry:
                    proxy_pool.report_failure(proxy_entry)

                self._log_counter += 1
                log = LogEntry(
                    id=self._log_counter,
                    worker_id=state.id,
                    session_id=session.id,
                    status_code=0,
                    ms=round(ms, 1),
                    url=config.url,
                    proxy=state.proxy_used,
                    action=action_desc,
                    error=error_msg,
                    timestamp=int(time.time() * 1000),
                )
                self._logs.appendleft(log)
                await self._notify_callbacks("new_log", log)
                logger.debug(f"worker {state.id}: error: {error_msg}")

            finally:
                await driver.close()

            # ── Think time ────────────────────────────────────────────────
            if config.think_time_ms > 0 and not session.stopped:
                await asyncio.sleep(config.think_time_ms / 1000)

    # ── Callbacks / notifications ────────────────────────────────────────────

    def add_callback(self, cb: Callable):
        self._callbacks.append(cb)

    def remove_callback(self, cb: Callable):
        if cb in self._callbacks:
            self._callbacks.remove(cb)

    async def _notify_callbacks(self, event: str, data: Any):
        for cb in self._callbacks:
            try:
                await cb(event, data)
            except Exception as e:
                logger.debug(f"callback error: {e}")

    # ── Stats ────────────────────────────────────────────────────────────────

    def get_global_stats(self) -> dict:
        total_req = sum(s.total_requests for s in self._sessions.values())
        total_ok = sum(s.total_ok for s in self._sessions.values())
        total_err = sum(s.total_errors for s in self._sessions.values())
        rps = sum(w.rps for w in self._workers.values())
        active = sum(1 for w in self._workers.values() if w.status == WorkerStatus.RUNNING)

        return {
            "total_requests": total_req,
            "ok": total_ok,
            "errors": total_err,
            "success_rate": round(total_ok / max(1, total_req) * 100, 2),
            "rps": round(rps, 2),
            "workers_active": active,
            "workers_total": len(self._workers),
            "sessions": len(self._sessions),
            "browsers_open": self._active_browser_count,
            "proxy_live": proxy_pool.live_count,
        }

    def get_workers_list(self) -> List[dict]:
        return [w.to_dict() for w in self._workers.values()]

    def get_logs(self, limit: int = 50) -> List[dict]:
        return [
            {
                "id": l.id,
                "worker_id": l.worker_id,
                "session_id": l.session_id,
                "status_code": l.status_code,
                "ms": l.ms,
                "url": l.url,
                "proxy": l.proxy,
                "action": l.action,
                "error": l.error,
                "timestamp": l.timestamp,
            }
            for l in list(self._logs)[:limit]
        ]

    def get_sessions(self) -> List[dict]:
        return [s.stats() for s in self._sessions.values()]

    def has_active_session(self) -> bool:
        return len(self._sessions) > 0


# Singleton global
worker_pool = WorkerPool(max_workers=settings.MAX_WORKERS)
