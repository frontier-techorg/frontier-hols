import type { StoredUser, UserRole } from "@/lib/integrate/auth/types";

const ACCESS_TOKEN_KEY = "hols_access_token";
const REFRESH_TOKEN_KEY = "hols_refresh_token";
const USER_KEY = "hols_user";
const ACCESS_TOKEN_EXPIRES_AT_KEY = "hols_access_token_expires_at";
const LAST_REFRESH_AT_KEY = "hols_last_token_refresh_at";

const LECTURE_CACHE_PREFIX = "lectures:";
const ADVISER_PATIENT_KEY = "hols-adviser-patient-id";
const ADVISER_CACHE_PREFIX = "hols-adviser-cache:";
const PREFETCH_CACHE_PREFIX = "hols_prefetched_";
const PAYMENT_CACHE_PREFIX = "student-payment:";
const PROFILE_CACHE_PREFIX = "student-profile:";
const AFFILIATE_PROFILE_CACHE_PREFIX = "affiliate-profile:";

export function saveAuthSession(data: {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  user_id: string;
  role: UserRole;
  profile: Record<string, unknown>;
}) {
  localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
  localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
  if (data.expires_in) {
    localStorage.setItem(
      ACCESS_TOKEN_EXPIRES_AT_KEY,
      String(Date.now() + data.expires_in * 1000),
    );
    localStorage.setItem(LAST_REFRESH_AT_KEY, String(Date.now()));
  }
  localStorage.setItem(
    USER_KEY,
    JSON.stringify({
      user_id: data.user_id,
      role: data.role,
      profile: data.profile,
    } satisfies StoredUser),
  );
}

export function clearAuthSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ACCESS_TOKEN_EXPIRES_AT_KEY);
  localStorage.removeItem(LAST_REFRESH_AT_KEY);
  if (typeof window !== "undefined") {
    for (const key of Object.keys(window.sessionStorage)) {
      if (
        key.startsWith(LECTURE_CACHE_PREFIX) ||
        key.startsWith(PREFETCH_CACHE_PREFIX) ||
        key.startsWith(PAYMENT_CACHE_PREFIX) ||
        key.startsWith(PROFILE_CACHE_PREFIX) ||
        key.startsWith(AFFILIATE_PROFILE_CACHE_PREFIX) ||
        key === ADVISER_PATIENT_KEY ||
        key.startsWith(`${ADVISER_PATIENT_KEY}:`) ||
        key.startsWith(ADVISER_CACHE_PREFIX)
      ) {
        window.sessionStorage.removeItem(key);
      }
    }
  }
}

export function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getAccessTokenExpiresAt(): number | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(ACCESS_TOKEN_EXPIRES_AT_KEY);
  return raw ? Number(raw) : null;
}

export function getLastTokenRefreshAt(): number | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(LAST_REFRESH_AT_KEY);
  return raw ? Number(raw) : null;
}

export function updateAuthTokens(data: {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
}) {
  localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
  localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
  localStorage.setItem(LAST_REFRESH_AT_KEY, String(Date.now()));
  if (data.expires_in) {
    localStorage.setItem(
      ACCESS_TOKEN_EXPIRES_AT_KEY,
      String(Date.now() + data.expires_in * 1000),
    );
  }
}

export function notifyAuthLogout() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("hols-auth-logout"));
}

export function updateStoredProfile(profile: Record<string, unknown>) {
  const user = getStoredUser();
  if (!user) return;
  localStorage.setItem(
    USER_KEY,
    JSON.stringify({
      ...user,
      profile,
    } satisfies StoredUser),
  );
}
