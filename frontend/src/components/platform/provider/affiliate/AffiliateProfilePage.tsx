"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, Menu } from "@/components/icons";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { PortalShell } from "@/components/platform/provider/PortalShell";
import { SkeletonBlock } from "@/components/platform/provider/student/DashboardSkeletons";
import { ProfileSelect } from "@/components/platform/provider/student/profile/ProfileSelect";
import { Button } from "@/components/ui/Button";
import { affiliateNav } from "@/components/platform/provider/affiliate/affiliateNav";
import {
  affiliateDisplayName,
  affiliateInitials,
  affiliateProfileToForm,
  buildAffiliateProfilePayload,
  emptyAffiliateProfileForm,
  type ProfileFormState,
  useAffiliateProfile,
} from "@/components/platform/provider/affiliate/affiliateProfile";
import { ApiRequestError } from "@/lib/integrate/client";
import {
  updateAffiliateProfile,
  type AffiliateProfile,
} from "@/lib/integrate/provider/affiliate/profile/api";
import {
  DEFAULT_COUNTRY_CODE,
  MANUAL_VALUE,
  US_STATES,
  getCitiesForState,
  resolveCitySelection,
  resolveStateSelection,
} from "@/content/locations/us";
import { cn } from "@/lib/utils";

type LocationUiState = {
  stateSelect: string;
  stateManual: string;
  citySelect: string;
  cityManual: string;
};

function openSidebar() {
  window.dispatchEvent(new Event("hols-portal-open-sidebar"));
}

function toLocationUi(form: ProfileFormState): LocationUiState {
  const stateSel = resolveStateSelection(form.state);
  const citySel =
    stateSel.mode === "select"
      ? resolveCitySelection(stateSel.code, form.city)
      : { mode: "manual" as const, value: MANUAL_VALUE, manual: form.city };

  return {
    stateSelect: stateSel.code || "",
    stateManual: stateSel.manual,
    citySelect: citySel.value || "",
    cityManual: citySel.manual,
  };
}

function mergeLocationIntoForm(
  form: ProfileFormState,
  location: LocationUiState,
): ProfileFormState {
  const state =
    location.stateSelect === MANUAL_VALUE ? location.stateManual.trim() : location.stateSelect;
  const city =
    location.stateSelect === MANUAL_VALUE || location.citySelect === MANUAL_VALUE
      ? location.cityManual.trim()
      : location.citySelect;

  return {
    ...form,
    country: DEFAULT_COUNTRY_CODE,
    state,
    city,
  };
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
        className={cn(
          "dashboard-field min-w-0 max-w-full",
          disabled && "cursor-not-allowed truncate opacity-70",
        )}
      />
    </div>
  );
}

export function AffiliateProfilePage() {
  const { profile, refreshing, error, setError, applyProfile } = useAffiliateProfile();
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<ProfileFormState>(emptyAffiliateProfileForm);
  const [form, setForm] = useState<ProfileFormState>(emptyAffiliateProfileForm);
  const [location, setLocation] = useState<LocationUiState>(() =>
    toLocationUi(emptyAffiliateProfileForm()),
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!profile) return;
    const nextForm = affiliateProfileToForm(profile);
    setBaseline(nextForm);
    setForm(nextForm);
    setLocation(toLocationUi(nextForm));
  }, [profile]);

  const composedForm = useMemo(() => mergeLocationIntoForm(form, location), [form, location]);
  const dirtyPayload = useMemo(
    () => buildAffiliateProfilePayload(composedForm, baseline),
    [composedForm, baseline],
  );
  const hasChanges = Object.keys(dirtyPayload).length > 0;
  const usCities = useMemo(() => {
    if (location.stateSelect && location.stateSelect !== MANUAL_VALUE) {
      return getCitiesForState(location.stateSelect);
    }
    return [];
  }, [location.stateSelect]);

  const avatarSrc = profile?.profile_pic;
  const fullName = affiliateDisplayName(profile);
  const pageError = photoError ?? error;

  function resetForm() {
    setForm(baseline);
    setLocation(toLocationUi(baseline));
    setError(null);
    setPhotoError(null);
    setSuccess(null);
  }

  async function onPickPhoto(file: File | null) {
    if (!file) return;
    setUploadingPhoto(true);
    setPhotoError(null);
    setError(null);
    setSuccess(null);
    try {
      const data = await updateAffiliateProfile({}, file);
      applyProfile(data.profile as AffiliateProfile);
      setSuccess("Photo updated.");
    } catch (err) {
      setPhotoError(err instanceof ApiRequestError ? err.message : "Could not update photo.");
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasChanges) {
      setSuccess("No changes to save.");
      return;
    }

    setSaving(true);
    setError(null);
    setPhotoError(null);
    setSuccess(null);

    try {
      const data = await updateAffiliateProfile(dirtyPayload);
      applyProfile(data.profile as AffiliateProfile);
      setSuccess("Profile updated.");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not update profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PortalShell
      role="affiliate"
      title="Profile"
      showPageHeader={false}
      contentFlush
      brandBackdrop
      nav={affiliateNav}
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
          <h1 className="font-sans min-w-0 truncate py-1 text-lg font-bold leading-normal tracking-[0.01em] text-[color:var(--dash-text)] sm:text-xl md:text-2xl">
            Profile
          </h1>
        </header>

        {pageError ? (
          <div className="mb-3 sm:mb-4">
            <AuthAlert variant="error">{pageError}</AuthAlert>
          </div>
        ) : null}
        {success ? (
          <div className="mb-3 sm:mb-4">
            <AuthAlert variant="success">{success}</AuthAlert>
          </div>
        ) : null}

        {!profile && refreshing ? (
          <AffiliateProfileSkeleton />
        ) : (
        <div className="grid w-full min-w-0 items-start gap-3 sm:gap-4 lg:grid-cols-[minmax(15.5rem,18.75rem)_minmax(0,1fr)]">
          <aside className="flex min-w-0 flex-col gap-3 sm:gap-4 lg:sticky lg:top-3">
            <section className="flex min-w-0 flex-row items-center gap-3 rounded-2xl border border-[color:var(--dash-surface-border)] bg-white px-4 py-4 text-left shadow-[0_8px_28px_rgba(20,38,68,0.06)] sm:gap-4 sm:px-5 lg:flex-col lg:items-center lg:px-4 lg:py-5 lg:text-center">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[color:var(--dash-surface-border)] bg-[color:var(--dash-soft)] font-sans text-lg font-bold tracking-[0.01em] text-[color:var(--dash-text)] sm:h-20 sm:w-20 lg:h-24 lg:w-24 lg:text-xl">
                {avatarSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
                ) : (
                  affiliateInitials(profile)
                )}
              </span>
              <div className="flex min-w-0 flex-1 flex-col items-start lg:items-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  onChange={(event) => void onPickPhoto(event.target.files?.[0] ?? null)}
                />
                <p className="font-sans w-full truncate text-base font-bold tracking-[0.01em] text-[color:var(--dash-text)] sm:text-lg">
                  {fullName}
                </p>
                <p className="text-brand-caption mt-1 w-full truncate text-[color:var(--dash-muted)]" title={profile?.email || undefined}>
                  {profile?.email || "—"}
                </p>
                <span className="mt-2 inline-flex rounded-full bg-[color:var(--dash-soft)] px-2.5 py-1 text-brand-caption font-semibold text-[color:var(--dash-muted)]">
                  Affiliate
                </span>
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
          </aside>

          <div className="min-w-0">
              <section className="min-w-0 rounded-2xl border border-[color:var(--dash-surface-border)] bg-white p-4 shadow-[0_8px_28px_rgba(20,38,68,0.06)] sm:p-5 md:p-6">
                <h2 className="font-sans text-base font-semibold tracking-[0.005em] text-[color:var(--dash-text)] sm:text-lg">
                  Profile information
                </h2>
                <p className="text-brand-body mt-1 text-sm text-[color:var(--dash-muted)] sm:text-base">
                  Keep your account details current.
                </p>

                <form className="mt-5 grid gap-3 sm:mt-6 sm:gap-4" onSubmit={handleSubmit}>
                  <DashField id="email" label="Account email" value={profile?.email ?? ""} disabled />
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
                  <DashField
                    id="line1"
                    label="Address line 1"
                    value={form.line1}
                    onChange={(value) => setForm((prev) => ({ ...prev, line1: value }))}
                    placeholder="Street address"
                    autoComplete="address-line1"
                  />
                  <DashField
                    id="line2"
                    label="Address line 2"
                    value={form.line2}
                    onChange={(value) => setForm((prev) => ({ ...prev, line2: value }))}
                    placeholder="Apt, suite, etc. (optional)"
                    autoComplete="address-line2"
                  />
                  <div className="grid min-w-0 gap-3 md:grid-cols-2 md:gap-4">
                    <ProfileSelect
                      id="state"
                      label="State"
                      value={location.stateSelect}
                      onChange={(value) => {
                        setLocation({
                          stateSelect: value,
                          stateManual: value === MANUAL_VALUE ? location.stateManual : "",
                          citySelect: "",
                          cityManual: "",
                        });
                      }}
                      options={[
                        { value: "", label: "Select state" },
                        ...US_STATES.map((state) => ({ value: state.code, label: state.name })),
                        { value: MANUAL_VALUE, label: "Other (manual)" },
                      ]}
                    />
                    {location.stateSelect === MANUAL_VALUE ? (
                      <DashField
                        id="state_manual"
                        label="State"
                        value={location.stateManual}
                        onChange={(value) => setLocation((prev) => ({ ...prev, stateManual: value }))}
                        placeholder="Enter state"
                      />
                    ) : (
                      <ProfileSelect
                        id="city"
                        label="City"
                        value={location.citySelect}
                        disabled={!location.stateSelect}
                        onChange={(value) => {
                          setLocation((prev) => ({
                            ...prev,
                            citySelect: value,
                            cityManual: value === MANUAL_VALUE ? prev.cityManual : "",
                          }));
                        }}
                        options={[
                          {
                            value: "",
                            label: location.stateSelect ? "Select city" : "Select state first",
                          },
                          ...usCities.map((city) => ({ value: city, label: city })),
                          { value: MANUAL_VALUE, label: "Other (manual)" },
                        ]}
                      />
                    )}
                  </div>
                  {location.stateSelect === MANUAL_VALUE ? (
                    <DashField
                      id="city_manual"
                      label="City"
                      value={location.cityManual}
                      onChange={(value) => setLocation((prev) => ({ ...prev, cityManual: value }))}
                      placeholder="Enter city"
                    />
                  ) : location.citySelect === MANUAL_VALUE ? (
                    <DashField
                      id="city_manual_other"
                      label="City"
                      value={location.cityManual}
                      onChange={(value) => setLocation((prev) => ({ ...prev, cityManual: value }))}
                      placeholder="Enter city"
                    />
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                    <DashField
                      id="postal_code"
                      label="ZIP / Postal code"
                      value={form.postal_code}
                      onChange={(value) => setForm((prev) => ({ ...prev, postal_code: value }))}
                      placeholder="ZIP code"
                      autoComplete="postal-code"
                    />
                    <DashField id="country" label="Country" value="United States" disabled />
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
                        Occasional news about the partner program.
                      </span>
                    </span>
                  </label>
                  <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-2.5">
                    <button
                      type="button"
                      onClick={resetForm}
                      disabled={!hasChanges || saving}
                      className="lecture-page-action dashboard-navy-btn font-sans inline-flex h-10 min-h-10 w-full items-center justify-center rounded-full px-5 text-sm font-medium tracking-[0.01em] text-white transition disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
                    >
                      Cancel
                    </button>
                    <Button
                      type="submit"
                      disabled={saving || !hasChanges}
                      className="lecture-page-action h-10 min-h-10 w-full py-0 text-sm sm:w-auto sm:min-w-[9rem]"
                    >
                      {saving ? "Saving…" : "Save changes"}
                    </Button>
                  </div>
                </form>
              </section>
          </div>
        </div>
        )}
      </div>
    </PortalShell>
  );
}

function ProfileFieldSkeleton() {
  return (
    <div className="grid min-w-0 gap-2">
      <SkeletonBlock className="h-3.5 w-24 max-w-full rounded-full" />
      <SkeletonBlock className="h-12 w-full rounded-[0.875rem]" />
    </div>
  );
}

function AffiliateProfileSkeleton() {
  return (
    <div
      className="grid w-full min-w-0 items-start gap-3 sm:gap-4 lg:grid-cols-[minmax(15.5rem,18.75rem)_minmax(0,1fr)]"
      aria-busy="true"
      aria-label="Loading profile"
    >
      <aside className="min-w-0">
        <section className="flex min-w-0 flex-row items-center gap-3 rounded-2xl border border-[color:var(--dash-surface-border)] bg-white px-4 py-4 shadow-[0_8px_28px_rgba(20,38,68,0.06)] sm:gap-4 sm:px-5 lg:flex-col lg:items-center lg:px-4 lg:py-5">
          <SkeletonBlock className="h-16 w-16 shrink-0 rounded-full sm:h-20 sm:w-20 lg:h-24 lg:w-24" />
          <div className="flex min-w-0 flex-1 flex-col items-start gap-2 lg:w-full lg:items-center">
            <SkeletonBlock className="h-5 w-36 max-w-full rounded-full" />
            <SkeletonBlock className="h-3.5 w-48 max-w-full rounded-full" />
            <SkeletonBlock className="h-6 w-16 rounded-full" />
            <SkeletonBlock className="mt-1 h-10 w-full rounded-full sm:w-36" />
          </div>
        </section>
      </aside>
      <section className="min-w-0 rounded-2xl border border-[color:var(--dash-surface-border)] bg-white p-4 shadow-[0_8px_28px_rgba(20,38,68,0.06)] sm:p-5 md:p-6">
        <SkeletonBlock className="h-5 w-40 max-w-full rounded-full" />
        <SkeletonBlock className="mt-2 h-4 w-full max-w-md rounded-full" />
        <div className="mt-5 grid gap-3 sm:mt-6 sm:gap-4">
          <ProfileFieldSkeleton />
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
            <ProfileFieldSkeleton />
            <ProfileFieldSkeleton />
          </div>
          <ProfileFieldSkeleton />
          <ProfileFieldSkeleton />
          <div className="grid min-w-0 gap-3 md:grid-cols-2 md:gap-4">
            <ProfileFieldSkeleton />
            <ProfileFieldSkeleton />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
            <ProfileFieldSkeleton />
            <ProfileFieldSkeleton />
          </div>
          <SkeletonBlock className="h-16 w-full rounded-2xl" />
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <SkeletonBlock className="h-10 w-full rounded-full sm:w-24" />
            <SkeletonBlock className="h-10 w-full rounded-full sm:w-36" />
          </div>
        </div>
      </section>
    </div>
  );
}
