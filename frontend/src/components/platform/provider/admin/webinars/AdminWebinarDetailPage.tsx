"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { Icon, Menu } from "@/components/icons";
import { PortalShell } from "@/components/platform/provider/PortalShell";
import { PaginationControls } from "@/components/platform/provider/admin/shared";
import { adminNav } from "@/components/platform/provider/admin/adminNav";
import { ProfileSelect } from "@/components/platform/provider/student/profile/ProfileSelect";
import { Button } from "@/components/ui/Button";
import {
  WebinarCoverPicker,
  WebinarDateTimeField,
} from "@/components/platform/provider/admin/webinars/WebinarCoverPicker";
import {
  WEBINAR_STATUS_OPTIONS,
  isValidJoinUrl,
  isWebinarStatus,
  normalizeJoinUrl,
  toLocalInputValue,
  type WebinarStatus,
} from "@/components/platform/provider/admin/webinars/webinarForm";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { ApiRequestError } from "@/lib/integrate/client";
import {
  getWebinar,
  listWebinarRegistrants,
  updateWebinar,
  uploadWebinarThumbnail,
  type WebinarRegistration,
  type WebinarSummary,
} from "@/lib/integrate/provider/student/webinars/api";
import { formatWebinarWhen } from "@/lib/integrate/provider/student/webinars/types";
import { formatDate, formatMoney } from "@/lib/integrate/provider/student/payment/types";
import type { AdminPaginationMeta } from "@/lib/integrate/provider/admin/users/types";
import { scrollAppToTopSoon } from "@/lib/scroll-to-top";

function openSidebar() {
  window.dispatchEvent(new Event("hols-portal-open-sidebar"));
}

const REGISTRANTS_PAGE_SIZE = 10;

const EMPTY_REGISTRANT_PAGINATION: AdminPaginationMeta = {
  page: 1,
  limit: REGISTRANTS_PAGE_SIZE,
  total: 0,
  total_pages: 0,
  has_next: false,
  has_previous: false,
};

function registrantName(item: WebinarRegistration) {
  const full = [item.first_name, item.last_name].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (item.email) return item.email;
  return `Student ${item.user_id.slice(0, 8)}…`;
}

export function AdminWebinarDetailPage({ webinarId }: { webinarId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [webinar, setWebinar] = useState<WebinarSummary | null>(null);
  const [registrants, setRegistrants] = useState<WebinarRegistration[]>([]);
  const [registrantPage, setRegistrantPage] = useState(1);
  const [registrantPagination, setRegistrantPagination] = useState<AdminPaginationMeta>(
    EMPTY_REGISTRANT_PAGINATION,
  );
  const [registrantsLoading, setRegistrantsLoading] = useState(false);
  const [joinUrl, setJoinUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [status, setStatus] = useState<WebinarStatus>("published");
  const [price, setPrice] = useState("0");
  const [capacity, setCapacity] = useState("100");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [joinTouched, setJoinTouched] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const detail = await getWebinar(webinarId);
      setWebinar(detail.webinar);
      setTitle(detail.webinar.title);
      setDescription(detail.webinar.description ?? "");
      setStartsAt(toLocalInputValue(detail.webinar.starts_at));
      setStatus(isWebinarStatus(detail.webinar.status) ? detail.webinar.status : "published");
      setJoinUrl(detail.webinar.join_url ?? "");
      setPrice(String(detail.webinar.price ?? 0));
      setCapacity(String(detail.webinar.capacity ?? 100));
      setCoverFile(null);
      setCoverError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to load webinar.");
    } finally {
      setLoading(false);
    }
  }, [webinarId]);

  const loadRegistrants = useCallback(async () => {
    setRegistrantsLoading(true);
    try {
      const regs = await listWebinarRegistrants(webinarId, {
        page: registrantPage,
        limit: REGISTRANTS_PAGE_SIZE,
      });
      setRegistrants(regs.items);
      setRegistrantPagination(regs.pagination);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to load registrants.");
    } finally {
      setRegistrantsLoading(false);
    }
  }, [registrantPage, webinarId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRegistrants(), 0);
    return () => window.clearTimeout(timer);
  }, [loadRegistrants]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const cleanedJoinUrl = normalizeJoinUrl(joinUrl);
      const capacityRaw = capacity.trim();
      const capacityValue = Number(capacityRaw);
      const nextTitle = title.trim();
      const startsAtDate = new Date(startsAt);
      const originalStartsAt = toLocalInputValue(webinar?.starts_at);

      if (!nextTitle) {
        throw new Error("Title is required.");
      }
      if (!isValidJoinUrl(joinUrl)) {
        setJoinTouched(true);
        throw new Error("Join link is required.");
      }
      if (coverFile && coverError) {
        throw new Error(coverError);
      }
      if (!webinar?.thumbnail_url && !coverFile) {
        setCoverError("Cover image is required.");
        throw new Error("Cover image is required.");
      }
      if (!capacityRaw || !Number.isInteger(capacityValue) || capacityValue < 1) {
        throw new Error("Capacity must be a whole number of at least 1.");
      }
      if (!Number.isFinite(startsAtDate.getTime())) {
        throw new Error("Start time is required.");
      }
      if (startsAt !== originalStartsAt && startsAtDate.getTime() <= Date.now()) {
        throw new Error("Start time must be in the future.");
      }

      if (coverFile) {
        setUploadingThumb(true);
        const thumb = await uploadWebinarThumbnail(webinarId, coverFile);
        setWebinar(thumb.webinar);
        setCoverFile(null);
        setCoverError(null);
        setUploadingThumb(false);
      }

      const data = await updateWebinar(webinarId, {
        title: nextTitle,
        description: description.trim(),
        join_url: cleanedJoinUrl,
        price: Number(price) || 0,
        capacity: capacityValue,
        status,
        ...(startsAt !== originalStartsAt ? { starts_at: startsAtDate.toISOString() } : {}),
      });
      setWebinar(data.webinar);
      setTitle(data.webinar.title);
      setDescription(data.webinar.description ?? "");
      setStartsAt(toLocalInputValue(data.webinar.starts_at));
      setStatus(isWebinarStatus(data.webinar.status) ? data.webinar.status : status);
      setJoinUrl(data.webinar.join_url ?? cleanedJoinUrl);
      setSuccess("Webinar updated.");
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not update webinar.",
      );
    } finally {
      setUploadingThumb(false);
      setSaving(false);
    }
  }

  const joinValid = isValidJoinUrl(joinUrl);

  return (
    <PortalShell
      role="admin"
      title="Webinar detail"
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
          <Link
            href="/admin/webinars"
            aria-label="Back to webinars"
            className="webinar-back-btn flex h-10 w-8 shrink-0 items-center justify-center rounded-full no-underline"
          >
            <SidebarSvgIcon name="back" size={32} className="webinar-back-mark" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-sans min-w-0 truncate text-lg font-bold leading-none tracking-[0.01em] text-[color:var(--dash-text)] sm:text-xl md:text-2xl">
              {webinar?.title || "Webinar"}
            </h1>
            {webinar ? (
              <p className="text-brand-caption mt-1 truncate text-[color:var(--dash-faint)]">
                {formatWebinarWhen(webinar.starts_at)}
                {" · "}
                {webinar.seats_taken}/{webinar.capacity} booked
                {" · "}
                {webinar.price > 0 ? formatMoney(webinar.price, webinar.currency) : "Free"}
              </p>
            ) : null}
          </div>
        </header>

        <div className="grid w-full min-w-0 gap-3 sm:gap-4">
          {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}
          {success ? <AuthAlert variant="success">{success}</AuthAlert> : null}

          {loading ? (
            <WebinarDetailSkeleton />
          ) : !webinar ? (
            <div className="dashboard-glass-card rounded-2xl p-10 text-center text-[color:var(--dash-faint)]">
              Webinar not found.
            </div>
          ) : (
            <>
              <section className="dashboard-glass-card rounded-2xl p-4 sm:p-6">
                <h3 className="font-sans text-base font-semibold text-[color:var(--dash-text)]">
                  Settings
                </h3>
                <form className="mt-4 grid gap-4" onSubmit={handleSave}>
                  <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(13rem,16rem)_minmax(0,1fr)] md:items-start">
                    <WebinarCoverPicker
                      file={coverFile}
                      existingUrl={webinar.thumbnail_url}
                      disabled={saving || uploadingThumb}
                      error={coverError}
                      dropzoneClassName="!max-w-none h-36 sm:h-40 md:h-[11.5rem]"
                      onFileChange={(next, nextError) => {
                        setCoverFile(next);
                        setCoverError(nextError);
                      }}
                    />
                    <div className="grid min-w-0 gap-4">
                      <label className="grid gap-2">
                        <span className="dashboard-field-label">
                          Title
                          <span className="text-red-600" aria-hidden>
                            {" "}
                            *
                          </span>
                        </span>
                        <input
                          type="text"
                          required
                          value={title}
                          onChange={(event) => setTitle(event.target.value)}
                          className="dashboard-field"
                        />
                      </label>
                      <div className="grid min-w-0 gap-3">
                        <WebinarDateTimeField
                          required
                          label="Starts at"
                          disabled={saving || uploadingThumb}
                          value={startsAt}
                          onChange={setStartsAt}
                        />
                        <ProfileSelect
                          id="admin-webinar-status"
                          label="Status"
                          value={status}
                          disabled={saving || uploadingThumb}
                          onChange={(value) => {
                            if (isWebinarStatus(value)) setStatus(value);
                          }}
                          options={[...WEBINAR_STATUS_OPTIONS]}
                        />
                      </div>
                    </div>
                  </div>
                  <label className="grid gap-2">
                    <span className="dashboard-field-label">Description</span>
                    <textarea
                      value={description}
                      rows={3}
                      disabled={saving || uploadingThumb}
                      onChange={(event) => setDescription(event.target.value)}
                      className="dashboard-field min-h-[6rem] resize-y"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="dashboard-field-label">
                      Join link
                      <span className="text-red-600" aria-hidden>
                        {" "}
                        *
                      </span>
                    </span>
                    <input
                      type="text"
                      inputMode="url"
                      autoComplete="url"
                      required
                      value={joinUrl}
                      placeholder="https://zoom.us/j/..."
                      aria-invalid={joinTouched && !joinValid}
                      onBlur={() => setJoinTouched(true)}
                      onChange={(event) => setJoinUrl(event.target.value)}
                      className="dashboard-field"
                    />
                    {joinTouched && !joinValid ? (
                      <span className="text-brand-caption font-medium text-red-600">
                        Enter a valid https join link.
                      </span>
                    ) : (
                      <span className="text-brand-caption text-[color:var(--dash-faint)]">
                        Required. Students use this to join live.
                      </span>
                    )}
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="dashboard-field-label">Price</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={price}
                        onChange={(event) => setPrice(event.target.value)}
                        className="dashboard-field adviser-number-field"
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="dashboard-field-label">Capacity</span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={capacity}
                        onChange={(event) => setCapacity(event.target.value)}
                        className="dashboard-field adviser-number-field"
                      />
                    </label>
                  </div>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2.5">
                    <Link
                      href="/admin/webinars"
                      className="lecture-page-action dashboard-pill-soft font-sans inline-flex h-10 min-h-10 w-full items-center justify-center rounded-full px-5 text-sm font-medium sm:w-auto"
                    >
                      Back
                    </Link>
                    <Button
                      type="submit"
                      disabled={saving || uploadingThumb}
                      className="lecture-page-action w-full px-5 sm:w-auto"
                    >
                      {saving || uploadingThumb ? "Saving…" : "Save changes"}
                    </Button>
                  </div>
                </form>
              </section>

              <section className="dashboard-glass-card rounded-2xl p-4 sm:p-6">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <h3 className="font-sans text-base font-semibold text-[color:var(--dash-text)]">
                    Registrants
                  </h3>
                  <p className="text-brand-caption text-[color:var(--dash-faint)]">
                    {registrantPagination.total} total
                  </p>
                </div>
                <div className="mt-4 grid min-w-0 gap-2.5">
                  {registrantsLoading && registrants.length === 0 ? (
                    <RegistrantListSkeleton />
                  ) : registrants.length === 0 ? (
                    <p className="text-brand-body py-6 text-center text-[color:var(--dash-faint)]">
                      No bookings yet.
                    </p>
                  ) : (
                    registrants.map((item) => (
                      <article
                        key={`${item.user_id}-${item.order_id ?? item.created_at}`}
                        className="flex min-w-0 flex-col gap-3 rounded-2xl bg-[color:var(--dash-soft)]/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 overflow-hidden">
                          <p className="font-sans truncate text-sm font-semibold text-[color:var(--dash-text)]">
                            {registrantName(item)}
                          </p>
                          <p className="text-brand-caption mt-0.5 truncate text-[color:var(--dash-faint)]">
                            {item.created_at ? formatDate(item.created_at) : "—"}
                            {" · "}
                            {formatMoney(item.amount, item.currency)}
                          </p>
                        </div>
                        <Button
                          href={`/admin/users/${encodeURIComponent(item.user_id)}?from=webinar&webinar=${encodeURIComponent(webinarId)}`}
                          className="lecture-page-action w-full shrink-0 px-4 sm:w-auto"
                        >
                          View profile
                          <SidebarSvgIcon name="next" size={16} strokeWidth={2.2} />
                        </Button>
                      </article>
                    ))
                  )}
                </div>
                {(registrantPagination.has_next || registrantPagination.has_previous || registrantPagination.page > 1) ? (
                  <PaginationControls
                    appearance="lecture"
                    page={registrantPagination.page}
                    hasNext={registrantPagination.has_next}
                    hasPrevious={registrantPagination.has_previous}
                    total={registrantPagination.total}
                    loading={registrantsLoading}
                    onPrevious={() => {
                      scrollAppToTopSoon();
                      setRegistrantPage((current) => Math.max(1, current - 1));
                    }}
                    onNext={() => {
                      scrollAppToTopSoon();
                      setRegistrantPage((current) => current + 1);
                    }}
                  />
                ) : null}
              </section>
            </>
          )}
        </div>
      </div>
    </PortalShell>
  );
}

function WebinarDetailSkeleton() {
  return (
    <div className="grid w-full min-w-0 gap-3 sm:gap-4" aria-busy="true" aria-label="Loading webinar">
      <section className="dashboard-glass-card min-w-0 rounded-2xl p-4 sm:p-6">
        <span className="dashboard-skeleton-block block h-5 w-24 rounded-full" />
        <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-[minmax(13rem,16rem)_minmax(0,1fr)]">
          <span className="dashboard-skeleton-block block h-36 w-full rounded-2xl sm:h-40 md:h-[11.5rem]" />
          <div className="grid min-w-0 gap-4">
            <span className="dashboard-skeleton-block block h-10 w-full rounded-xl" />
            <span className="dashboard-skeleton-block block h-10 w-full rounded-xl" />
            <span className="dashboard-skeleton-block block h-10 w-full rounded-xl" />
          </div>
        </div>
        <span className="dashboard-skeleton-block mt-4 block h-24 w-full rounded-xl" />
        <span className="dashboard-skeleton-block mt-4 block h-10 w-full rounded-xl" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <span className="dashboard-skeleton-block block h-10 w-full rounded-xl" />
          <span className="dashboard-skeleton-block block h-10 w-full rounded-xl" />
        </div>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <span className="dashboard-skeleton-block h-10 w-full rounded-full sm:w-24" />
          <span className="dashboard-skeleton-block h-10 w-full rounded-full sm:w-36" />
        </div>
      </section>
      <section className="dashboard-glass-card min-w-0 rounded-2xl p-4 sm:p-6">
        <div className="flex items-end justify-between gap-2">
          <span className="dashboard-skeleton-block block h-5 w-28 rounded-full" />
          <span className="dashboard-skeleton-block block h-3 w-16 rounded-full" />
        </div>
        <div className="mt-4">
          <RegistrantListSkeleton />
        </div>
      </section>
    </div>
  );
}

function RegistrantListSkeleton() {
  return (
    <div className="grid min-w-0 gap-2.5" aria-busy="true" aria-label="Loading registrants">
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="flex min-w-0 flex-col gap-3 rounded-2xl bg-[color:var(--dash-soft)]/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 flex-1 space-y-2">
            <span className="dashboard-skeleton-block block h-4 w-40 max-w-full rounded-full" />
            <span className="dashboard-skeleton-block block h-3 w-52 max-w-full rounded-full" />
          </div>
          <span className="dashboard-skeleton-block h-10 w-full rounded-full sm:w-32" />
        </div>
      ))}
    </div>
  );
}
