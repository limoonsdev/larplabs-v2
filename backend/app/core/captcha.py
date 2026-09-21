"""
LarpLabs V2 - Captcha / Cloudflare auto-resolver + OCR.

Strategie (100% best-effort, ne leve jamais d'exception) :
1. Detection : titre "Just a moment", iframes Cloudflare Turnstile,
   widgets reCAPTCHA / hCaptcha / image-captcha classiques.
2. Turnstile / Cloudflare : clic sur la checkbox (meme origine ou
   conteneur), puis boucle d'attente jusqu'a disparition du challenge.
   Cloudflare se valide souvent tout seul en headless patient.
3. Image-captcha + OCR : si `pillow` + `pytesseract` sont installes
   (optionnel) + binaire tesseract present, OCR d'un screenshot PNG
   et saisie auto dans le champ. Sinon : attente + reload doux.
   Installation OCR (optionnel) : pip install pillow pytesseract
   + binaire tesseract (apt/brew/choco).

Utilisation :
    from app.core.captcha import solve_challenge
    result = await solve_challenge(tab, timeout_s=20)
"""
import asyncio
import io
import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


CLOUDFLARE_TITLE_HINTS = (
    "just a moment",
    "attention required",
    "verifying you are human",
    "verification en cours",
    "un instant",
)

TURNSTILE_JS = r"""
(function() {
  var out = {found: false, kind: null};
  try {
    var title = (document.title || '').toLowerCase();
    var hints = ['just a moment', 'attention required', 'verifying you are human'];
    for (var i = 0; i < hints.length; i++) {
      if (title.indexOf(hints[i]) !== -1) { out.found = true; out.kind = 'cloudflare'; break; }
    }
    if (document.querySelector('iframe[src*="challenges.cloudflare.com"]')) {
      out.found = true; out.kind = out.kind || 'turnstile';
    }
    if (document.querySelector('.cf-turnstile, #cf-turnstile, [data-sitekey]')) {
      out.found = true; out.kind = out.kind || 'turnstile';
    }
    if (document.querySelector('#challenge-running, #cf-content, .cf-challenge')) {
      out.found = true; out.kind = out.kind || 'cloudflare';
    }
    if (document.querySelector('iframe[src*="recaptcha"], .g-recaptcha')) {
      out.found = true; out.kind = out.kind || 'recaptcha';
    }
    if (document.querySelector('iframe[src*="hcaptcha"], .h-captcha')) {
      out.found = true; out.kind = out.kind || 'hcaptcha';
    }
    var imgs = document.querySelectorAll('img');
    for (var j = 0; j < imgs.length; j++) {
      var s = ((imgs[j].src || '') + ' ' + (imgs[j].alt || '')).toLowerCase();
      if (s.indexOf('captcha') !== -1) { out.found = true; out.kind = out.kind || 'image-captcha'; break; }
    }
    var inputs = document.querySelectorAll('input');
    for (var k = 0; k < inputs.length; k++) {
      var t = (((inputs[k].name || '') + ' ' + (inputs[k].id || '') + ' ' + (inputs[k].placeholder || '')).toLowerCase());
      if (t.indexOf('captcha') !== -1) { out.found = true; out.kind = out.kind || 'image-captcha'; break; }
    }
  } catch (e) {}
  return out;
})()
"""

CLICK_JS = r"""
(function() {
  var clicked = [];
  try {
    var sels = ['.cf-turnstile', '#cf-turnstile', '.cb-lb input[type="checkbox"]',
                 'input[type="checkbox"][name*="captcha"]', '#captcha-box input'];
    for (var i = 0; i < sels.length; i++) {
      var els = document.querySelectorAll(sels[i]);
      for (var j = 0; j < els.length; j++) {
        try {
          var r = els[j].getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            els[j].click();
            clicked.push(sels[i]);
          }
        } catch (e) {}
      }
    }
    // Case Turnstile : simule Tab + Espace si un élément focusable existe
    var f = document.querySelector('.cf-turnstile iframe');
    if (f) { try { f.focus(); } catch (e) {} }
  } catch (e) {}
  return clicked;
})()
"""


async def _eval(tab: Any, js: str) -> Any:
    try:
        return await tab.evaluate(js)
    except Exception:
        return None


async def detect_challenge(tab: Any) -> Optional[str]:
    """Retourne le type de challenge ou None. Ne leve jamais."""
    try:
        res = await _eval(tab, TURNSTILE_JS)
        if isinstance(res, dict) and res.get("found"):
            return str(res.get("kind") or "unknown")
    except Exception as e:
        logger.debug(f"captcha: detect error: {e}")
    return None


def ocr_available() -> bool:
    """True si pillow + pytesseract importables (OCR optionnel)."""
    try:
        import PIL  # noqa: F401
        import pytesseract  # noqa: F401
        return True
    except Exception:
        return False


def ocr_image_bytes(img_bytes: bytes, lang: str = "eng") -> Optional[str]:
    """
    OCR best-effort sur des bytes PNG/JPEG. Retourne le texte nettoye ou None.
    Requiert pillow + pytesseract + binaire tesseract (sinon None).
    """
    try:
        from PIL import Image
        import pytesseract
    except Exception:
        return None
    try:
        img = Image.open(io.BytesIO(img_bytes)).convert("L")
        w, h = img.size
        if w < 200:
            img = img.resize((w * 3, h * 3))
        # Seuil simple pour captcha contraste
        img = img.point(lambda p: 255 if p > 150 else 0)
        text = pytesseract.image_to_string(img, lang=lang, config="--psm 8")
        clean = "".join(ch for ch in (text or "").strip() if ch.isalnum())
        return clean or None
    except Exception as e:
        logger.debug(f"captcha: ocr error: {e}")
        return None


async def _screenshot_bytes(tab: Any) -> Optional[bytes]:
    """Screenshot page best-effort (API nodriver variable selon version)."""
    for attr in ("save_screenshot", "screenshot", "get_screenshot"):
        try:
            fn = getattr(tab, attr, None)
            if fn is None:
                continue
            if attr == "save_screenshot":
                import tempfile, os
                path = os.path.join(tempfile.gettempdir(), "larp_captcha.png")
                res = fn(path)
                if asyncio.iscoroutine(res):
                    res = await res
                with open(res if isinstance(res, str) else path, "rb") as f:
                    return f.read()
            else:
                res = fn()
                if asyncio.iscoroutine(res):
                    res = await res
                if isinstance(res, (bytes, bytearray)):
                    return bytes(res)
        except Exception:
            continue
    return None


async def _try_ocr_fill(tab: Any) -> bool:
    """Tente OCR + saisie auto dans un champ captcha. Retourne True si saisi."""
    shot = await _screenshot_bytes(tab)
    if not shot:
        return False
    text = ocr_image_bytes(shot)
    if not text or len(text) < 3:
        return False
    fill_js = (
        "(function(t){"
        "var sels=['input[name*=\"captcha\" i]','input[id*=\"captcha\" i]',"
        "'input[placeholder*=\"captcha\" i]','#captcha-input','.captcha-input'];"
        "for(var i=0;i<sels.length;i++){try{var el=document.querySelector(sels[i]);"
        "if(el){el.focus();el.value=t;"
        "el.dispatchEvent(new Event('input',{bubbles:true}));"
        "el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));"
        "return true;}}catch(e){}}return false;})(" + repr(text) + ")"
    )
    try:
        return bool(await _eval(tab, fill_js))
    except Exception:
        return False


async def ai_suggest(kind: str, title: str, url: str) -> Optional[Dict]:
    """
    Demande a l'IA (Groq) la prochaine action contre un challenge persistant.
    Retourne {"action": "click"|"wait"|"reload", "selector"?, "wait_s"?} ou None.
    Best-effort : None si IA non configuree ou erreur.
    """
    try:
        from app.core.ai import groq_chat, is_configured
        if not is_configured():
            return None
        import json

        prompt = (
            "Tu es un expert anti-bot. Un navigateur automatise est bloque par un challenge.\n"
            f"Type detecte : {kind}\nTitre de page : {title[:120]}\nURL : {url[:200]}\n\n"
            "Reponds UNIQUEMENT avec un JSON valide, sans markdown, parmi :\n"
            '{"action":"click","selector":"selecteur CSS probable du bouton/checkbox"}\n'
            '{"action":"wait","wait_s":8}\n'
            '{"action":"reload"}\n'
            "Pour cloudflare/turnstile : click sur .cf-turnstile ou wait. "
            "Pour recaptcha/hcaptcha : wait (l'OCR a deja echoue)."
        )
        raw = await groq_chat(
            [{"role": "user", "content": prompt}], temperature=0.2, max_tokens=150
        )
        start, end = raw.find("{"), raw.rfind("}")
        if start < 0 or end <= start:
            return None
        data = json.loads(raw[start:end + 1])
        if data.get("action") not in ("click", "wait", "reload"):
            return None
        return data
    except Exception as e:
        logger.debug(f"captcha: ai_suggest error: {e}")
        return None


async def _page_info(tab: Any) -> Dict[str, str]:
    try:
        title = await _eval(tab, "document.title") or ""
        url = await _eval(tab, "location.href") or ""
        return {"title": str(title), "url": str(url)}
    except Exception:
        return {"title": "", "url": ""}


async def solve_challenge(tab: Any, timeout_s: int = 20) -> Dict:
    """
    Boucle de resolution auto. Retourne un dict :
    {"found": bool, "kind": str|None, "solved": bool, "method": str, "ocr": bool}
    Ne leve jamais d'exception.
    """
    out: Dict = {"found": False, "kind": None, "solved": True, "method": "none", "ocr": ocr_available()}
    try:
        kind = await detect_challenge(tab)
        if not kind:
            return out
        out.update({"found": True, "kind": kind, "solved": False, "method": "wait"})

        # 1) Tentative de clic checkbox / widget
        try:
            clicked = await _eval(tab, CLICK_JS)
            if clicked:
                out["method"] = "click+wait"
        except Exception:
            pass

        # 2) Boucle d'attente : le challenge se dissipe souvent seul
        poll = 2.0
        elapsed = 0.0
        while elapsed < timeout_s:
            await asyncio.sleep(poll)
            elapsed += poll
            # Re-clic doux a mi-parcours (Turnstile parfois capricieux)
            if elapsed >= timeout_s / 2 and out["method"] == "click+wait":
                try:
                    await _eval(tab, CLICK_JS)
                except Exception:
                    pass
            if not await detect_challenge(tab):
                out.update({"solved": True})
                return out

        # 3) Dernier recours image-captcha + OCR
        if kind in ("image-captcha", "recaptcha", "hcaptcha"):
            try:
                if await _try_ocr_fill(tab):
                    out["method"] = "ocr+fill"
                    await asyncio.sleep(3.0)
                    if not await detect_challenge(tab):
                        out.update({"solved": True})
                        return out
            except Exception as e:
                logger.debug(f"captcha: ocr-fill error: {e}")

        # 3b) Assistance IA (Groq) si challenge persistant
        try:
            from app.core.ai import is_configured
            if is_configured():
                info = await _page_info(tab)
                sug = await ai_suggest(kind, info["title"], info["url"])
                if sug:
                    out["method"] = out["method"] + "+ai"
                    act = sug.get("action")
                    if act == "click" and sug.get("selector"):
                        sel = str(sug["selector"])[:200].replace("`", "")
                        await _eval(
                            tab,
                            f"(function(){{try{{var el=document.querySelector({repr(sel)});"
                            "if(el){el.click();return true;}}catch(e){}return false;}})()",
                        )
                        await asyncio.sleep(4.0)
                    elif act == "wait":
                        await asyncio.sleep(min(15.0, float(sug.get("wait_s", 8))))
                    elif act == "reload":
                        await _eval(tab, "location.reload()")
                        await asyncio.sleep(4.0)
                    if not await detect_challenge(tab):
                        out.update({"solved": True})
                        return out
        except Exception as e:
            logger.debug(f"captcha: ai-assist error: {e}")

        # 4) Reload doux : certains challenges passent au 2e chargement
        try:
            await _eval(tab, "location.reload()")
            await asyncio.sleep(4.0)
            if not await detect_challenge(tab):
                out.update({"solved": True, "method": out["method"] + "+reload"})
        except Exception:
            pass
        return out
    except Exception as e:
        logger.debug(f"captcha: solve error: {e}")
        return out


async def captcha_status() -> Dict:
    """Etat du resolver pour l'API / le panel."""
    try:
        from app.core.ai import get_model, is_configured
        ai, model = is_configured(), get_model()
    except Exception:
        ai, model = False, None
    return {
        "resolver": True,
        "ocr": ocr_available(),
        "ai": ai,
        "model": model,
        "handles": ["cloudflare", "turnstile", "recaptcha", "hcaptcha", "image-captcha"],
    }
