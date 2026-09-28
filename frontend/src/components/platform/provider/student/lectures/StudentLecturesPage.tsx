"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { Button } from "@/components/ui/Button";
import { useServerPortalTheme } from "@/components/platform/provider/PortalThemeProvider";
import {
  getPortalThemeSnapshot,
  subscribePortalTheme,
} from "@/components/platform/provider/portal-theme-store";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { CourseCoverArt } from "@/components/platform/provider/student/lectures/CourseCoverArt";
import { tidyCoverTitle, resolveCourseCover } from "@/components/platform/provider/student/lectures/courseCover";
import { filterVisibleLectureCourses } from "@/components/platform/provider/student/lectures/hiddenCourses";
import { LecturePlansDialog } from "@/components/platform/provider/student/lectures/LecturePlansDialog";
import { LecturesPageLayout } from "@/components/platform/provider/student/lectures/LecturesPageLayout";
import {
  preloadLectureCoverSrcs,
  preloadSharedLectureCoverAssets,
} from "@/components/platform/provider/student/lectures/lectureCoverCache";
import { ApiRequestError } from "@/lib/integrate/client";
import {
  listCourses,
  type CourseSummary,
} from "@/lib/integrate/provider/student/lectures";
import { useStudentMembershipAccess } from "@/lib/integrate/provider/student/payment/membershipAccess";
import { scrollAppToTopSoon } from "@/lib/scroll-to-top";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;

const lectureCourseGridClass =
  "lecture-course-grid grid w-full min-w-0 max-w-full grid-cols-1 gap-4 @min-[30rem]:grid-cols-2 @min-[30rem]:gap-5 @min-[48rem]:grid-cols-3";

function tidySearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function courseMatchesSearch(course: CourseSummary, query: string) {
  const needle = tidySearchText(query);
  if (!needle) return true;

  const title = tidySearchText(course.title ?? "");
  if (!title) return false;

  if (title === needle || title.startsWith(needle) || title.includes(` ${needle}`)) {
    return true;
  }

  const titleTokens = title.split(" ").filter(Boolean);
  const needleTokens = needle.split(" ").filter(Boolean);
  if (needleTokens.length === 0) return true;

  return needleTokens.every((token) =>
    titleTokens.some((titleToken) => titleToken === token || titleToken.startsWith(token)),
  );
}

export function StudentLecturesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const membershipAccess = useStudentMembershipAccess();
  const [plansOpen, setPlansOpen] = useState(false);

  const trimmedSearch = searchQuery.trim();
  const isSearching = trimmedSearch.length > 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const first = await listCourses({ page: 1, limit: 100 });
      const items = [...first.items];
      let nextPage = 1;
      let hasNext = first.pagination.has_next;
      while (hasNext && nextPage < 20) {
        nextPage += 1;
        const data = await listCourses({ page: nextPage, limit: 100 });
        items.push(...data.items);
        hasNext = data.pagination.has_next;
      }
      setCourses(items);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to load courses.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    scrollAppToTopSoon();
  }, [page]);

  useEffect(() => {
    preloadSharedLectureCoverAssets();
  }, []);

  const availableCourses = useMemo(
    () => filterVisibleLectureCourses(courses),
    [courses],
  );

  const pageCount = Math.max(1, Math.ceil(availableCourses.length / PAGE_SIZE));

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const visibleCourses = useMemo(() => {
    if (isSearching) {
      return availableCourses.filter((course) => courseMatchesSearch(course, trimmedSearch));
    }
    const start = (page - 1) * PAGE_SIZE;
    return availableCourses.slice(start, start + PAGE_SIZE);
  }, [availableCourses, isSearching, page, trimmedSearch]);

  useEffect(() => {
    if (visibleCourses.length === 0) return;
    preloadLectureCoverSrcs(
      visibleCourses.flatMap((course) => {
        const cover = resolveCourseCover(course.course_id, course.title);
        return [cover.vialSrc, cover.photos.light, cover.photos.dark];
      }),
    );
  }, [visibleCourses]);

  return (
    <LecturesPageLayout searchQuery={searchQuery} onSearchQueryChange={setSearchQuery}>
      {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}

      {isSearching && !loading ? (
        <p className="text-brand-caption text-[color:var(--dash-faint)]">
          {visibleCourses.length === 1
            ? "1 course found"
            : `${visibleCourses.length} courses found`}
        </p>
      ) : null}

      {loading ? (
        <div className="@container min-w-0 w-full">
        <div
          className={lectureCourseGridClass}
          aria-busy="true"
          aria-label="Loading courses"
        >
          {Array.from({ length: 8 }, (_, index) => (
            <CourseCardSkeleton key={index} index={index} />
          ))}
        </div>
        </div>
      ) : visibleCourses.length === 0 ? (
        <div className="dashboard-surface rounded-xl p-8 text-center sm:p-10">
          <p className="text-brand-body text-[color:var(--dash-faint)]">
            {isSearching ? "No courses match your search." : "No courses available yet."}
          </p>
        </div>
      ) : (
        <div className="@container min-w-0 w-full">
        <div className={lectureCourseGridClass}>
          {visibleCourses.map((course, index) => (
            <CourseCard
              key={course.course_id}
              course={course}
              index={index}
              locked={membershipAccess.locked}
              openable={membershipAccess.ready && membershipAccess.unlocked}
              onOpenPlans={() => setPlansOpen(true)}
            />
          ))}
        </div>
        </div>
      )}

      {!isSearching && pageCount > 1 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <p className="text-brand-caption text-center text-[color:var(--dash-faint)] sm:text-left">
            Page {page} of {pageCount} · {availableCourses.length} courses
          </p>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2">
            <PagerButton
              variant="prev"
              disabled={page <= 1 || loading}
              onClick={() => {
                scrollAppToTopSoon();
                setPage((prev) => Math.max(1, prev - 1));
              }}
            >
              <SidebarSvgIcon name="previous" size={16} />
              <span className="sm:hidden">Prev</span>
              <span className="hidden sm:inline">Previous page</span>
            </PagerButton>
            <PagerButton
              variant="next"
              disabled={page >= pageCount || loading}
              onClick={() => {
                scrollAppToTopSoon();
                setPage((prev) => Math.min(pageCount, prev + 1));
              }}
            >
              <span className="sm:hidden">Next</span>
              <span className="hidden sm:inline">Next page</span>
              <SidebarSvgIcon name="next" size={16} />
            </PagerButton>
          </div>
        </div>
      ) : null}
      <LecturePlansDialog open={plansOpen} onClose={() => setPlansOpen(false)} />
    </LecturesPageLayout>
  );
}

function PagerButton({
  children,
  disabled,
  onClick,
  variant,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  variant: "prev" | "next";
}) {
  if (variant === "next") {
    return (
      <Button type="button" disabled={disabled} onClick={onClick} className="lecture-page-action w-full px-5 sm:w-auto">
        {children}
      </Button>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="lecture-page-action dashboard-navy-btn font-sans inline-flex h-10 min-h-10 w-full items-center justify-center gap-1.5 rounded-full px-5 text-sm font-medium tracking-[0.01em] text-white disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
    >
      {children}
    </button>
  );
}

function StatColumn({ label, value }: { label: string; value: number }) {
  return (
    <div className="lecture-stat-column flex flex-col items-center justify-center gap-0.5 px-1 py-2">
      <span className="lecture-stat-value font-sans leading-none tracking-tight">{value}</span>
      <span className="lecture-stat-label font-medium uppercase">{label}</span>
    </div>
  );
}

function CourseCardSkeleton({ index }: { index: number }) {
  return (
    <div
      style={{ animationDelay: `${Math.min(index, 7) * 45}ms` }}
      className="lecture-course-card lecture-course-skeleton flex h-full w-full min-h-0 flex-col overflow-hidden rounded-2xl"
      aria-hidden
    >
      <span className="lecture-skeleton-block aspect-[5/4] w-full shrink-0 rounded-none" />
      <div className="lecture-course-card-glass flex shrink-0 flex-col px-4 pt-3 pb-4">
        <div className="lecture-card-title-skeleton">
          <span className="lecture-skeleton-block w-[88%] rounded-md" />
          <span className="lecture-skeleton-block w-[58%] rounded-md" />
        </div>
        <div className="lecture-course-stats">
          {Array.from({ length: 3 }, (_, stat) => (
            <div
              key={stat}
              className="lecture-stat-column flex flex-col items-center justify-center gap-1 px-1 py-2"
            >
              <span className="lecture-skeleton-block h-3.5 w-6 rounded" />
              <span className="lecture-skeleton-block h-2 w-10 max-w-[80%] rounded" />
            </div>
          ))}
        </div>
        <span className="lecture-skeleton-block mt-2.5 block h-10 w-full rounded-full" />
      </div>
    </div>
  );
}

function CourseCard({
  course,
  index,
  locked,
  openable,
  onOpenPlans,
}: {
  course: CourseSummary;
  index: number;
  locked: boolean;
  openable: boolean;
  onOpenPlans: () => void;
}) {
  // Keep theme subscription so dark/light card chrome stays in sync.
  const serverTheme = useServerPortalTheme();
  useSyncExternalStore(subscribePortalTheme, getPortalThemeSnapshot, () => serverTheme);

  const cardClassName = cn(
    "lecture-course-card group relative flex h-full w-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden rounded-2xl",
  );
  const cardStyle = { animationDelay: `${Math.min(index, 11) * 45}ms` };

  const media = (
    <div className="lecture-course-card-media relative z-[1] aspect-[5/4] w-full shrink-0 overflow-hidden">
      <span className="lecture-course-card-shine pointer-events-none absolute inset-0 z-[3]" aria-hidden />
      <span className="lecture-course-card-sweep pointer-events-none absolute inset-0 z-[3]" aria-hidden />
      <span className="lecture-course-card-spotlight pointer-events-none absolute inset-0 z-[3]" aria-hidden />
      <CourseCoverArt courseId={course.course_id} title={course.title} variant="card" />
    </div>
  );

  const stats = (
    <div className="lecture-course-stats">
      <StatColumn label="Topics" value={course.topic_count} />
      <StatColumn label="Sections" value={course.section_count} />
      <StatColumn label="Lectures" value={course.lesson_count} />
    </div>
  );

  if (locked) {
    const title = tidyCoverTitle(course.title);
    return (
      <div style={cardStyle} className={cardClassName}>
        <button
          type="button"
          onClick={onOpenPlans}
          className="block w-full text-left"
          aria-label={`Reveal ${title}`}
        >
          {media}
        </button>
        <div className="lecture-course-card-glass relative z-[2] flex shrink-0 flex-col px-4 pt-3 pb-4">
          <h2 className="lecture-course-card-title font-sans">{title}</h2>
          {stats}
          <button
            type="button"
            className="lecture-course-card-cta dashboard-navy-btn font-sans mt-2.5 inline-flex h-10 min-h-10 w-full items-center justify-center gap-1.5 rounded-full px-5 text-sm font-medium tracking-[0.01em] text-white"
            onClick={onOpenPlans}
          >
            <SidebarSvgIcon name="lock" size={15} strokeWidth={2.1} />
            Learn more
          </button>
        </div>
      </div>
    );
  }

  if (!openable) {
    return (
      <div style={cardStyle} className={cardClassName} aria-busy="true">
        {media}
        <div className="lecture-course-card-glass relative z-[2] flex shrink-0 flex-col px-4 pt-3 pb-4">
          <h2 className="lecture-course-card-title font-sans">{tidyCoverTitle(course.title)}</h2>
          {stats}
          <span className="lecture-course-card-cta font-sans mt-2.5 inline-flex h-10 min-h-10 w-full items-center justify-center gap-1.5 rounded-full px-5 text-sm font-medium tracking-[0.01em]">
            Learn more
            <SidebarSvgIcon name="next" size={15} />
          </span>
        </div>
      </div>
    );
  }

  const courseHref = `/student/lectures/${course.course_id}`;

  return (
    <div style={cardStyle} className={cardClassName}>
      <Link href={courseHref} className="block min-w-0" aria-label={tidyCoverTitle(course.title)}>
        {media}
      </Link>
      <div className="lecture-course-card-glass relative z-[2] flex shrink-0 flex-col px-4 pt-3 pb-4">
        <Link href={courseHref} className="min-w-0 no-underline">
          <h2 className="lecture-course-card-title font-sans">{tidyCoverTitle(course.title)}</h2>
        </Link>
        {stats}
        <Button href={courseHref} className="lecture-page-action mt-2.5 w-full">
          Learn more
          <SidebarSvgIcon name="next" size={15} />
        </Button>
      </div>
    </div>
  );
}
