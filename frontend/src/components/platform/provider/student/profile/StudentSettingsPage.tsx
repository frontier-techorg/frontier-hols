"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon, Menu } from "@/components/icons";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { PortalShell } from "@/components/platform/provider/PortalShell";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { StudentOrdersPage } from "@/components/platform/provider/student/payment/StudentOrdersPage";
import { StudentPlansPage } from "@/components/platform/provider/student/payment/StudentPlansPage";
import { SettingsProfilePanel } from "@/components/platform/provider/student/profile/SettingsProfilePanel";
import {
  SETTINGS_NAV,
  type SettingsSection,
} from "@/components/platform/provider/student/profile/settingsNav";
import { studentNav } from "@/components/platform/provider/student/studentNav";
import { cn } from "@/lib/utils";
import { ApiRequestError } from "@/lib/integrate/client";
import { getStoredUser, updateStoredProfile } from "@/lib/integrate/auth/storage";
import {
  getCachedStudentProfile,
  getStudentProfile,
  updateStudentProfile,
  type StudentAddress,
  type StudentProfile,
} from "@/lib/integrate/provider/student/profile/api";
function openSidebar() {
  window.dispatchEvent(new Event("hols-portal-open-sidebar"));
}

function storedProfileFallback(): StudentProfile | null {
  const user = getStoredUser();
  if (!user?.profile) return null;
  return {
    user_id: user.user_id,
    role: user.role,
    email: String(user.profile.email ?? ""),
    first_name: String(user.profile.first_name ?? ""),
    last_name: String(user.profile.last_name ?? ""),
    profile_pic: typeof user.profile.profile_pic === "string" ? user.profile.profile_pic : undefined,
    address: user.profile.address as StudentAddress | undefined,
    marketing_pref: Boolean(user.profile.marketing_pref),
    referred_by_affiliate_id:
      typeof user.profile.referred_by_affiliate_id === "string"
        ? user.profile.referred_by_affiliate_id
        : undefined,
    email_verified: Boolean(user.profile.email_verified),
    created_at: typeof user.profile.created_at === "string" ? user.profile.created_at : undefined,
  };
}

function initials(profile: StudentProfile | null) {
  const first = profile?.first_name?.[0] ?? "";
  const last = profile?.last_name?.[0] ?? "";
  return `${first}${last}`.toUpperCase() || "S";
}

export function StudentSettingsPage({ section }: { section: SettingsSection }) {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoSuccess, setPhotoSuccess] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const applyProfile = useCallback((next: StudentProfile) => {
    setProfile(next);
    updateStoredProfile(next as unknown as Record<string, unknown>);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const cached =
      (getCachedStudentProfile()?.profile as StudentProfile | undefined) ?? storedProfileFallback();

    if (cached) applyProfile(cached);

    async function load() {
      try {
        const data = await getStudentProfile(controller.signal);
        if (controller.signal.aborted) return;
        applyProfile(data.profile as StudentProfile);
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
      const data = await updateStudentProfile({}, file);
      applyProfile(data.profile as StudentProfile);
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
      role="student"
      title="Profile"
      showPageHeader={false}
      contentFlush
      brandBackdrop
      nav={studentNav}
    >
      <div className="dashboard-screen lectures-page profile-page min-w-0 overflow-x-hidden">
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
            Profile
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
              <section className="flex min-w-0 flex-row items-center gap-3 rounded-2xl border border-[color:var(--dash-surface-border)] bg-white px-4 py-4 text-left shadow-[0_8px_28px_rgba(20,38,68,0.06)] sm:gap-4 sm:px-5 lg:flex-col lg:items-center lg:px-4 lg:py-5 lg:text-center">
                {profile ? (
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[color:var(--dash-surface-border)] bg-[color:var(--dash-soft)] font-sans text-lg font-bold tracking-[0.01em] text-[color:var(--dash-text)] sm:h-20 sm:w-20 lg:h-24 lg:w-24 lg:text-xl">
                    {avatarSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
                    ) : (
                      initials(profile)
                    )}
                  </span>
                ) : (
                  <span className="dashboard-skeleton-block h-16 w-16 shrink-0 rounded-full sm:h-20 sm:w-20 lg:h-24 lg:w-24" />
                )}

                <div className="flex min-w-0 flex-1 flex-col items-start lg:items-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="sr-only"
                    onChange={(event) => void onPickPhoto(event.target.files?.[0] ?? null)}
                  />

                  {profile ? (
                    <>
                      <p className="font-sans w-full truncate text-base font-bold tracking-[0.01em] text-[color:var(--dash-text)] sm:text-lg">
                        {fullName}
                      </p>
                      <p className="text-brand-caption mt-1 w-full truncate text-[color:var(--dash-muted)]">
                        {profile.email || "—"}
                      </p>
                      <span className="mt-2 inline-flex rounded-full bg-[color:var(--dash-soft)] px-2.5 py-1 text-brand-caption font-semibold text-[color:var(--dash-muted)]">
                        Student
                      </span>
                    </>
                  ) : (
                    <div className="w-full space-y-2 lg:flex lg:flex-col lg:items-center" aria-hidden>
                      <span className="dashboard-skeleton-block block h-5 w-36 max-w-full rounded-full" />
                      <span className="dashboard-skeleton-block block h-3.5 w-48 max-w-full rounded-full" />
                      <span className="dashboard-skeleton-block block h-6 w-16 rounded-full" />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPhoto || !profile}
                    className="lecture-page-action dashboard-navy-btn font-sans mt-3 inline-flex h-10 min-h-10 w-full items-center justify-center rounded-full px-5 text-sm font-medium tracking-[0.01em] text-white transition disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
                  >
                    {uploadingPhoto ? "Uploading…" : "Change photo"}
                  </button>
                </div>
              </section>

              <nav
                aria-label="Profile sections"
                className="dashboard-glass-card rounded-2xl p-2"
              >
                <ul className="m-0 grid list-none grid-cols-3 gap-1 p-0 lg:grid-cols-1">
                  {SETTINGS_NAV.map((item) => {
                    const active = item.id === section;
                    return (
                      <li key={item.id}>
                        <Link
                          href={item.href}
                          className={cn(
                            "portal-nav-item font-sans flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-2xl px-2 text-sm font-medium tracking-[0.005em] lg:h-12 lg:justify-start lg:gap-3 lg:px-3.5",
                            active && "is-active",
                          )}
                          aria-current={active ? "page" : undefined}
                        >
                          <span className="portal-nav-icon flex h-5 w-5 shrink-0 items-center justify-center">
                            <SidebarSvgIcon name={item.icon} size={18} strokeWidth={1.9} />
                          </span>
                          <span className="min-w-0 truncate">{item.shortLabel}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </aside>

            <div className="min-w-0">
              {section === "plan" ? (
                <Suspense fallback={null}>
                  <StudentPlansPage />
                </Suspense>
              ) : section === "order" ? (
                <StudentOrdersPage />
              ) : (
                <SettingsProfilePanel onProfileChange={applyProfile} />
              )}
            </div>
          </div>
      </div>
    </PortalShell>
  );
}

export function StudentProfilePage() {
  return <StudentSettingsPage section="profile" />;
}
