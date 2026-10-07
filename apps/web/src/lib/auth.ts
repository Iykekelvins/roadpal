import type { UpdateMeInput, UserRole } from "@repo/shared";
import { api, refreshSession, setAccessToken } from "./api";

/** The signed-in user, as GET /users/me returns it. */
export interface Me {
  id: string;
  phone: string;
  role: UserRole;
  name: string | null;
}

export interface OtpSent {
  expiresInSeconds: number;
  /** Demo mode only (SMS_MODE=demo): no SMS is sent, so the API hands the code back to show on screen. */
  demoCode?: string;
}

export function requestOtp(phone: string) {
  return api<OtpSent>("/auth/otp/request", { method: "POST", body: JSON.stringify({ phone }) });
}

/** Throws ApiError with code "ROLE_REQUIRED" when the number has no account and no role was sent. */
export async function verifyOtp(phone: string, code: string, role?: UserRole) {
  const result = await api<{ accessToken: string; user: Me; isNewUser: boolean }>("/auth/otp/verify", {
    method: "POST",
    body: JSON.stringify({ phone, code, role }),
  });
  setAccessToken(result.accessToken);
  return result;
}

/** Restores a session from the refresh cookie (e.g. after a page reload). Null when logged out. */
export async function restoreSession(): Promise<Me | null> {
  if (!(await refreshSession())) return null;
  return api<Me>("/users/me");
}

export async function logout() {
  try {
    await api("/auth/logout", { method: "POST", body: "{}" });
  } finally {
    setAccessToken(null);
  }
}

/** Where each role lands after logging in. */
export const HOME: Record<UserRole, string> = { driver: "/driver", provider: "/provider" };

export function updateMe(input: UpdateMeInput) {
  return api<Me>("/users/me", { method: "PATCH", body: JSON.stringify(input) });
}

// The last number that logged in on this device, so the login screen can say "Welcome back".
// Only the number: the session itself stays in the httpOnly cookie. Storage can be unavailable
// (private mode, blocked site data), so every access is guarded and failure just means a blank form.
const LAST_PHONE_KEY = "rp_last_phone";

export function rememberPhone(phone: string | null) {
  try {
    if (phone) localStorage.setItem(LAST_PHONE_KEY, phone);
    else localStorage.removeItem(LAST_PHONE_KEY);
    window.dispatchEvent(new StorageEvent("storage", { key: LAST_PHONE_KEY }));
  } catch {}
}

export function readRememberedPhone(): string | null {
  try {
    return localStorage.getItem(LAST_PHONE_KEY);
  } catch {
    return null;
  }
}
