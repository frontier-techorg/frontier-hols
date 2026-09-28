import { apiRequest, ApiRequestError } from "@/lib/integrate/client";
import { getStoredUser } from "@/lib/integrate/auth/storage";
import {
  ACTIVE_PATIENT_STORAGE_KEY,
  ADVISER_CACHE_PREFIX,
} from "@/lib/integrate/provider/student/chat/constants";
import type {
  AdviserBootstrapData,
  ChatHealth,
  ChatInfo,
  IntakeAnswers,
  IntakeEvaluation,
  ChatReply,
  PatientDetail,
  PatientListData,
  PatientListParams,
  PatientMessagesData,
  QuestionnaireFlow,
} from "@/lib/integrate/provider/student/chat/types";

const adviserMemoryCache = new Map<string, unknown>();
const adviserPendingRequests = new Map<string, Promise<unknown>>();

function cacheKey(kind: string, ...parts: Array<string | number | undefined | null>) {
  const userId = getStoredUser()?.user_id ?? "anonymous";
  return [ADVISER_CACHE_PREFIX, userId, kind, ...parts.map((part) => part ?? "")].join(":");
}

type StoredActivePatient = {
  userId: string;
  patientId: string;
};

export function readStoredActivePatientId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const userId = getStoredUser()?.user_id;
  const raw = window.sessionStorage.getItem(ACTIVE_PATIENT_STORAGE_KEY);
  if (!userId || !raw) {
    if (raw) window.sessionStorage.removeItem(ACTIVE_PATIENT_STORAGE_KEY);
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as StoredActivePatient;
    if (parsed.userId === userId && parsed.patientId) return parsed.patientId;
  } catch {
    // A bare id from an earlier session is not tied to this account.
  }
  window.sessionStorage.removeItem(ACTIVE_PATIENT_STORAGE_KEY);
  return undefined;
}

export function writeStoredActivePatientId(patientId: string) {
  if (typeof window === "undefined") return;
  const userId = getStoredUser()?.user_id;
  if (!userId) return;
  const value: StoredActivePatient = { userId, patientId };
  window.sessionStorage.setItem(ACTIVE_PATIENT_STORAGE_KEY, JSON.stringify(value));
}

function readSessionCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeSessionCache<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Cache is an optimization only.
  }
}

function readAdviserCache<T>(key: string): T | null {
  const memoryValue = adviserMemoryCache.get(key);
  if (memoryValue) return memoryValue as T;

  const sessionValue = readSessionCache<T>(key);
  if (sessionValue) {
    adviserMemoryCache.set(key, sessionValue);
    return sessionValue;
  }

  return null;
}

async function cachedAdviserRequest<T>(key: string, path: string): Promise<T> {
  const cachedValue = readAdviserCache<T>(key);
  if (cachedValue) return cachedValue;

  const pending = adviserPendingRequests.get(key);
  if (pending) return pending as Promise<T>;

  const request = apiRequest<T>(path, { auth: true })
    .then((value) => {
      adviserMemoryCache.set(key, value);
      writeSessionCache(key, value);
      return value;
    })
    .finally(() => {
      adviserPendingRequests.delete(key);
    });

  adviserPendingRequests.set(key, request);
  return request;
}

export function invalidateAdviserCache(patientId?: string) {
  if (patientId) {
    for (const key of [...adviserMemoryCache.keys()]) {
      if (key.includes(`:${patientId}`) || key.includes(`:${patientId}:`)) {
        adviserMemoryCache.delete(key);
      }
    }
    if (typeof window !== "undefined") {
      for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
        const key = window.sessionStorage.key(index);
        if (key?.startsWith(ADVISER_CACHE_PREFIX) && key.includes(patientId)) {
          window.sessionStorage.removeItem(key);
        }
      }
    }
    return;
  }

  adviserMemoryCache.clear();
  if (typeof window !== "undefined") {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(ADVISER_CACHE_PREFIX)) {
        window.sessionStorage.removeItem(key);
      }
    }
  }
}

function bootstrapCacheKey(patientId?: string) {
  return cacheKey("bootstrap", patientId ?? "default");
}

function patientCacheKey(patientId: string, includeMessages: boolean) {
  return cacheKey("patient", patientId, includeMessages ? "with-messages" : "detail");
}

export function getCachedAdviserBootstrap(patientId?: string): AdviserBootstrapData | null {
  return readAdviserCache<AdviserBootstrapData>(bootstrapCacheKey(patientId));
}

export function getCachedPatient(
  patientId: string,
  includeMessages = false,
): PatientDetail | null {
  return readAdviserCache<PatientDetail>(patientCacheKey(patientId, includeMessages));
}

export function prefetchAdviserBootstrap(patientId?: string) {
  return getAdviserBootstrap(patientId ?? readStoredActivePatientId());
}

export async function getAdviserBootstrap(patientId?: string): Promise<AdviserBootstrapData> {
  const search = new URLSearchParams();
  if (patientId) {
    search.set("patient_id", patientId);
  }
  const query = search.toString();
  try {
    return await cachedAdviserRequest<AdviserBootstrapData>(
      bootstrapCacheKey(patientId),
      `/api/chat/bootstrap${query ? `?${query}` : ""}`,
    );
  } catch (err) {
    if (!patientId || !(err instanceof ApiRequestError) || err.status !== 404) throw err;
    window.sessionStorage.removeItem(ACTIVE_PATIENT_STORAGE_KEY);
    return cachedAdviserRequest<AdviserBootstrapData>(
      bootstrapCacheKey(undefined),
      "/api/chat/bootstrap",
    );
  }
}

export async function getChatHealth(): Promise<ChatHealth> {
  return apiRequest<ChatHealth>("/api/chat/health", { auth: true });
}

export async function getChatInfo(): Promise<ChatInfo> {
  return cachedAdviserRequest<ChatInfo>(cacheKey("info"), "/api/chat/info");
}

export async function getQuestionnaireFlow(): Promise<QuestionnaireFlow> {
  return cachedAdviserRequest<QuestionnaireFlow>(
    cacheKey("flow"),
    "/api/chat/questionnaire/flow",
  );
}

export async function evaluateQuestionnaire(answers: IntakeAnswers): Promise<IntakeEvaluation> {
  return apiRequest<IntakeEvaluation>("/api/chat/questionnaire/evaluate", {
    method: "POST",
    auth: true,
    body: { answers },
  });
}

export async function listPatients(params: PatientListParams = {}): Promise<PatientListData> {
  const search = new URLSearchParams();
  search.set("page", String(params.page ?? 1));
  search.set("limit", String(params.limit ?? 10));
  search.set("sort", params.sort ?? "newest");
  search.set("status", params.status ?? "all");
  if (params.q?.trim()) search.set("q", params.q.trim());
  const query = search.toString();
  return apiRequest<PatientListData>(`/api/chat/patients?${query}`, { auth: true });
}

export async function createPatient(displayName: string): Promise<PatientDetail> {
  const patient = await apiRequest<PatientDetail>("/api/chat/patients", {
    method: "POST",
    auth: true,
    body: { display_name: displayName },
  });
  invalidateAdviserCache();
  return patient;
}

export async function getPatient(
  patientId: string,
  options?: { includeMessages?: boolean },
): Promise<PatientDetail> {
  const includeMessages = Boolean(options?.includeMessages);
  const search = new URLSearchParams();
  if (includeMessages) {
    search.set("include_messages", "true");
  }
  const query = search.toString();
  const path = `/api/chat/patients/${patientId}${query ? `?${query}` : ""}`;
  if (!includeMessages) {
    return cachedAdviserRequest<PatientDetail>(patientCacheKey(patientId, false), path);
  }

  const patient = await apiRequest<PatientDetail>(path, { auth: true });
  const key = patientCacheKey(patientId, true);
  adviserMemoryCache.set(key, patient);
  writeSessionCache(key, patient);
  return patient;
}

export async function getPatientMessages(
  patientId: string,
  params?: { limit?: number; before?: string },
): Promise<PatientMessagesData> {
  const search = new URLSearchParams();
  if (params?.limit !== undefined) {
    search.set("limit", String(params.limit));
  }
  if (params?.before) {
    search.set("before", params.before);
  }
  const query = search.toString();
  const key = cacheKey("messages", patientId, query || "latest");
  return cachedAdviserRequest<PatientMessagesData>(
    key,
    `/api/chat/patients/${patientId}/messages${query ? `?${query}` : ""}`,
  );
}

export async function savePatientIntake(
  patientId: string,
  input: { answers: IntakeAnswers; display_name?: string },
): Promise<PatientDetail> {
  const patient = await apiRequest<PatientDetail>(`/api/chat/patients/${patientId}/intake`, {
    method: "PUT",
    auth: true,
    body: input,
  });
  invalidateAdviserCache(patientId);
  invalidateAdviserCache();
  return patient;
}

export async function recommendPatient(patientId: string): Promise<PatientDetail> {
  const patient = await apiRequest<PatientDetail>(`/api/chat/patients/${patientId}/recommend`, {
    method: "POST",
    auth: true,
  });
  invalidateAdviserCache(patientId);
  invalidateAdviserCache();
  return patient;
}

export async function sendPatientMessage(patientId: string, query: string): Promise<ChatReply> {
  const reply = await apiRequest<ChatReply>(`/api/chat/patients/${patientId}/messages`, {
    method: "POST",
    auth: true,
    body: { query },
  });
  invalidateAdviserCache(patientId);
  return reply;
}
