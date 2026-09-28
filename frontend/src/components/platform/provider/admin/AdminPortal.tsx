"use client";

import { useState } from "react";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { DashboardPageLayout } from "@/components/platform/provider/admin/dashboard/DashboardPageLayout";
import { AdminDashboardCharts } from "@/components/platform/provider/charts/SalesOverviewCharts";
import { useAdminFinance } from "@/components/platform/provider/admin/finance/useAdminFinance";
import {
  CreateAffiliateDialog,
  type CreateAffiliateFormValues,
} from "@/components/platform/provider/admin/users/CreateAffiliateDialog";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { ApiRequestError } from "@/lib/integrate/client";
import { createAffiliate } from "@/lib/integrate/provider/admin/affiliates";
import { notifyAdminStatsChanged } from "@/lib/integrate/provider/notifications";
import { cn } from "@/lib/utils";

export function AdminPortal() {
  const { overview, loading, reload } = useAdminFinance();
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function openCreateDialog() {
    setDialogError(null);
    setError(null);
    setCreateOpen(true);
  }

  async function handleCreateAffiliate(values: CreateAffiliateFormValues) {
    setCreating(true);
    setDialogError(null);
    setSuccess(null);
    try {
      const data = await createAffiliate({
        first_name: values.first_name,
        last_name: values.last_name,
        email: values.email,
        password: values.password || undefined,
        margin_percent: Number(values.margin_percent),
        invitation_quota: values.invitation_quota ? Number(values.invitation_quota) : undefined,
      });
      setCreateOpen(false);
      setSuccess(
        data.credential_email_queued
          ? "Affiliate created and credential email queued."
          : "Affiliate created.",
      );
      notifyAdminStatsChanged();
      await reload();
    } catch (err) {
      setDialogError(err instanceof ApiRequestError ? err.message : "Could not create affiliate.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <DashboardPageLayout
      headerAction={
        <button
          type="button"
          aria-label="Add affiliate"
          onClick={openCreateDialog}
          className="dashboard-page-action dashboard-navy-btn font-sans inline-flex h-10 w-10 shrink-0 items-center justify-center gap-1.5 rounded-full px-0 text-sm font-medium text-white sm:w-auto sm:px-5"
        >
          <SidebarSvgIcon name="plus" size={15} strokeWidth={2.2} />
          <span className="hidden sm:inline">Add affiliate</span>
        </button>
      }
    >
      {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}
      {success ? <AuthAlert variant="success">{success}</AuthAlert> : null}

      <CreateAffiliateDialog
        open={createOpen}
        isSubmitting={creating}
        error={dialogError}
        onClose={() => {
          if (!creating) setCreateOpen(false);
        }}
        onSubmit={(values) => void handleCreateAffiliate(values)}
      />

      {loading ? <DashboardSkeleton /> : overview ? <AdminDashboardCharts overview={overview} /> : null}
    </DashboardPageLayout>
  );
}

function SkeletonBlock({ className }: { className?: string }) {
  return <span className={cn("dashboard-skeleton-block", className)} aria-hidden />;
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid min-w-0 grid-cols-3 gap-2.5 sm:gap-3" aria-busy="true" aria-label="Loading dashboard">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={`count-${index}`} className="dashboard-glass-card min-w-0 rounded-2xl px-2.5 py-2.5 sm:px-3.5 sm:py-3 md:px-4 md:py-4">
            <SkeletonBlock className="h-3 w-12 rounded-full sm:w-16" />
            <SkeletonBlock className="mt-2 h-6 w-8 rounded-full sm:w-12" />
          </div>
        ))}
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-2.5 md:grid-cols-4 sm:gap-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={`revenue-${index}`} className="dashboard-glass-card min-w-0 rounded-2xl px-2.5 py-2.5 sm:px-3.5 sm:py-3 md:px-4 md:py-4">
            <SkeletonBlock className="h-3 w-16 rounded-full" />
            <SkeletonBlock className="mt-2 h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-2.5 md:grid-cols-4 sm:gap-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={`payout-${index}`} className="dashboard-glass-card min-w-0 rounded-2xl px-2.5 py-2.5 sm:px-3.5 sm:py-3 md:px-4 md:py-4">
            <SkeletonBlock className="h-3 w-16 rounded-full" />
            <SkeletonBlock className="mt-2 h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
      <div className="grid min-w-0 gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
          <section className="dashboard-glass-card rounded-2xl p-3.5 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <SkeletonBlock className="h-5 w-36 rounded-full" />
              <SkeletonBlock className="h-10 w-full rounded-full sm:w-48" />
            </div>
            <SkeletonBlock className="mt-5 h-40 w-full rounded-2xl sm:h-52" />
          </section>
          <section className="dashboard-glass-card rounded-2xl p-3.5 sm:p-5">
            <SkeletonBlock className="h-5 w-32 rounded-full" />
            <div className="mt-4 space-y-2">
              {Array.from({ length: 4 }, (_, index) => (
                <SkeletonBlock key={index} className="h-12 w-full rounded-xl" />
              ))}
            </div>
          </section>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-1">
          {Array.from({ length: 3 }, (_, index) => (
            <section key={`pie-${index}`} className="dashboard-glass-card rounded-2xl p-3.5 sm:p-5">
              <SkeletonBlock className="h-4 w-20 rounded-full" />
              <SkeletonBlock className="mx-auto mt-4 h-36 w-36 rounded-full sm:h-44 sm:w-44" />
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
