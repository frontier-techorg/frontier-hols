"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, Menu } from "@/components/icons";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { adminNav } from "@/components/platform/provider/admin/adminNav";
import { AdminPlansPage } from "@/components/platform/provider/admin/payment/AdminPlansPage";
import { AdminSettingsProfilePanel } from "@/components/platform/provider/admin/profile/AdminSettingsProfilePanel";
import { AdminSettingsPayoutPanel } from "@/components/platform/provider/admin/profile/AdminSettingsPayoutPanel";
import {
  ADMIN_SETTINGS_NAV,
  type AdminSettingsSection,
} from "@/components/platform/provider/admin/profile/settingsNav";
import { PortalShell } from "@/components/platform/provider/PortalShell";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { ApiRequestError } from "@/lib/integrate/client";
import { getStoredUser, updateStoredProfile } from "@/lib/integrate/auth/storage";
import {
  getAdminProfile,
  getCachedAdminProfile,
  updateAdminProfile,
  type AdminProfile,
} from "@/lib/integrate/provider/admin/profile/api";
import { cn } from "@/lib/utils";

function openSidebar() {
  window.dispatchEvent(new Event("hols-portal-open-sidebar"));
}

function storedProfileFallback(): AdminProfile | null {
  const user = getStoredUser();
  if (!user?.profile) return null;
  return {
    user_id: user.user_id,
    role: user.role,
    email: String(user.profile.email ?? ""),
    first_name: String(user.profile.first_name ?? ""),
    last_name: String(user.profile.last_name ?? ""),
    profile_pic: typeof user.profile.profile_pic === "string" ? user.profile.profile_pic : undefined,
    marketing_pref: Boolean(user.profile.marketing_pref),
    email_verified: Boolean(user.profile.email_verified),
    created_at: typeof user.profile.created_at === "string" ? user.profile.created_at : undefined,
  };
}

function initials(profile: AdminProfile | null) {
  const first = profile?.first_name?.[0] ?? "";
  const last = profile?.last_name?.[0] ?? "";
  return `${first}${last}`.toUpperCase() || "A";
}

export function AdminSettingsPage({ section }: { section: AdminSettingsSection }) {
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoSuccess, setPhotoSuccess] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const applyProfile = useCallback((next: AdminProfile) => {
    setProfile(next);
    updateStoredProfile(next as unknown as Record<string, unknown>);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const cached =
      (getCachedAdminProfile()?.profile as AdminProfile | undefined) ?? storedProfileFallback();

    if (cached) applyProfile(cached);

    async function load() {
      try {
        const data = await getAdminProfile(controller.signal);
        if (controller.signal.aborted) return;
        applyProfile(data.profile as AdminProfile);
      } catch {
        if (controller.signal.aborted) return;
      }
    }

    void load();
    return () => controller.abort();
  }, [applyProfile]);

  async function onPickPhoto(file: File | null) {
    if (!file) return;
    setUploadingPhoto(true);
    setPhotoError(null);
    setPhotoSuccess(null);
    try {
      const data = await updateAdminProfile({}, file);
      applyProfile(data.profile as AdminProfile);
      setPhotoSuccess("Photo updated.");
    } catch (err) {
      setPhotoError(err instanceof ApiRequestError ? err.message : "Could not update photo.");
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const avatarSrc = profile?.profile_pic;
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Your profile";

  return (
    <PortalShell
      role="admin"
      title="Settings"
      showPageHeader={false}
      contentFlush
      brandBackdrop
      nav={adminNav}
    >
      <div className="dashboard-screen lectures-page profile-page min-w-0">
        <header className="mb-4 flex min-w-0 items-center gap-2 overflow-visible py-0.5 sm:mb-5 sm:gap-3">
          <button
            type="button"
            aria-label="Open sidebar"
            onClick={openSidebar}
            className="dashboard-icon-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-full lg:hidden"
          >
            <Icon icon={Menu} size={18} />
          </button>

          <h1 className="font-sans min-w-0 overflow-visible py-1 text-lg font-bold leading-normal tracking-[0.01em] text-[color:var(--dash-text)] sm:text-xl md:text-2xl">
            Settings
          </h1>
        </header>

        {photoError ? (
          <div className="mb-3 sm:mb-4">
            <AuthAlert variant="error">{photoError}</AuthAlert>
          </div>
        ) : null}
        {photoSuccess ? (
          <div className="mb-3 sm:mb-4">
            <AuthAlert variant="success">{photoSuccess}</AuthAlert>
          </div>
        ) : null}

        <div className="grid w-full min-w-0 items-start gap-3 sm:gap-4 lg:grid-cols-[minmax(15.5rem,18.75rem)_minmax(0,1fr)]">
          <aside className="flex min-w-0 flex-col gap-3 sm:gap-4 lg:sticky lg:top-3">
            <section className="flex flex-col items-center rounded-2xl border border-[color:var(--dash-surface-border)] bg-white px-4 py-5 text-center shadow-[0_8px_28px_rgba(20,38,68,0.06)] sm:p-5">
              <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-[color:var(--dash-surface-border)] bg-[color:var(--dash-soft)] font-sans text-lg font-bold tracking-[0.01em] text-[color:var(--dash-text)] sm:h-24 sm:w-24 sm:text-xl">
                {avatarSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials(profile)
                )}
              </span>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                onChange={(event) => void onPickPhoto(event.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto || !profile}
                className="lecture-page-action dashboard-navy-btn font-sans mt-3 inline-flex h-10 items-center justify-center rounded-full px-5 text-sm font-medium text-white disabled:pointer-events-none disabled:opacity-50"
              >
                {uploadingPhoto ? "Uploading…" : "Change photo"}
              </button>

              <p className="font-sans mt-3 max-w-full break-words text-base font-bold tracking-[0.01em] text-[color:var(--dash-text)] sm:text-lg">
                {fullName}
              </p>
              <p className="text-brand-caption mt-1 max-w-full break-all text-[color:var(--dash-muted)]">
                {profile?.email || "—"}
              </p>
              <span className="mt-3 inline-flex rounded-full bg-[color:var(--dash-soft)] px-2.5 py-1 text-brand-caption font-semibold text-[color:var(--dash-muted)]">
                Admin
              </span>
            </section>

            <nav aria-label="Settings sections" className="dashboard-glass-card rounded-2xl p-2">
              <ul className="m-0 grid list-none gap-1 p-0">
                {ADMIN_SETTINGS_NAV.map((item) => {
                  const active = item.id === section;
                  return (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        className={cn(
                          "portal-nav-item font-sans flex h-12 min-w-0 items-center gap-3 rounded-2xl px-3.5 text-sm font-medium tracking-[0.005em]",
                          active && "is-active",
                        )}
                        aria-current={active ? "page" : undefined}
                      >
                        <span className="portal-nav-icon flex h-5 w-5 shrink-0 items-center justify-center">
                          <SidebarSvgIcon name={item.icon} size={18} strokeWidth={1.9} />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>

          <div className="min-w-0">
            {section === "plan" ? (
              <AdminPlansPage />
            ) : section === "payout" ? (
              <AdminSettingsPayoutPanel />
            ) : (
              <AdminSettingsProfilePanel onProfileChange={applyProfile} />
            )}
          </div>
        </div>
      </div>
    </PortalShell>
  );
}

export function AdminProfilePage() {
  return <AdminSettingsPage section="profile" />;
}
