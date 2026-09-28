"use client";

import { useEffect, useState } from "react";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { Button } from "@/components/ui/Button";
import { SkeletonBlock } from "@/components/platform/provider/student/DashboardSkeletons";
import { ApiRequestError } from "@/lib/integrate/client";
import {
  getPayoutSettings,
  updatePayoutSettings,
} from "@/lib/integrate/provider/admin/affiliates/payoutSettings";

export function AdminSettingsPayoutPanel() {
  const [lockDaysDraft, setLockDaysDraft] = useState("7");
  const [lockDaysSaved, setLockDaysSaved] = useState(7);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void getPayoutSettings(controller.signal)
      .then((settings) => {
        if (controller.signal.aborted) return;
        setLockDaysSaved(settings.payout_lock_days);
        setLockDaysDraft(String(settings.payout_lock_days));
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof ApiRequestError ? err.message : "Failed to load payout hold.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const trimmed = lockDaysDraft.trim();
  const days = Number(trimmed);
  const valid = trimmed !== "" && Number.isInteger(days) && days >= 0 && days <= 365;
  const hasChanges = valid && days !== lockDaysSaved;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) {
      setError("Payout hold must be a whole number between 0 and 365 days.");
      setSuccess(null);
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const settings = await updatePayoutSettings(days);
      setLockDaysSaved(settings.payout_lock_days);
      setLockDaysDraft(String(settings.payout_lock_days));
      setSuccess(
        settings.payout_lock_days === 0
          ? "New commission is now available immediately."
          : `New commission will stay locked for ${settings.payout_lock_days} day${settings.payout_lock_days === 1 ? "" : "s"}.`,
      );
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not update payout hold.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="min-w-0 rounded-2xl border border-[color:var(--dash-surface-border)] bg-white p-4 shadow-[0_8px_28px_rgba(20,38,68,0.06)] sm:p-5 md:p-6">
      <h2 className="font-sans text-base font-semibold tracking-[0.005em] text-[color:var(--dash-text)] sm:text-lg">
        Payout hold
      </h2>
      <p className="text-brand-body mt-1 text-sm text-[color:var(--dash-muted)] sm:text-base">
        New affiliate commission is held in lock. After this many days, an hourly check moves it
        into available for payout. Set 0 to make it available immediately. Existing locked
        commissions keep their original release time.
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

      {loading ? (
        <div className="mt-5 grid gap-3 sm:mt-6 sm:gap-4" aria-busy="true" aria-label="Loading payout hold">
          <div className="grid min-w-0 gap-2">
            <SkeletonBlock className="h-3 w-48 max-w-full rounded-full" />
            <SkeletonBlock className="h-11 w-full rounded-2xl" />
            <SkeletonBlock className="h-3 w-32 max-w-full rounded-full" />
          </div>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <SkeletonBlock className="h-10 w-full rounded-full sm:w-24" />
            <SkeletonBlock className="h-10 w-full rounded-full sm:w-36" />
          </div>
        </div>
      ) : (
      <form className="mt-5 grid gap-3 sm:mt-6 sm:gap-4" onSubmit={handleSubmit}>
        <div className="grid min-w-0 gap-2">
          <label htmlFor="payout-hold-days" className="dashboard-field-label">
            Days before payout is available
          </label>
          <input
            id="payout-hold-days"
            type="number"
            min={0}
            max={365}
            value={lockDaysDraft}
            disabled={loading || saving}
            onChange={(event) => setLockDaysDraft(event.target.value)}
            className="dashboard-field w-full min-w-0"
          />
          <p className="text-brand-caption text-[color:var(--dash-faint)]">
            Currently {lockDaysSaved} day{lockDaysSaved === 1 ? "" : "s"}.
          </p>
        </div>

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-2.5">
          <button
            type="button"
            onClick={() => {
              setLockDaysDraft(String(lockDaysSaved));
              setError(null);
              setSuccess(null);
            }}
            disabled={!hasChanges || saving || loading}
            className="lecture-page-action dashboard-navy-btn font-sans inline-flex h-10 w-full items-center justify-center rounded-full px-5 text-sm font-medium text-white disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
          >
            Cancel
          </button>
          <Button
            type="submit"
            disabled={saving || loading || !hasChanges}
            className="lecture-page-action h-10 w-full px-5 py-0 text-sm sm:w-auto sm:min-w-[9rem]"
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
      )}
    </section>
  );
}
