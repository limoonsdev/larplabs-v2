"""
LarpLabs V2 - Auth (SQLite), plans, bibliotheque de presets.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.core import db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["LarpLabsV2-Auth"])

# Workers max par plan (Starter = free)
PLAN_LIMITS: Dict[str, int] = {"starter": 50, "pro": 500, "max": 1500}

PLANS: List[Dict[str, Any]] = [
    {"id": "starter", "name": "Starter", "price": "0€", "workers": 50, "free": True},
    {"id": "pro", "name": "Pro", "price": "29€", "workers": 500, "free": False},
    {"id": "max", "name": "Max", "price": "99€", "workers": 1500, "free": False},
]

EMAIL_RE = re.compile(r"^\S+@\S+\.\S+$")


class RegisterBody(BaseModel):
    email: str
    password: str = Field(min_length=4, max_length=128)


class PresetBody(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    platform: str = Field(default="custom", max_length=40)
    url: str = Field(default="", max_length=500)
    num_workers: int = Field(default=50, ge=1, le=1500)
    think_time_ms: int = Field(default=2000, ge=0, le=30000)
    use_proxies: bool = True
    repeat: bool = True
    solve_captcha: bool = True
    actions: List[Dict[str, Any]] = Field(default_factory=list)


def _bearer(request: Request) -> Optional[str]:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip() or None
    return None


def require_user(request: Request) -> Dict[str, Any]:
    """Dependance : 401 si pas de token valide."""
    user = db.get_user_by_token(_bearer(request))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Connexion requise. Connecte-toi pour accéder au panel.",
        )
    return user


def optional_user(request: Request) -> Optional[Dict[str, Any]]:
    return db.get_user_by_token(_bearer(request))


# ── Auth ───────────────────────────────────────────────────────────────────

@router.post("/auth/register", summary="Créer un compte (plan Starter free)")
async def register(body: RegisterBody) -> Dict:
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Email invalide.")
    try:
        user = db.register_user(email, body.password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    token = db.create_token(user["email"])
    return {"ok": True, "token": token, "user": user}


@router.post("/auth/login", summary="Se connecter")
async def login(body: RegisterBody) -> Dict:
    try:
        user = db.verify_user(body.email, body.password)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    token = db.create_token(user["email"])
    return {"ok": True, "token": token, "user": user}


@router.get("/auth/me", summary="Session courante")
async def me(request: Request) -> Dict:
    user = require_user(request)
    return {"ok": True, "user": user}


@router.post("/auth/logout", summary="Se déconnecter")
async def logout(request: Request) -> Dict:
    db.delete_token(_bearer(request))
    return {"ok": True}


@router.get("/plans", summary="Plans et quotas")
async def plans() -> Dict:
    return {"ok": True, "plans": PLANS, "limits": PLAN_LIMITS}


# ── Bibliothèque de presets ──────────────────────────────────────────────

@router.get("/presets/library", summary="Mes presets sauvegardés")
async def library_list(request: Request) -> Dict:
    user = require_user(request)
    return {"ok": True, "presets": db.list_presets(user["email"])}


@router.post("/presets/library", summary="Sauvegarder un preset")
async def library_save(body: PresetBody, request: Request) -> Dict:
    user = require_user(request)
    saved = db.save_preset(user["email"], body.model_dump())
    return {"ok": True, "preset": saved}


@router.delete("/presets/library/{pid}", summary="Supprimer un preset")
async def library_delete(pid: str, request: Request) -> Dict:
    user = require_user(request)
    if not db.delete_preset(user["email"], pid):
        raise HTTPException(status_code=404, detail="Preset introuvable.")
    return {"ok": True, "deleted": pid}
