/**
 * LarpLabs V2 — fausse authentification locale (démo).
 * Stocke la session dans localStorage, sans backend.
 */

const KEY = "larplabs_auth";

export type AuthUser = { email: string; at: number };

export function getAuthUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function login(email: string): AuthUser {
  const user = { email, at: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(user));
  } catch {
    // stockage indisponible, on continue quand même
  }
  return user;
}

export function logout() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
