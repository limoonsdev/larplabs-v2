"""
LarpLabs V2 - LarpBot Officiel (MCP presets via Groq).
L'utilisateur decrit une chaine / plateforme / objectif, le bot repond
et construit le workflow : il renvoie un bloc ```preset-json que le
backend valide (pydantic), sauvegarde en bibliotheque et retourne au panel.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from app.api.auth import require_user
from app.core import db
from app.core.ai import groq_chat, is_configured
from app.workers.actions import Action

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/larpbot", tags=["LarpLabsV2-LarpBot"])

SYSTEM = """Tu es LarpBot Officiel, l'assistant de LarpLabs V2 (moteur de workers Chrome ultra-legers).
Tu aides l'utilisateur a creer des workflows de visite : il decrit une chaine, une video, une plateforme ou un objectif, et tu construis le preset parfait.

Regles :
- Reponds en francais, court et concret.
- Pose UNE question de clarification si l'URL ou la plateforme manque vraiment.
- Quand tu as assez d'infos, produis le preset dans un bloc ```preset-json ... ``` (JSON valide uniquement).
- Schema du preset : {"name": str, "platform": str, "url": str (https://...), "num_workers": int 1-1500, "think_time_ms": int 0-30000, "use_proxies": bool, "repeat": bool, "solve_captcha": bool, "actions": [...]}
- Actions valides (type + champs) : click {selector?, x?, y?, count 1-5000, delay_ms}, type_text {selector?, value, delay_ms}, key_press {value: Enter/Tab/Escape/F5...}, scroll {value: up/down/top/bottom ou pixels, count, delay_ms}, wait {delay_ms}, hover {selector}, screenshot {}, navigate {value: url}, back {}, refresh {}, select {selector, value}, clear {selector}.
- Adapte les workers au plan gratuit Starter (<=50) sauf si l'utilisateur a Pro/Max : youtube/twitch/kick = sessions longues (wait 15000 + repeat true), tiktok/instagram/x = scroll x5-6 + likes, seo = type_text + key_press Enter.
- Jamais de selecteur farfelu : utilise des selecteurs generiques plausibles (boutons play, liens, zones de scroll).
- Si l'utilisateur discute sans demander de preset, reponds normalement SANS bloc preset-json.
"""

PRESET_RE = re.compile(r"```preset-json\s*(\{.*?\})\s*```", re.DOTALL)


class ChatMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=4000)


class ChatBody(BaseModel):
    messages: List[ChatMessage] = Field(min_length=1, max_length=20)


class PresetSpec(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    platform: str = Field(default="custom", max_length=40)
    url: str = Field(default="https://example.com", max_length=500)
    num_workers: int = Field(default=50, ge=1, le=1500)
    think_time_ms: int = Field(default=2000, ge=0, le=30000)
    use_proxies: bool = True
    repeat: bool = True
    solve_captcha: bool = True
    actions: List[Action] = Field(default_factory=list, max_length=30)

    @field_validator("url")
    @classmethod
    def _url_http(cls, v: str) -> str:
        v = v.strip()
        if not (v.startswith("http://") or v.startswith("https://")):
            v = "https://" + v.lstrip("/")
        return v


def _extract_preset(text: str) -> Optional[Dict[str, Any]]:
    m = PRESET_RE.search(text or "")
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except Exception:
        return None


@router.post("/chat", summary="Parler au LarpBot (construit des presets)")
async def chat(body: ChatBody, request: Request) -> Dict:
    user = require_user(request)
    if not is_configured():
        raise HTTPException(
            status_code=503,
            detail="IA non configurée (GROQ_API_KEY manquante côté serveur).",
        )
    history = [{"role": m.role, "content": m.content} for m in body.messages[-10:]]
    try:
        reply = await groq_chat(
            [{"role": "system", "content": SYSTEM}, *history],
            temperature=0.4,
            max_tokens=1200,
        )
    except Exception as e:
        logger.warning(f"larpbot: groq error: {e}")
        raise HTTPException(status_code=502, detail=f"IA indisponible : {e}")
    if not reply:
        raise HTTPException(status_code=502, detail="IA sans réponse, réessaie.")

    preset: Optional[Dict[str, Any]] = None
    raw = _extract_preset(reply)
    if raw is not None:
        try:
            spec = PresetSpec(**raw)
            data = spec.model_dump()
            data["actions"] = [a.model_dump(exclude_none=True) for a in spec.actions]
            saved = db.save_preset(user["email"], data)
            preset = {"id": saved["id"], **data}
            reply = PRESET_RE.sub("", reply).strip()
            reply += f"\n\n✅ Preset « {spec.name} » construit et ajouté à ta bibliothèque."
        except Exception as e:
            logger.debug(f"larpbot: preset invalide: {e}")
            reply += "\n\n⚠️ Mon preset était malformé, précise l'URL exacte et je le reconstruis."

    return {"ok": True, "reply": reply, "preset": preset}


@router.get("/status", summary="Etat du LarpBot")
async def bot_status() -> Dict:
    from app.core.ai import get_model

    return {"ok": True, "ai": is_configured(), "model": get_model()}
