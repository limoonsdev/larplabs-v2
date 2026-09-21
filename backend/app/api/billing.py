"""
LarpLabs V2 - Billing LarpPay Services.
Checkout fictif cote front : le navigateur ne transmet JAMAIS le PAN,
uniquement last4 + reseau + titulaire. Le plan est active en DB.
"""
from __future__ import annotations

import asyncio
import logging
import re
import secrets
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.api.auth import PLAN_LIMITS, PLANS, require_user
from app.core import db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/billing", tags=["LarpLabsV2-Billing"])

BRANDS = ("visa", "mastercard", "amex", "cb")


class CheckoutBody(BaseModel):
    plan: str = Field(pattern="^(pro|max|starter)$")
    last4: str = Field(default="", max_length=4)
    brand: str = Field(default="", max_length=16)
    cardholder: str = Field(default="", max_length=80)


@router.post("/checkout", summary="Payer via LarpPay Services (active le plan)")
async def checkout(body: CheckoutBody, request: Request) -> Dict:
    user = require_user(request)
    plan = body.plan

    if plan == "starter":
        sub = db.set_plan(user["email"], "starter")
        return {
            "ok": True, "plan": "starter", "provider": "LarpPay Services",
            "message": "Plan Starter gratuit activé.", "subscription": sub,
        }

    # Cartes : last4 + réseau obligatoires (le PAN ne transite jamais)
    if not re.fullmatch(r"\d{4}", body.last4 or ""):
        raise HTTPException(status_code=400, detail="Carte invalide (4 derniers chiffres requis).")
    brand = (body.brand or "").lower()
    if brand not in BRANDS:
        raise HTTPException(status_code=400, detail="Réseau carte non supporté (visa, mastercard, amex, cb).")

    # Traitement LarpPay (simulation passerelle, 1.2s)
    await asyncio.sleep(1.2)
    receipt = "LP-" + secrets.token_hex(5).upper()
    sub = db.set_plan(user["email"], plan, last4=body.last4, brand=brand)
    logger.info(f"billing: {user['email']} -> {plan} ({brand} ****{body.last4}) [{receipt}]")
    info = next((p for p in PLANS if p["id"] == plan), {"workers": 50})
    return {
        "ok": True,
        "plan": plan,
        "provider": "LarpPay Services",
        "receipt": receipt,
        "workers": info.get("workers"),
        "message": f"Plan {plan.title()} activé. Bienvenue !",
        "subscription": sub,
    }


@router.get("/subscription", summary="Abonnement courant")
async def subscription(request: Request) -> Dict:
    user = require_user(request)
    sub = db.get_subscription(user["email"])
    return {
        "ok": True,
        "provider": "LarpPay Services",
        "subscription": sub,
        "limits": PLAN_LIMITS,
    }
