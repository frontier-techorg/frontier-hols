import { apiFormRequest, apiRequest } from "@/lib/integrate/client";
import type { ProfileData } from "@/lib/integrate/auth/types";
import { getStoredUser, updateStoredProfile } from "@/lib/integrate/auth/storage";
import type { StudentProfileUpdate } from "@/lib/integrate/provider/student/profile/types";

export type {
  StudentAddress,
  StudentProfile,
  StudentProfileUpdate,
} from "@/lib/integrate/provider/student/profile/types";

let profileMemoryCache: ProfileData | null = null;
let profileMemoryUserId: string | null = null;
let pendingProfileRequest: Promise<ProfileData> | null = null;

function profileCacheKey() {
  return `student-profile:${getStoredUser()?.user_id ?? "anonymous"}:me`;
}

function readSessionProfile(): ProfileData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(profileCacheKey());
    return raw ? (JSON.parse(raw) as ProfileData) : null;
  } catch {
    return null;
  }
}

function writeProfileCache(data: ProfileData) {
  profileMemoryCache = data;
  profileMemoryUserId = getStoredUser()?.user_id ?? null;
  updateStoredProfile(data.profile);
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(profileCacheKey(), JSON.stringify(data));
  } catch {
    // Profile cache is only an optimization; ignore storage failures.
  }
}

export function getCachedStudentProfile() {
  const userId = getStoredUser()?.user_id ?? null;
  if (profileMemoryCache && profileMemoryUserId === userId) return profileMemoryCache;
  const sessionProfile = readSessionProfile();
  if (sessionProfile) {
    profileMemoryCache = sessionProfile;
    profileMemoryUserId = userId;
    return sessionProfile;
  }
  return null;
}

export function getStudentProfile(signal?: AbortSignal) {
  const cached = getCachedStudentProfile();
  if (cached) return Promise.resolve(cached);

  if (!pendingProfileRequest) {
    pendingProfileRequest = apiRequest<ProfileData>("/api/auth/profile", { auth: true })
      .then((data) => {
        writeProfileCache(data);
        return data;
      })
      .finally(() => {
        pendingProfileRequest = null;
      });
  }

  const request = pendingProfileRequest;
  if (!signal) return request;

  return new Promise<ProfileData>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const onAbort = () => {
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });

    request.then(
      (data) => {
        signal.removeEventListener("abort", onAbort);
        if (signal.aborted) onAbort();
        else resolve(data);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

export function updateStudentProfile(
  payload: StudentProfileUpdate,
  profilePicFile?: File | null,
) {
  const formData = new FormData();
  let hasFields = Boolean(profilePicFile);

  if (payload.first_name !== undefined) {
    formData.append("first_name", payload.first_name);
    hasFields = true;
  }
  if (payload.last_name !== undefined) {
    formData.append("last_name", payload.last_name);
    hasFields = true;
  }
  if (payload.marketing_pref !== undefined) {
    formData.append("marketing_pref", String(payload.marketing_pref));
    hasFields = true;
  }
  if (payload.address) {
    formData.append("address", JSON.stringify(payload.address));
    hasFields = true;
  }
  if (profilePicFile) {
    formData.append("profile_pic", profilePicFile);
  }

  if (!hasFields) {
    return Promise.reject(new Error("No profile changes to save."));
  }

  return apiFormRequest<ProfileData>("/api/auth/profile", formData, {
    auth: true,
  }).then((data) => {
    writeProfileCache(data);
    return data;
  });
}
