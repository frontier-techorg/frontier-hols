"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { Button } from "@/components/ui/Button";
import { SkeletonBlock } from "@/components/platform/provider/student/DashboardSkeletons";
import { ApiRequestError } from "@/lib/integrate/client";
import { getStoredUser, updateStoredProfile } from "@/lib/integrate/auth/storage";
import {
  getAdminProfile,
  getCachedAdminProfile,
  updateAdminProfile,
  type AdminProfile,
  type AdminProfileUpdate,
} from "@/lib/integrate/provider/admin/profile/api";
import { cn } from "@/lib/utils";

type ProfileFormState = {
  first_name: string;
  last_name: string;
  marketing_pref: boolean;
};

function emptyForm(): ProfileFormState {
  return {
    first_name: "",
    last_name: "",
    marketing_pref: false,
  };
}

function profileToForm(profile: AdminProfile): ProfileFormState {
  return {
    first_name: profile.first_name ?? "",
    last_name: profile.last_name ?? "",
    marketing_pref: Boolean(profile.marketing_pref),
  };
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

function buildChangedPayload(
  form: ProfileFormState,
  baseline: ProfileFormState,
): AdminProfileUpdate {
  const payload: AdminProfileUpdate = {};
  if (form.first_name.trim() !== baseline.first_name.trim()) {
    payload.first_name = form.first_name.trim();
  }
  if (form.last_name.trim() !== baseline.last_name.trim()) {
    payload.last_name = form.last_name.trim();
  }
  if (form.marketing_pref !== baseline.marketing_pref) {
    payload.marketing_pref = form.marketing_pref;
  }
  return payload;
}

function DashField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  required = false,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <label htmlFor={id} className="dashboard-field-label">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="text"
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        className={cn("dashboard-field", disabled && "cursor-not-allowed opacity-70")}
      />
    </div>
  );
}

export function AdminSettingsProfilePanel({
  onProfileChange,
}: {
  onProfileChange?: (profile: AdminProfile) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [baseline, setBaseline] = useState<ProfileFormState>(emptyForm);
  const [form, setForm] = useState<ProfileFormState>(emptyForm);
  const onProfileChangeRef = useRef(onProfileChange);
  onProfileChangeRef.current = onProfileChange;

  const applyProfile = useCallback((next: AdminProfile) => {
    const nextForm = profileToForm(next);
    setProfile(next);
    setBaseline(nextForm);
    setForm(nextForm);
    updateStoredProfile(next as unknown as Record<string, unknown>);
    onProfileChangeRef.current?.(next);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const cached =
      (getCachedAdminProfile()?.profile as AdminProfile | undefined) ?? storedProfileFallback();

    if (cached) applyProfile(cached);

    async function load() {
      setError(null);
      try {
        const data = await getAdminProfile(controller.signal);
        if (controller.signal.aborted) return;
        applyProfile(data.profile as AdminProfile);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!cached) {
          setError(err instanceof ApiRequestError ? err.message : "Failed to load profile.");
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [applyProfile]);

  const dirtyPayload = useMemo(() => buildChangedPayload(form, baseline), [form, baseline]);
  const hasChanges = Object.keys(dirtyPayload).length > 0;

  function resetForm() {
    setForm(baseline);
    setError(null);
    setSuccess(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasChanges) {
      setSuccess("No changes to save.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const data = await updateAdminProfile(dirtyPayload);
      applyProfile(data.profile as AdminProfile);
      setSuccess("Profile updated.");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not update profile.");
    } finally {
      setSaving(false);
    }
  }

  if (!profile) {
    return (
      <section
        className="min-w-0 rounded-2xl border border-[color:var(--dash-surface-border)] bg-white p-4 shadow-[0_8px_28px_rgba(20,38,68,0.06)] sm:p-5 md:p-6"
        aria-busy="true"
        aria-label="Loading profile"
      >
        <SkeletonBlock className="h-5 w-40 rounded-full" />
        <SkeletonBlock className="mt-2 h-4 w-64 rounded-full" />
        <div className="mt-6 grid gap-4">
          <SkeletonBlock className="h-11 w-full rounded-2xl" />
          <div className="grid gap-4 sm:grid-cols-2">
            <SkeletonBlock className="h-11 w-full rounded-2xl" />
            <SkeletonBlock className="h-11 w-full rounded-2xl" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="min-w-0 rounded-2xl border border-[color:var(--dash-surface-border)] bg-white p-4 shadow-[0_8px_28px_rgba(20,38,68,0.06)] sm:p-5 md:p-6">
      <h2 className="font-sans text-base font-semibold tracking-[0.005em] text-[color:var(--dash-text)] sm:text-lg">
        Profile information
      </h2>
      <p className="text-brand-body mt-1 text-sm text-[color:var(--dash-muted)] sm:text-base">
        Keep your account details current.
      </p>

      {error ? (
        <div className="mt-4">
          <AuthAlert variant="error">{error}</AuthAlert>
        </div>
      ) : null}
      {success ? (
        <div className="mt-4">
          <AuthAlert variant="success">{success}</AuthAlert>
        </div>
      ) : null}

      <form className="mt-5 grid gap-3 sm:mt-6 sm:gap-4" onSubmit={handleSubmit}>
        <DashField id="email" label="Account email" value={profile.email} disabled />

        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          <DashField
            id="first_name"
            label="First name"
            value={form.first_name}
            onChange={(value) => setForm((prev) => ({ ...prev, first_name: value }))}
            placeholder="First name"
            autoComplete="given-name"
            required
          />
          <DashField
            id="last_name"
            label="Last name"
            value={form.last_name}
            onChange={(value) => setForm((prev) => ({ ...prev, last_name: value }))}
            placeholder="Last name"
            autoComplete="family-name"
            required
          />
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[color:var(--dash-surface-border)] bg-[color:var(--dash-soft)] px-3 py-3 sm:px-3.5">
          <input
            type="checkbox"
            checked={form.marketing_pref}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, marketing_pref: event.target.checked }))
            }
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-[color:var(--dash-dim)] accent-[#DDE466]"
          />
          <span className="min-w-0">
            <span className="font-sans block text-sm font-medium text-[color:var(--dash-text)]">
              Email me product updates
            </span>
            <span className="text-brand-caption mt-0.5 block text-[color:var(--dash-faint)]">
              Occasional news about the platform.
            </span>
          </span>
        </label>

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-2.5">
          <button
            type="button"
            onClick={resetForm}
            disabled={!hasChanges || saving}
            className="lecture-page-action dashboard-navy-btn font-sans inline-flex h-10 w-full items-center justify-center rounded-full px-5 text-sm font-medium text-white disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
          >
            Cancel
          </button>
          <Button
            type="submit"
            disabled={saving || !hasChanges}
            className="lecture-page-action h-10 w-full px-5 py-0 text-sm sm:w-auto sm:min-w-[9rem]"
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </section>
  );
}
