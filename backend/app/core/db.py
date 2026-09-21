"""
LarpLabs V2 - Mini base SQLite (stdlib, sans dependance).
Tables : users (email, plan), tokens (sessions), presets (bibliotheque).
Fichier : backend/data/larplabs.db (volume Docker pour persistance VPS).
"""
import hashlib
import logging
import os
import secrets
import sqlite3
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

DB_PATH = os.getenv(
    "LARPLABS_DB",
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "larplabs.db"),
)

TOKEN_TTL_SECONDS = 30 * 24 * 3600  # 30 jours


def _connect() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS users (
                email TEXT PRIMARY KEY,
                password_hash TEXT NOT NULL,
                plan TEXT NOT NULL DEFAULT 'starter',
                created_at INTEGER NOT NULL,
                last_login INTEGER
            )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS tokens (
                token_hash TEXT PRIMARY KEY,
                email TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL
            )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS presets (
                id TEXT PRIMARY KEY,
                owner_email TEXT NOT NULL,
                name TEXT NOT NULL,
                platform TEXT NOT NULL DEFAULT 'custom',
                url TEXT NOT NULL,
                num_workers INTEGER NOT NULL DEFAULT 50,
                think_time_ms INTEGER NOT NULL DEFAULT 2000,
                use_proxies INTEGER NOT NULL DEFAULT 1,
                repeat INTEGER NOT NULL DEFAULT 1,
                solve_captcha INTEGER NOT NULL DEFAULT 1,
                actions_json TEXT NOT NULL DEFAULT '[]',
                uses INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL
            )"""
        )
        conn.commit()
    logger.info(f"db: ready ({DB_PATH})")


def _hash_password(password: str, salt: Optional[str] = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000).hex()
    return f"{salt}${digest}"


def _verify_password(password: str, stored: str) -> bool:
    try:
        salt, _ = stored.split("$", 1)
        return secrets.compare_digest(_hash_password(password, salt), stored)
    except Exception:
        return False


def register_user(email: str, password: str) -> Dict[str, Any]:
    email = email.strip().lower()
    now = int(time.time())
    with _connect() as conn:
        row = conn.execute("SELECT email FROM users WHERE email=?", (email,)).fetchone()
        if row:
            raise ValueError("Un compte existe déjà avec cet email.")
        conn.execute(
            "INSERT INTO users (email, password_hash, plan, created_at, last_login) VALUES (?,?,?,?,?)",
            (email, _hash_password(password), "starter", now, now),
        )
        conn.commit()
    return {"email": email, "plan": "starter"}


def verify_user(email: str, password: str) -> Dict[str, Any]:
    email = email.strip().lower()
    with _connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        if not row or not _verify_password(password, row["password_hash"]):
            raise ValueError("Email ou mot de passe incorrect.")
        conn.execute("UPDATE users SET last_login=? WHERE email=?", (int(time.time()), email))
        conn.commit()
        return {"email": row["email"], "plan": row["plan"]}


def create_token(email: str) -> str:
    token = secrets.token_urlsafe(32)
    thash = hashlib.sha256(token.encode()).hexdigest()
    now = int(time.time())
    with _connect() as conn:
        conn.execute(
            "INSERT INTO tokens (token_hash, email, created_at, expires_at) VALUES (?,?,?,?)",
            (thash, email, now, now + TOKEN_TTL_SECONDS),
        )
        conn.commit()
    return token


def get_user_by_token(token: Optional[str]) -> Optional[Dict[str, Any]]:
    if not token:
        return None
    thash = hashlib.sha256(token.encode()).hexdigest()
    with _connect() as conn:
        row = conn.execute(
            """SELECT u.email AS email, u.plan AS plan, t.expires_at AS expires_at
               FROM tokens t JOIN users u ON u.email = t.email
               WHERE t.token_hash=?""",
            (thash,),
        ).fetchone()
        if not row:
            return None
        if row["expires_at"] < int(time.time()):
            conn.execute("DELETE FROM tokens WHERE token_hash=?", (thash,))
            conn.commit()
            return None
        return {"email": row["email"], "plan": row["plan"]}


def delete_token(token: Optional[str]) -> None:
    if not token:
        return
    thash = hashlib.sha256(token.encode()).hexdigest()
    with _connect() as conn:
        conn.execute("DELETE FROM tokens WHERE token_hash=?", (thash,))
        conn.commit()


def save_preset(owner: str, spec: Dict[str, Any]) -> Dict[str, Any]:
    import json

    pid = "p-" + secrets.token_hex(6)
    now = int(time.time())
    with _connect() as conn:
        conn.execute(
            """INSERT INTO presets
               (id, owner_email, name, platform, url, num_workers, think_time_ms,
                use_proxies, repeat, solve_captcha, actions_json, uses, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                pid, owner, spec.get("name", "Sans nom"), spec.get("platform", "custom"),
                spec.get("url", ""), int(spec.get("num_workers", 50)),
                int(spec.get("think_time_ms", 2000)),
                1 if spec.get("use_proxies", True) else 0,
                1 if spec.get("repeat", True) else 0,
                1 if spec.get("solve_captcha", True) else 0,
                json.dumps(spec.get("actions", [])),
                0, now,
            ),
        )
        conn.commit()
    return {"id": pid, **spec}


def list_presets(owner: str) -> List[Dict[str, Any]]:
    import json

    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM presets WHERE owner_email=? ORDER BY created_at DESC", (owner,)
        ).fetchall()
    out = []
    for r in rows:
        try:
            actions = json.loads(r["actions_json"] or "[]")
        except Exception:
            actions = []
        out.append({
            "id": r["id"], "name": r["name"], "platform": r["platform"], "url": r["url"],
            "num_workers": r["num_workers"], "think_time_ms": r["think_time_ms"],
            "use_proxies": bool(r["use_proxies"]), "repeat": bool(r["repeat"]),
            "solve_captcha": bool(r["solve_captcha"]), "actions": actions,
            "uses": r["uses"], "created_at": r["created_at"],
        })
    return out


def delete_preset(owner: str, pid: str) -> bool:
    with _connect() as conn:
        cur = conn.execute("DELETE FROM presets WHERE id=? AND owner_email=?", (pid, owner))
        conn.commit()
        return cur.rowcount > 0


def bump_preset_uses(owner: str, pid: str) -> None:
    with _connect() as conn:
        conn.execute(
            "UPDATE presets SET uses = uses + 1 WHERE id=? AND owner_email=?", (pid, owner)
        )
        conn.commit()
