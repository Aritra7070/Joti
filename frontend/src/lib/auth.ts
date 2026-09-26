"use client";

const KEY = "cuepoint.token";
const USER = "cuepoint.user";

export function getToken(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
export function getUsername(): string | null {
  try { return localStorage.getItem(USER); } catch { return null; }
}
export function setSession(token: string, username: string) {
  try { localStorage.setItem(KEY, token); localStorage.setItem(USER, username); } catch {}
}
export function clearSession() {
  try { localStorage.removeItem(KEY); localStorage.removeItem(USER); } catch {}
}

/** Where to send an unauthenticated visitor: sign-in if they had a token (expired), else sign-up. */
export function signOutTo(expired: boolean) {
  clearSession();
  if (typeof window !== "undefined") window.location.assign(expired ? "/login?expired=1" : "/signup");
}

export const PUBLIC_ROUTES = ["/login", "/signup"];
