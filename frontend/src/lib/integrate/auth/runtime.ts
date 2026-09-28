"use client";

import { refreshAccessTokenForSession } from "@/lib/integrate/client";
import {
  getLastTokenRefreshAt,
  getStoredUser,
  notifyAuthLogout,
} from "@/lib/integrate/auth/storage";
import type { UserRole } from "@/lib/integrate/auth/types";
import { listCourses } from "@/lib/integrate/provider/student/lectures";
import { prefetchAdviserBootstrap } from "@/lib/integrate/provider/student/chat/api";
import { getStudentProfile } from "@/lib/integrate/provider/student/profile/api";
import {
  getCurrentMembership,
  listPlans as listStudentPlans,
  listOrders,
} from "@/lib/integrate/provider/student/payment/api";
import { listStudents } from "@/lib/integrate/provider/admin/users/api";
import { listAdminAffiliates } from "@/lib/integrate/provider/admin/affiliates/api";
import { listPlans as listAdminPlans } from "@/lib/integrate/provider/admin/payment/api";
import { getAdminProfile } from "@/lib/integrate/provider/admin/profile/api";
import { getAffiliateProfile } from "@/lib/integrate/provider/affiliate/profile/api";
import { getApiRuntime } from "@/lib/integrate/runtime";

const TEN_MINUTES_MS = 10 * 60 * 1000;
let refreshTimer: number | null = null;
let prefetchPromise: Promise<void> | null = null;

async function refreshIfDue() {
  const lastRefresh = getLastTokenRefreshAt() ?? 0;
  if (Date.now() - lastRefresh < TEN_MINUTES_MS) return;
  const token = await refreshAccessTokenForSession();
  if (!token) {
    notifyAuthLogout();
  }
}

async function prefetchStudentData() {
  await Promise.allSettled([
    getApiRuntime(),
    getStudentProfile(),
    getCurrentMembership(),
    listOrders({ page: 1, limit: 1 }),
    listOrders({ page: 1, limit: 10 }),
    listStudentPlans(),
    // Static lecture catalog is session-cached, so refreshes reuse it without a network call.
    listCourses({ page: 1, limit: 12 }),
    // Peptide adviser bootstrap (patients + active chat history) preloads on portal login.
    prefetchAdviserBootstrap(),
  ]);
}

async function prefetchAdminData() {
  await Promise.allSettled([
    getAdminProfile(),
    listStudents({ page: 1, limit: 1 }),
    listStudents({ page: 1, limit: 15 }),
    listAdminAffiliates({ page: 1, limit: 1 }),
    listAdminAffiliates({ page: 1, limit: 15 }),
    listAdminPlans(),
  ]);
}

async function prefetchAffiliateData() {
  await Promise.allSettled([getAffiliateProfile()]);
}

function prefetchPortalData(role: UserRole) {
  const user = getStoredUser();
  const prefetchKey = user ? `hols_prefetched_${user.user_id}_${role}` : null;
  if (!prefetchKey || sessionStorage.getItem(prefetchKey) === "true") return;
  if (prefetchPromise) return;
  sessionStorage.setItem(prefetchKey, "true");

  prefetchPromise = (async () => {
    if (role === "student") {
      await prefetchStudentData();
    } else if (role === "admin") {
      await prefetchAdminData();
    } else if (role === "affiliate") {
      await prefetchAffiliateData();
    }
  })().finally(() => {
    prefetchPromise = null;
  });
}

export function startPortalAuthRuntime(role: UserRole) {
  if (typeof window === "undefined") return;

  prefetchPortalData(role);

  if (refreshTimer) return;
  refreshTimer = window.setInterval(() => {
    void refreshIfDue();
  }, TEN_MINUTES_MS);
}

export function stopPortalAuthRuntime() {
  if (refreshTimer) {
    window.clearInterval(refreshTimer);
    refreshTimer = null;
  }
}
