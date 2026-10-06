import type { UserRole } from "@repo/shared";
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
  /** Only in development: the API has no SMS sender yet, so it hands the code back. */
  devCode?: string;
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
