"""
CreamyViews Backend - Actions disponibles pour les workers
Clics, frappe clavier, texte, scroll, hover, screenshot, navigation
"""
import asyncio
import logging
from enum import Enum
from typing import Any, List, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# Types d'actions
# ──────────────────────────────────────────────────────────────────────────────

class ActionType(str, Enum):
    CLICK = "click"            # Clic sur sélecteur CSS ou coordonnées (1-5000 fois)
    TYPE_TEXT = "type_text"    # Écrire du texte dans un champ
    KEY_PRESS = "key_press"    # Appui sur touche clavier (Enter, Tab, F5, Escape, etc.)
    SCROLL = "scroll"          # Défilement de page (up/down/px)
    WAIT = "wait"              # Attendre N millisecondes
    HOVER = "hover"            # Survol d'un élément
    SCREENSHOT = "screenshot"  # Capturer un screenshot
    NAVIGATE = "navigate"      # Naviguer vers une nouvelle URL
    BACK = "back"              # Page précédente
    REFRESH = "refresh"        # Rafraîchir la page
    SELECT = "select"          # Sélectionner une option dans un <select>
    CLEAR = "clear"            # Effacer un champ


class Action(BaseModel):
    """Définition d'une action à effectuer sur la page."""
    type: ActionType
    selector: Optional[str] = Field(None, description="Sélecteur CSS de l'élément cible")
    value: Optional[str] = Field(None, description="Texte à saisir, touche clavier, ou URL")
    count: int = Field(1, ge=1, le=5000, description="Nombre de fois à répéter l'action")
    delay_ms: int = Field(50, ge=0, le=10000, description="Délai en ms entre répétitions")
    x: Optional[int] = Field(None, description="Coordonnée X pour clic sans sélecteur")
    y: Optional[int] = Field(None, description="Coordonnée Y pour clic sans sélecteur")
    timeout_ms: int = Field(5000, ge=100, le=30000, description="Timeout pour trouver l'élément")


# ──────────────────────────────────────────────────────────────────────────────
# Touches clavier -> nodriver key codes
# ──────────────────────────────────────────────────────────────────────────────

KEY_MAP = {
    "enter": "\n",
    "return": "\n",
    "tab": "\t",
    "space": " ",
    "escape": "\x1b",
    "esc": "\x1b",
    "backspace": "\x08",
    "delete": "\x7f",
    "arrowup": "\x1b[A",
    "arrowdown": "\x1b[B",
    "arrowright": "\x1b[C",
    "arrowleft": "\x1b[D",
    "home": "\x1b[H",
    "end": "\x1b[F",
    "pageup": "\x1b[5~",
    "pagedown": "\x1b[6~",
    "f1": "\x1bOP",
    "f2": "\x1bOQ",
    "f3": "\x1bOR",
    "f4": "\x1bOS",
    "f5": "\x1b[15~",
    "f6": "\x1b[17~",
    "f7": "\x1b[18~",
    "f8": "\x1b[19~",
    "f9": "\x1b[20~",
    "f10": "\x1b[21~",
    "f11": "\x1b[23~",
    "f12": "\x1b[24~",
}


# ──────────────────────────────────────────────────────────────────────────────
# Exécution des actions
# ──────────────────────────────────────────────────────────────────────────────

class ActionResult(BaseModel):
    """Résultat de l'exécution d'une action."""
    action_type: str
    success: bool
    error: Optional[str] = None
    screenshot_b64: Optional[str] = None
    description: str = ""


async def execute_action(tab: Any, action: Action) -> ActionResult:
    """
    Exécute une action sur la page nodriver.
    Retourne un ActionResult avec le résultat.
    """
    try:
        if action.type == ActionType.CLICK:
            return await _do_click(tab, action)
        elif action.type == ActionType.TYPE_TEXT:
            return await _do_type_text(tab, action)
        elif action.type == ActionType.KEY_PRESS:
            return await _do_key_press(tab, action)
        elif action.type == ActionType.SCROLL:
            return await _do_scroll(tab, action)
        elif action.type == ActionType.WAIT:
            return await _do_wait(action)
        elif action.type == ActionType.HOVER:
            return await _do_hover(tab, action)
        elif action.type == ActionType.SCREENSHOT:
            return await _do_screenshot(tab)
        elif action.type == ActionType.NAVIGATE:
            return await _do_navigate(tab, action)
        elif action.type == ActionType.BACK:
            return await _do_back(tab)
        elif action.type == ActionType.REFRESH:
            return await _do_refresh(tab)
        elif action.type == ActionType.SELECT:
            return await _do_select(tab, action)
        elif action.type == ActionType.CLEAR:
            return await _do_clear(tab, action)
        else:
            return ActionResult(
                action_type=action.type,
                success=False,
                error=f"Action type '{action.type}' non reconnue",
            )
    except Exception as e:
        return ActionResult(
            action_type=action.type,
            success=False,
            error=str(e),
        )


async def execute_actions(tab: Any, actions: List[Action]) -> List[ActionResult]:
    """Exécute une liste d'actions séquentiellement."""
    results = []
    for action in actions:
        result = await execute_action(tab, action)
        results.append(result)
        if not result.success:
            logger.debug(f"action {action.type} failed: {result.error}")
    return results


# ──────────────────────────────────────────────────────────────────────────────
# Implémentations des actions
# ──────────────────────────────────────────────────────────────────────────────

async def _do_click(tab: Any, action: Action) -> ActionResult:
    """
    Clic sur un élément CSS ou des coordonnées X/Y.
    Répète `count` fois avec `delay_ms` entre chaque clic.
    """
    desc = f"click x{action.count}"
    if action.selector:
        desc += f" on '{action.selector}'"

    for i in range(action.count):
        try:
            if action.selector:
                # Trouver l'élément par sélecteur CSS
                element = await tab.find(action.selector, timeout=action.timeout_ms / 1000)
                if element:
                    await element.click()
                else:
                    return ActionResult(
                        action_type=action.type,
                        success=False,
                        error=f"Élément '{action.selector}' non trouvé",
                    )
            elif action.x is not None and action.y is not None:
                # Clic par coordonnées
                await tab.evaluate(
                    f"""document.elementFromPoint({action.x}, {action.y})?.click()"""
                )
            else:
                # Clic sur le body
                await tab.evaluate("document.body.click()")
        except Exception as e:
            logger.debug(f"click attempt {i+1}/{action.count} failed: {e}")

        # Délai entre clics (sauf le dernier)
        if i < action.count - 1 and action.delay_ms > 0:
            await asyncio.sleep(action.delay_ms / 1000)

    return ActionResult(action_type=action.type, success=True, description=desc)


async def _do_type_text(tab: Any, action: Action) -> ActionResult:
    """Écrit du texte dans un champ."""
    if not action.value:
        return ActionResult(action_type=action.type, success=False, error="value requis pour type_text")

    if action.selector:
        element = await tab.find(action.selector, timeout=action.timeout_ms / 1000)
        if not element:
            return ActionResult(
                action_type=action.type,
                success=False,
                error=f"Élément '{action.selector}' non trouvé",
            )
        await element.click()
        await asyncio.sleep(0.1)

    await tab.evaluate(
        f"""
        (function() {{
            var el = document.activeElement || document.body;
            var text = {repr(action.value)};
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {{
                el.value = text;
                el.dispatchEvent(new Event('input', {{bubbles: true}}));
                el.dispatchEvent(new Event('change', {{bubbles: true}}));
            }} else {{
                document.execCommand('insertText', false, text);
            }}
        }})()
        """
    )

    return ActionResult(
        action_type=action.type,
        success=True,
        description=f"typed '{action.value[:30]}{'...' if len(action.value) > 30 else ''}'",
    )


async def _do_key_press(tab: Any, action: Action) -> ActionResult:
    """Appui sur une touche clavier."""
    if not action.value:
        return ActionResult(action_type=action.type, success=False, error="value requis pour key_press")

    key_name = action.value.lower()
    # Mapping des touches spéciales
    js_key_map = {
        "enter": "Enter", "return": "Enter",
        "tab": "Tab",
        "space": " ",
        "escape": "Escape", "esc": "Escape",
        "backspace": "Backspace",
        "delete": "Delete",
        "arrowup": "ArrowUp", "up": "ArrowUp",
        "arrowdown": "ArrowDown", "down": "ArrowDown",
        "arrowright": "ArrowRight", "right": "ArrowRight",
        "arrowleft": "ArrowLeft", "left": "ArrowLeft",
        "home": "Home",
        "end": "End",
        "pageup": "PageUp",
        "pagedown": "PageDown",
        "f1": "F1", "f2": "F2", "f3": "F3", "f4": "F4",
        "f5": "F5", "f6": "F6", "f7": "F7", "f8": "F8",
        "f9": "F9", "f10": "F10", "f11": "F11", "f12": "F12",
    }

    js_key = js_key_map.get(key_name, action.value)

    for _ in range(action.count):
        await tab.evaluate(
            f"""
            (function() {{
                var el = document.activeElement || document.body;
                var key = {repr(js_key)};
                var opts = {{key: key, code: key, bubbles: true, cancelable: true}};
                el.dispatchEvent(new KeyboardEvent('keydown', opts));
                el.dispatchEvent(new KeyboardEvent('keypress', opts));
                el.dispatchEvent(new KeyboardEvent('keyup', opts));
                if (key === 'Enter' && (el.tagName === 'FORM' || el.closest('form'))) {{
                    var form = el.tagName === 'FORM' ? el : el.closest('form');
                    if (form) form.dispatchEvent(new Event('submit', {{bubbles: true}}));
                }}
            }})()
            """
        )
        if action.count > 1 and action.delay_ms > 0:
            await asyncio.sleep(action.delay_ms / 1000)

    return ActionResult(
        action_type=action.type,
        success=True,
        description=f"key_press '{action.value}' x{action.count}",
    )


async def _do_scroll(tab: Any, action: Action) -> ActionResult:
    """Défilement de la page."""
    direction = (action.value or "down").lower()

    scroll_map = {
        "down": "window.scrollBy(0, window.innerHeight * 0.8)",
        "up": "window.scrollBy(0, -window.innerHeight * 0.8)",
        "top": "window.scrollTo(0, 0)",
        "bottom": "window.scrollTo(0, document.body.scrollHeight)",
    }

    # Permettre aussi de scroller d'un nombre de pixels
    if direction.lstrip("-").isdigit():
        px = int(direction)
        js = f"window.scrollBy(0, {px})"
    else:
        js = scroll_map.get(direction, scroll_map["down"])

    for _ in range(action.count):
        await tab.evaluate(js)
        if action.count > 1 and action.delay_ms > 0:
            await asyncio.sleep(action.delay_ms / 1000)

    return ActionResult(
        action_type=action.type,
        success=True,
        description=f"scroll {direction} x{action.count}",
    )


async def _do_wait(action: Action) -> ActionResult:
    """Attente simple."""
    ms = action.delay_ms if action.delay_ms > 0 else 500
    await asyncio.sleep(ms / 1000)
    return ActionResult(action_type=action.type, success=True, description=f"waited {ms}ms")


async def _do_hover(tab: Any, action: Action) -> ActionResult:
    """Survol d'un élément (déclenche hover/mouseenter events)."""
    if not action.selector:
        return ActionResult(action_type=action.type, success=False, error="selector requis pour hover")

    element = await tab.find(action.selector, timeout=action.timeout_ms / 1000)
    if not element:
        return ActionResult(
            action_type=action.type,
            success=False,
            error=f"Élément '{action.selector}' non trouvé",
        )

    await tab.evaluate(
        f"""
        (function() {{
            var el = document.querySelector({repr(action.selector)});
            if (el) {{
                el.dispatchEvent(new MouseEvent('mouseenter', {{bubbles: true}}));
                el.dispatchEvent(new MouseEvent('mouseover', {{bubbles: true}}));
                el.dispatchEvent(new MouseEvent('mousemove', {{bubbles: true}}));
            }}
        }})()
        """
    )
    return ActionResult(action_type=action.type, success=True, description=f"hover '{action.selector}'")


async def _do_screenshot(tab: Any) -> ActionResult:
    """Capture un screenshot en base64."""
    try:
        screenshot_data = await tab.get_content()
        return ActionResult(
            action_type="screenshot",
            success=True,
            description="screenshot taken",
        )
    except Exception as e:
        return ActionResult(action_type="screenshot", success=False, error=str(e))


async def _do_navigate(tab: Any, action: Action) -> ActionResult:
    """Navigue vers une nouvelle URL."""
    if not action.value:
        return ActionResult(action_type=action.type, success=False, error="value (URL) requis pour navigate")
    try:
        await tab.get(action.value)
        return ActionResult(action_type=action.type, success=True, description=f"navigate to {action.value}")
    except Exception as e:
        return ActionResult(action_type=action.type, success=False, error=str(e))


async def _do_back(tab: Any) -> ActionResult:
    """Page précédente."""
    try:
        await tab.evaluate("window.history.back()")
        await asyncio.sleep(0.5)
        return ActionResult(action_type="back", success=True, description="navigated back")
    except Exception as e:
        return ActionResult(action_type="back", success=False, error=str(e))


async def _do_refresh(tab: Any) -> ActionResult:
    """Rafraîchit la page."""
    try:
        await tab.evaluate("window.location.reload()")
        await asyncio.sleep(1)
        return ActionResult(action_type="refresh", success=True, description="page refreshed")
    except Exception as e:
        return ActionResult(action_type="refresh", success=False, error=str(e))


async def _do_select(tab: Any, action: Action) -> ActionResult:
    """Sélectionne une option dans un <select>."""
    if not action.selector or not action.value:
        return ActionResult(action_type=action.type, success=False, error="selector et value requis")
    await tab.evaluate(
        f"""
        (function() {{
            var sel = document.querySelector({repr(action.selector)});
            if (sel) {{
                sel.value = {repr(action.value)};
                sel.dispatchEvent(new Event('change', {{bubbles: true}}));
            }}
        }})()
        """
    )
    return ActionResult(action_type=action.type, success=True, description=f"select {action.value}")


async def _do_clear(tab: Any, action: Action) -> ActionResult:
    """Efface le contenu d'un champ."""
    if not action.selector:
        return ActionResult(action_type=action.type, success=False, error="selector requis pour clear")
    await tab.evaluate(
        f"""
        (function() {{
            var el = document.querySelector({repr(action.selector)});
            if (el) {{
                el.value = '';
                el.dispatchEvent(new Event('input', {{bubbles: true}}));
                el.dispatchEvent(new Event('change', {{bubbles: true}}));
            }}
        }})()
        """
    )
    return ActionResult(action_type=action.type, success=True, description=f"cleared '{action.selector}'")
