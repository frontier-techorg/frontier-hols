"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { Button } from "@/components/ui/Button";
import { ProfileSelect } from "@/components/platform/provider/student/profile/ProfileSelect";
import { SkeletonBlock } from "@/components/platform/provider/student/DashboardSkeletons";
import {
  DEFAULT_COUNTRY_CODE,
  MANUAL_VALUE,
  US_STATES,
  getCitiesForState,
  resolveCitySelection,
  resolveStateSelection,
} from "@/content/locations/us";
import { ApiRequestError } from "@/lib/integrate/client";
import { getStoredUser, updateStoredProfile } from "@/lib/integrate/auth/storage";
import {
  getCachedStudentProfile,
  getStudentProfile,
  updateStudentProfile,
  type StudentAddress,
  type StudentProfile,
  type StudentProfileUpdate,
} from "@/lib/integrate/provider/student/profile/api";
import { cn } from "@/lib/utils";

type ProfileFormState = {
  first_name: string;
  last_name: string;
  marketing_pref: boolean;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
};

type LocationUiState = {
  stateSelect: string;
  stateManual: string;
  citySelect: string;
  cityManual: string;
};

function emptyForm(): ProfileFormState {
  return {
    first_name: "",
    last_name: "",
    marketing_pref: false,
    line1: "",
    line2: "",
    city: "",
    state: "",
    postal_code: "",
    country: DEFAULT_COUNTRY_CODE,
  };
}

function profileToForm(profile: StudentProfile): ProfileFormState {
  return {
    first_name: profile.first_name ?? "",
    last_name: profile.last_name ?? "",
    marketing_pref: Boolean(profile.marketing_pref),
    line1: profile.address?.line1 ?? "",
    line2: profile.address?.line2 ?? "",
    city: profile.address?.city ?? "",
    state: profile.address?.state ?? "",
    postal_code: profile.address?.postal_code ?? "",
    country: DEFAULT_COUNTRY_CODE,
  };
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

function mergeLocationIntoForm(form: ProfileFormState, location: LocationUiState): ProfileFormState {
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

function buildAddress(form: ProfileFormState): StudentAddress | undefined {
  const line1 = form.line1.trim();
  const city = form.city.trim();
  if (!line1 || !city) return undefined;

  return {
    line1,
    line2: form.line2.trim() || undefined,
    city,
    state: form.state.trim() || undefined,
    postal_code: form.postal_code.trim() || undefined,
    country: DEFAULT_COUNTRY_CODE,
  };
}

function buildChangedPayload(
  form: ProfileFormState,
  baseline: ProfileFormState,
): StudentProfileUpdate {
  const payload: StudentProfileUpdate = {};

  if (form.first_name.trim() !== baseline.first_name.trim()) {
    payload.first_name = form.first_name.trim();
  }
  if (form.last_name.trim() !== baseline.last_name.trim()) {
    payload.last_name = form.last_name.trim();
  }
  if (form.marketing_pref !== baseline.marketing_pref) {
    payload.marketing_pref = form.marketing_pref;
  }

  const nextAddress = buildAddress(form);
  const prevAddress = buildAddress(baseline);
  if (JSON.stringify(nextAddress ?? null) !== JSON.stringify(prevAddress ?? null)) {
    if (nextAddress) payload.address = nextAddress;
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
        className={cn(
          "dashboard-field min-w-0 max-w-full",
          disabled && "cursor-not-allowed truncate opacity-70",
        )}
      />
    </div>
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

function ProfileSettingsSkeleton() {
  return (
    <section
      className="min-w-0 rounded-2xl border border-[color:var(--dash-surface-border)] bg-white p-4 shadow-[0_8px_28px_rgba(20,38,68,0.06)] sm:p-5 md:p-6"
      aria-busy="true"
      aria-label="Loading profile"
    >
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
  );
}

export function SettingsProfilePanel({
  onProfileChange,
}: {
  onProfileChange?: (profile: StudentProfile) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [baseline, setBaseline] = useState<ProfileFormState>(emptyForm);
  const [form, setForm] = useState<ProfileFormState>(emptyForm);
  const [location, setLocation] = useState<LocationUiState>(() => toLocationUi(emptyForm()));
  const onProfileChangeRef = useRef(onProfileChange);
  onProfileChangeRef.current = onProfileChange;

  const applyProfile = useCallback((next: StudentProfile) => {
    const nextForm = profileToForm(next);
    setProfile(next);
    setBaseline(nextForm);
    setForm(nextForm);
    setLocation(toLocationUi(nextForm));
    updateStoredProfile(next as unknown as Record<string, unknown>);
    onProfileChangeRef.current?.(next);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const cached =
      (getCachedStudentProfile()?.profile as StudentProfile | undefined) ?? storedProfileFallback();

    if (cached) {
      applyProfile(cached);
    }

    async function load() {
      setError(null);
      try {
        const data = await getStudentProfile(controller.signal);
        if (controller.signal.aborted) return;
        applyProfile(data.profile as StudentProfile);
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

  const composedForm = useMemo(() => mergeLocationIntoForm(form, location), [form, location]);
  const dirtyPayload = useMemo(
    () => buildChangedPayload(composedForm, baseline),
    [composedForm, baseline],
  );
  const hasChanges = Object.keys(dirtyPayload).length > 0;

  const usCities = useMemo(() => {
    if (location.stateSelect && location.stateSelect !== MANUAL_VALUE) {
      return getCitiesForState(location.stateSelect);
    }
    return [];
  }, [location.stateSelect]);

  function resetForm() {
    setForm(baseline);
    setLocation(toLocationUi(baseline));
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
      const data = await updateStudentProfile(dirtyPayload);
      applyProfile(data.profile as StudentProfile);
      setSuccess("Profile updated.");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not update profile.");
    } finally {
      setSaving(false);
    }
  }

  if (!profile) {
    return <ProfileSettingsSkeleton />;
  }

  return (
    <section className="min-w-0 rounded-2xl border border-[color:var(--dash-surface-border)] bg-white p-4 shadow-[0_8px_28px_rgba(20,38,68,0.06)] sm:p-5 md:p-6">
      <h2 className="font-sans text-base font-semibold tracking-[0.005em] text-[color:var(--dash-text)] sm:text-lg">
        Profile information
      </h2>
      <p className="text-brand-body mt-1 text-sm text-[color:var(--dash-muted)] sm:text-base">
        Keep your account details current for membership and course access.
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
              ...US_STATES.map((state) => ({
                value: state.code,
                label: state.name,
              })),
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
                ...usCities.map((city) => ({
                  value: city,
                  label: city,
                })),
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
              Occasional news about courses and membership.
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
  );
}
