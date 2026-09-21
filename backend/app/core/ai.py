"""
LarpLabs V2 - Helper Groq (IA).
Modele unique configure via GROQ_MODEL (defaut qwen3-32b).
Cle via GROQ_API_KEY (jamais commitee, cf. .env.example).
"""
import logging
import os

logger = logging.getLogger(__name__)

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"


def get_model() -> str:
    return os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")


def is_configured() -> bool:
    return bool(os.getenv("GROQ_API_KEY"))


async def groq_chat(
    messages: list,
    temperature: float = 0.4,
    max_tokens: int = 1200,
) -> str:
    """Appel chat-completions OpenAI-compatible. Leve RuntimeError si pas de cle."""
    key = os.getenv("GROQ_API_KEY")
    if not key:
        raise RuntimeError("GROQ_API_KEY manquante (voir backend/.env.example)")
    import httpx

    # User-Agent navigateur : le WAF Cloudflare de Groq bloque les UA Python
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
        "Accept": "application/json",
    }
    async with httpx.AsyncClient(timeout=60.0, headers=headers) as client:
        resp = await client.post(
            GROQ_API_URL,
            json={
                "model": get_model(),
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
        )
        resp.raise_for_status()
        data = resp.json()
    try:
        return (data["choices"][0]["message"]["content"] or "").strip()
    except Exception:
        return ""
