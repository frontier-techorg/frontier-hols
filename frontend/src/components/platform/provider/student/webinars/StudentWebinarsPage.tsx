"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { DirectorySearchBar, PaginationControls } from "@/components/platform/provider/admin/shared";
import { ProfileSelect } from "@/components/platform/provider/student/profile/ProfileSelect";
import { WebinarsPageSkeleton } from "@/components/platform/provider/student/DashboardSkeletons";
import { WebinarListPanel } from "@/components/platform/provider/student/webinars/WebinarListPanel";
import { WebinarsPageLayout } from "@/components/platform/provider/student/webinars/WebinarsPageLayout";
import { ApiRequestError } from "@/lib/integrate/client";
import type { AdminPaginationMeta } from "@/lib/integrate/provider/admin/users/types";
import { listWebinars, type WebinarSummary } from "@/lib/integrate/provider/student/webinars/api";
import { scrollAppToTopSoon } from "@/lib/scroll-to-top";

const PAGE_SIZE = 12;

const EMPTY_PAGINATION: AdminPaginationMeta = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  total_pages: 0,
  has_next: false,
  has_previous: false,
};

type StatusFilter = "all" | "open" | "booked";
type SortFilter = "newest" | "oldest";

export function StudentWebinarsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [webinars, setWebinars] = useState<WebinarSummary[]>([]);
  const [pagination, setPagination] = useState<AdminPaginationMeta>(EMPTY_PAGINATION);
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

  return (
    <WebinarsPageLayout>
      {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}

      <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <DirectorySearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search webinars…"
          label="Search webinars"
          className="mt-0 w-full min-w-0 sm:max-w-[22rem] sm:shrink-0"
        />
        <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-auto sm:items-center">
          <ProfileSelect
            id="student-webinar-status-filter"
            label="Filter webinars"
            hideLabel
            className="w-full sm:w-[9.75rem]"
            value={statusFilter}
            onChange={(value) =>
              setStatusFilter(value === "open" || value === "booked" ? value : "all")
            }
            options={[
              { value: "all", label: "All" },
              { value: "open", label: "Open" },
              { value: "booked", label: "Booked" },
            ]}
          />
          <ProfileSelect
            id="student-webinar-sort-filter"
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
        <WebinarsPageSkeleton hideToolbar />
      ) : emptyCatalog ? (
        <WebinarListPanel webinars={[]} />
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
          <WebinarListPanel webinars={webinars} />
          {pagination.total > 0 && (pagination.has_next || pagination.has_previous || pagination.total_pages > 1) ? (
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
    </WebinarsPageLayout>
  );
}
