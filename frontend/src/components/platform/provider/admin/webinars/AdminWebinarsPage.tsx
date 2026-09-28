"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { Icon, Menu } from "@/components/icons";
import { PortalShell } from "@/components/platform/provider/PortalShell";
import { DirectorySearchBar, PaginationControls } from "@/components/platform/provider/admin/shared";
import { ProfileSelect } from "@/components/platform/provider/student/profile/ProfileSelect";
import { Button } from "@/components/ui/Button";
import {
  CreateWebinarDialog,
  type CreateWebinarFormValues,
} from "@/components/platform/provider/admin/webinars/CreateWebinarDialog";
import { adminNav } from "@/components/platform/provider/admin/adminNav";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { ApiRequestError } from "@/lib/integrate/client";
import {
  createWebinar,
  listWebinars,
  updateWebinar,
  uploadWebinarThumbnail,
  type WebinarSummary,
} from "@/lib/integrate/provider/student/webinars/api";
import type { AdminPaginationMeta } from "@/lib/integrate/provider/admin/users/types";
import { scrollAppToTopSoon } from "@/lib/scroll-to-top";
import { formatWebinarWhen } from "@/lib/integrate/provider/student/webinars/types";
import { formatMoney } from "@/lib/integrate/provider/student/payment/types";

function openSidebar() {
  window.dispatchEvent(new Event("hols-portal-open-sidebar"));
}

type StatusFilter = "all" | "published" | "draft" | "cancelled" | "completed";
type SortFilter = "newest" | "oldest";

const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "cancelled", label: "Cancelled" },
  { value: "completed", label: "Completed" },
];

const PAGE_SIZE = 12;

const EMPTY_PAGINATION: AdminPaginationMeta = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  total_pages: 0,
  has_next: false,
  has_previous: false,
};

function priceLabel(webinar: WebinarSummary) {
  return webinar.price > 0 ? formatMoney(webinar.price, webinar.currency) : "Free";
}

export function AdminWebinarsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [webinars, setWebinars] = useState<WebinarSummary[]>([]);
  const [pagination, setPagination] = useState<AdminPaginationMeta>(EMPTY_PAGINATION);
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortFilter>("newest");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(searchQuery.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, statusFilter, sort]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listWebinars({
        page,
        limit: PAGE_SIZE,
        q: debouncedQuery || undefined,
        status: statusFilter,
        sort,
      });
      setWebinars(data.items);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to load webinars.");
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, page, sort, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const emptyCatalog = !loading && pagination.total === 0 && !debouncedQuery && statusFilter === "all";
  const noMatches = !loading && webinars.length === 0 && !emptyCatalog;

  function openCreateDialog() {
    setDialogError(null);
    setError(null);
    setCreateOpen(true);
  }

  async function handleCreate(values: CreateWebinarFormValues) {
    setSaving(true);
    setDialogError(null);
    setSuccess(null);
    try {
      const created = await createWebinar({
        title: values.title,
        description: values.description,
        starts_at: values.starts_at,
        price: values.price,
        capacity: values.capacity,
        join_url: values.join_url,
        status: values.status,
      });
      try {
        await uploadWebinarThumbnail(created.webinar.webinar_id, values.coverFile);
        setSuccess("Webinar created.");
      } catch (thumbErr) {
        setSuccess(null);
        setError(
          thumbErr instanceof ApiRequestError
            ? `Webinar created, but cover upload failed: ${thumbErr.message}`
            : "Webinar created, but cover upload failed. Open Manage to add the cover.",
        );
      }
      setCreateOpen(false);
      setPage(1);
      await load();
    } catch (err) {
      setDialogError(
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not create webinar.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish(webinar: WebinarSummary) {
    const nextStatus = webinar.status === "published" ? "draft" : "published";
    setError(null);
    try {
      await updateWebinar(webinar.webinar_id, { status: nextStatus });
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not update webinar.");
    }
  }

  return (
    <PortalShell
      role="admin"
      title="Webinars"
      showPageHeader={false}
      contentFlush
      brandBackdrop
      nav={adminNav}
    >
      <div className="dashboard-screen lectures-page webinars-page min-w-0 overflow-x-hidden">
        <header className="mb-4 flex min-h-10 min-w-0 items-center gap-2 sm:mb-5 sm:min-h-12 sm:gap-3 md:gap-4">
          <button
            type="button"
            aria-label="Open sidebar"
            onClick={openSidebar}
            className="dashboard-icon-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-full lg:hidden sm:h-12 sm:w-12"
          >
            <Icon icon={Menu} size={18} />
          </button>
          <h1 className="font-sans min-w-0 flex-1 truncate text-lg font-bold leading-none tracking-[0.01em] text-[color:var(--dash-text)] sm:text-xl md:text-2xl">
            Webinars
          </h1>
          <Button
            type="button"
            onClick={openCreateDialog}
            className="lecture-page-action h-10 w-10 min-h-10 shrink-0 px-0 sm:w-auto sm:px-4"
          >
            <SidebarSvgIcon name="plus" size={15} strokeWidth={2.2} />
            <span className="hidden sm:inline">New webinar</span>
          </Button>
        </header>

        <div className="grid w-full min-w-0 gap-3 sm:gap-4">
          {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}
          {success ? <AuthAlert variant="success">{success}</AuthAlert> : null}

          <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <DirectorySearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search by title or join link…"
              label="Search webinars"
              className="mt-0 w-full min-w-0 sm:max-w-[22rem] sm:shrink-0"
            />
            <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-auto sm:items-center">
              <ProfileSelect
                id="webinar-status-filter"
                label="Filter webinars"
                hideLabel
                className="w-full sm:w-[9.75rem]"
                value={statusFilter}
                onChange={(value) => setStatusFilter(value as StatusFilter)}
                options={STATUS_FILTER_OPTIONS}
              />
              <ProfileSelect
                id="webinar-sort-filter"
                label="Sort webinars"
                hideLabel
                className="w-full sm:w-[9.75rem]"
                value={sort}
                onChange={(value) => setSort(value === "oldest" ? "oldest" : "newest")}
                options={[
                  { value: "newest", label: "Newest" },
                  { value: "oldest", label: "Oldest" },
                ]}
              />
            </div>
          </div>

          {loading ? (
            <WebinarCatalogSkeleton />
          ) : emptyCatalog ? (
            <section className="dashboard-glass-card flex flex-col items-center rounded-2xl px-5 py-12 text-center sm:py-14">
              <span className="dashboard-tool-icon flex h-14 w-14 items-center justify-center rounded-full text-[color:var(--dash-text)]">
                <SidebarSvgIcon name="webinars" size={22} strokeWidth={1.85} />
              </span>
              <p className="font-sans mt-4 text-base font-semibold text-[color:var(--dash-text)] sm:text-lg">
                No webinars yet
              </p>
              <p className="text-brand-body mt-1.5 max-w-sm text-[color:var(--dash-muted)]">
                Create a session with a cover image and join link so students can find and book it.
              </p>
              <Button type="button" onClick={openCreateDialog} className="lecture-page-action mt-4 px-5">
                Create first webinar
              </Button>
            </section>
          ) : noMatches ? (
            <section className="dashboard-glass-card rounded-2xl px-5 py-12 text-center">
              <p className="font-sans text-sm font-semibold text-[color:var(--dash-text)]">
                No matching webinars
              </p>
              <p className="text-brand-caption mt-1 text-[color:var(--dash-faint)]">
                Try another search or switch the filter.
              </p>
            </section>
          ) : (
            <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
              {webinars.map((webinar) => (
                <article
                  key={webinar.webinar_id}
                  className="dashboard-glass-card flex min-w-0 flex-col overflow-hidden rounded-2xl"
                >
                  <div className="relative aspect-[16/9] w-full overflow-hidden bg-[color:var(--dash-soft)]">
                    {webinar.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={webinar.thumbnail_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-4 text-center">
                        <SidebarSvgIcon name="webinars" size={22} strokeWidth={1.85} />
                        <p className="text-brand-caption font-semibold text-[color:var(--dash-faint)]">
                          Missing cover
                        </p>
                      </div>
                    )}
                    <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-brand-caption font-semibold capitalize text-white">
                      {webinar.status}
                    </span>
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
                    <div className="min-w-0">
                      <h2 className="font-sans line-clamp-2 text-base font-bold tracking-[0.01em] text-[color:var(--dash-text)]">
                        {webinar.title}
                      </h2>
                      <p className="text-brand-caption mt-1.5 text-[color:var(--dash-muted)]">
                        {formatWebinarWhen(webinar.starts_at)}
                      </p>
                      <p className="text-brand-caption mt-1 text-[color:var(--dash-faint)]">
                        {priceLabel(webinar)}
                        {" · "}
                        {webinar.seats_taken}/{webinar.capacity} booked
                      </p>
                      {webinar.join_url ? (
                        <p className="text-brand-caption mt-1.5 truncate text-[color:var(--dash-muted)]" title={webinar.join_url}>
                          {webinar.join_url}
                        </p>
                      ) : (
                        <p className="text-brand-caption mt-1.5 font-medium text-red-600">
                          Join link missing
                        </p>
                      )}
                    </div>

                    <div className="mt-auto flex min-w-0 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void togglePublish(webinar)}
                        className="lecture-page-action dashboard-pill-soft font-sans inline-flex h-10 min-h-10 flex-1 items-center justify-center rounded-full px-4 text-sm font-medium"
                      >
                        {webinar.status === "published" ? "Unpublish" : "Publish"}
                      </button>
                      <Button
                        href={`/admin/webinars/${encodeURIComponent(webinar.webinar_id)}`}
                        className="lecture-page-action flex-1 px-4"
                      >
                        Manage
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {(pagination.has_next || pagination.has_previous || pagination.total_pages > 1) ? (
              <PaginationControls
                appearance="lecture"
                page={pagination.page}
                pageCount={Math.max(1, pagination.total_pages || Math.ceil(pagination.total / PAGE_SIZE))}
                hasNext={pagination.has_next}
                hasPrevious={pagination.has_previous}
                total={pagination.total}
                loading={loading}
                onPrevious={() => {
                  scrollAppToTopSoon();
                  setPage((current) => Math.max(1, current - 1));
                }}
                onNext={() => {
                  scrollAppToTopSoon();
                  setPage((current) => current + 1);
                }}
              />
            ) : null}
            </>
          )}
        </div>
      </div>

      <CreateWebinarDialog
        open={createOpen}
        isSubmitting={saving}
        error={dialogError}
        onClose={() => {
          if (!saving) setCreateOpen(false);
        }}
        onSubmit={(values) => void handleCreate(values)}
      />
    </PortalShell>
  );
}

function WebinarCatalogSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3"
      aria-busy="true"
      aria-label="Loading webinars"
    >
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="dashboard-glass-card flex min-w-0 flex-col overflow-hidden rounded-2xl">
          <span className="dashboard-skeleton-block block aspect-[16/9] w-full rounded-none" />
          <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
            <div className="min-w-0 space-y-2">
              <span className="dashboard-skeleton-block block h-5 w-4/5 max-w-full rounded-full" />
              <span className="dashboard-skeleton-block block h-3.5 w-1/2 max-w-full rounded-full" />
              <span className="dashboard-skeleton-block block h-3 w-2/3 max-w-full rounded-full" />
              <span className="dashboard-skeleton-block block h-3 w-full rounded-full" />
            </div>
            <div className="mt-auto flex min-w-0 gap-2">
              <span className="dashboard-skeleton-block h-10 min-w-0 flex-1 rounded-full" />
              <span className="dashboard-skeleton-block h-10 min-w-0 flex-1 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
