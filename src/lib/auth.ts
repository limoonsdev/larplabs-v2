/**
 * LarpLabs V2 — session locale (token + user cachés).
 * L'auth réelle est côté backend SQLite (/api/auth/*).
 */
import type { AuthUser } from "./backend-api";

const USER_KEY = "larplabs_user";

export function getSessionUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: AuthUser) {
  try {
    localStorage.setItem("larplabs_token", token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // stockage indisponible
  }
}

export function clearSession() {
  try {
    localStorage.removeItem("larplabs_token");
    localStorage.removeItem(USER_KEY);
  } catch {
    // ignore
  }
}
