"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { PaginationControls } from "@/components/platform/provider/admin/shared";
import { Button } from "@/components/ui/Button";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import {
  TestResultRowsSkeleton,
  TestResultsPageSkeleton,
} from "@/components/platform/provider/student/DashboardSkeletons";
import { CoursePageLayout } from "@/components/platform/provider/student/lectures/CoursePageLayout";
import { LectureMembershipLockedScreen } from "@/components/platform/provider/student/lectures/LectureMembershipLock";
import { ApiRequestError } from "@/lib/integrate/client";
import {
  getCourse,
  getCourseTestResults,
  type CourseSummary,
  type CourseTestResultsData,
  type PaginationMeta,
} from "@/lib/integrate/provider/student/lectures";
import {
  isMembershipRequiredError,
  useStudentMembershipAccess,
} from "@/lib/integrate/provider/student/payment/membershipAccess";
import { scrollAppToTopSoon } from "@/lib/scroll-to-top";

type StudentTestResultPageProps = {
  courseId: string;
};

const RESULTS_PAGE_SIZE = 10;

function lessonHref(courseId: string, lessonId: string) {
  return `/student/lectures/${courseId}/lessons/${lessonId}`;
}

function formatWhen(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function StudentTestResultPage({ courseId }: StudentTestResultPageProps) {
  const router = useRouter();
  const membershipAccess = useStudentMembershipAccess();
  const [course, setCourse] = useState<CourseSummary | null>(null);
  const [results, setResults] = useState<CourseTestResultsData | null>(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [loadingCourse, setLoadingCourse] = useState(true);
  const [loadingResults, setLoadingResults] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiLocked, setApiLocked] = useState(false);

  useEffect(() => {
    if (!membershipAccess.ready || membershipAccess.locked) return;

    async function loadCourse() {
      setLoadingCourse(true);
      setError(null);
      try {
        const courseData = await getCourse(courseId);
        setCourse(courseData.course);
      } catch (err) {
        if (isMembershipRequiredError(err)) {
          setApiLocked(true);
          return;
        }
        setError(err instanceof ApiRequestError ? err.message : "Failed to load course.");
      } finally {
        setLoadingCourse(false);
      }
    }
    void loadCourse();
  }, [courseId, membershipAccess.locked, membershipAccess.ready]);

  const loadResults = useCallback(async () => {
    if (!membershipAccess.ready || membershipAccess.locked) return;
    setLoadingResults(true);
    setError(null);
    try {
      const testResults = await getCourseTestResults(courseId, {
        page,
        limit: RESULTS_PAGE_SIZE,
      });
      setResults(testResults);
      setPagination(testResults.pagination);
    } catch (err) {
      if (isMembershipRequiredError(err)) {
        setApiLocked(true);
        return;
      }
      setError(err instanceof ApiRequestError ? err.message : "Failed to load test results.");
    } finally {
      setLoadingResults(false);
    }
  }, [courseId, membershipAccess.locked, membershipAccess.ready, page]);

  useEffect(() => {
    void loadResults();
  }, [loadResults]);

  useEffect(() => {
    setPage(1);
  }, [courseId]);

  const summary = results?.summary;
  const loading = loadingCourse || (loadingResults && !results);
  const averageScore = summary?.average_score ?? 0;
  const lessonsQuizzed = summary?.lessons_quizzed ?? 0;
  const totalLessons = summary?.total_lessons ?? course?.lesson_count ?? 0;
  const passedCount = summary?.passed_count ?? 0;
  const progress = totalLessons > 0 ? Math.min(100, Math.round((lessonsQuizzed / totalLessons) * 100)) : 0;

  if (!membershipAccess.ready) {
    return (
      <CoursePageLayout
        title="Test result"
        description=""
        courseId={courseId}
        courseNavActive="test-result"
        backHref={`/student/lectures/${courseId}`}
        backLabel="Back to cover"
        hideHero
      >
        <TestResultsPageSkeleton />
      </CoursePageLayout>
    );
  }

  if (membershipAccess.locked || apiLocked) {
    return <LectureMembershipLockedScreen />;
  }

  return (
    <CoursePageLayout
      title={course ? `Test result · ${course.title}` : "Test result"}
      description=""
      courseId={courseId}
      courseNavActive="test-result"
      backHref={`/student/lectures/${courseId}`}
      backLabel="Back to cover"
      hideHero
    >
      {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}

      {loading ? (
        <TestResultsPageSkeleton />
      ) : (
        <div className="test-result-page @container grid w-full min-w-0 max-w-full gap-3 sm:gap-4">
          <section className="dashboard-glass-card min-w-0 overflow-hidden rounded-2xl p-4 sm:p-5">
            <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
              Quiz progress
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <span className="font-sans text-3xl font-bold leading-none tracking-[0.01em] text-[color:var(--dash-text)]">
                {averageScore}%
              </span>
              <span className="mb-0.5 text-brand-caption font-medium text-[color:var(--dash-muted)]">
                average score
              </span>
            </div>
            <div className="mt-4">
              <div
                className="test-result-track h-2 overflow-hidden rounded-full"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                aria-label={`${progress}% of lessons quizzed`}
              >
                <div
                  className="test-result-fill h-full rounded-full"
                  style={{ width: `${Math.min(100, Math.max(progress ? 4 : 0, progress))}%` }}
                />
              </div>
              <p className="text-brand-caption mt-2 text-[color:var(--dash-muted)]">
                {lessonsQuizzed} of {totalLessons} lessons quizzed · {passedCount} passed
              </p>
            </div>
          </section>

          <section className="dashboard-glass-card min-w-0 overflow-hidden rounded-2xl">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-5">
              <h2 className="font-sans text-base font-semibold tracking-[0.005em] text-[color:var(--dash-text)]">
                Saved attempts
              </h2>
              {pagination ? (
                <span className="text-brand-caption font-medium tabular-nums text-[color:var(--dash-faint)]">
                  {pagination.total} result{pagination.total === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>

            {loadingResults ? (
              <TestResultRowsSkeleton />
            ) : results?.items.length ? (
              <>
                <ul className="grid gap-2.5 px-3.5 pb-4 sm:gap-3 sm:px-5 md:hidden">
                  {results.items.map((item) => {
                    const href = lessonHref(courseId, item.lesson_id);
                    const when = formatWhen(item.updated_at);
                    return (
                      <li key={item.lesson_id} className="min-w-0">
                        <Link
                          href={href}
                          onClick={() => scrollAppToTopSoon()}
                          className="block min-w-0 overflow-hidden rounded-2xl bg-[color:var(--dash-soft)]/80 px-4 py-4 transition hover:bg-[color:var(--dash-soft)]"
                        >
                          <p
                            title={item.lesson_title}
                            className="font-sans line-clamp-2 text-sm font-semibold leading-snug text-[color:var(--dash-text)]"
                          >
                            {item.lesson_title}
                          </p>
                          <p className="text-brand-caption mt-1 text-[color:var(--dash-faint)]">
                            Lesson {item.lesson_order}
                          </p>
                          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
                            <div className="min-w-0">
                              <dt className="text-brand-caption text-[color:var(--dash-faint)]">Score</dt>
                              <dd className="font-sans mt-0.5 text-sm font-semibold tabular-nums text-[color:var(--dash-text)]">
                                {item.score_percent}%
                              </dd>
                            </div>
                            <div className="min-w-0">
                              <dt className="text-brand-caption text-[color:var(--dash-faint)]">Status</dt>
                              <dd className="mt-0.5">
                                <AttemptStatus passed={item.passed} />
                              </dd>
                            </div>
                            <div className="min-w-0">
                              <dt className="text-brand-caption text-[color:var(--dash-faint)]">Correct</dt>
                              <dd className="font-sans mt-0.5 text-sm font-semibold tabular-nums text-[color:var(--dash-text)]">
                                {item.correct_count}/{item.total_questions}
                              </dd>
                            </div>
                            <div className="min-w-0">
                              <dt className="text-brand-caption text-[color:var(--dash-faint)]">Date</dt>
                              <dd className="font-sans mt-0.5 truncate text-sm font-semibold text-[color:var(--dash-text)]">
                                {when || "—"}
                              </dd>
                            </div>
                          </dl>
                          <div className="mt-3 flex justify-end border-t border-[color:var(--dash-surface-border)] pt-3">
                            <span className="portal-action-link">Open</span>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>

                <div className="hidden min-w-0 overflow-x-auto md:block">
                  <table className="w-full min-w-[40rem] border-separate border-spacing-0 text-left">
                    <thead>
                      <tr className="bg-[color:var(--dash-soft)] text-brand-caption font-semibold uppercase tracking-[0.06em] text-[color:var(--dash-faint)]">
                        <th scope="col" className="px-4 py-3 font-semibold sm:px-5">
                          Lesson
                        </th>
                        <th scope="col" className="px-3 py-3 font-semibold">
                          Score
                        </th>
                        <th scope="col" className="px-3 py-3 font-semibold">
                          Correct
                        </th>
                        <th scope="col" className="px-3 py-3 font-semibold">
                          Status
                        </th>
                        <th scope="col" className="px-3 py-3 font-semibold">
                          Date
                        </th>
                        <th scope="col" className="px-4 py-3 font-semibold sm:px-5">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.items.map((item) => {
                        const href = lessonHref(courseId, item.lesson_id);
                        const when = formatWhen(item.updated_at);
                        return (
                          <tr
                            key={item.lesson_id}
                            tabIndex={0}
                            role="button"
                            aria-label={`Open ${item.lesson_title}`}
                            className="test-result-row cursor-pointer outline-none transition hover:bg-[color:var(--dash-soft)] focus-visible:bg-[color:var(--dash-soft)]"
                            onClick={() => {
                              scrollAppToTopSoon();
                              router.push(href);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                scrollAppToTopSoon();
                                router.push(href);
                              }
                            }}
                          >
                            <td className="border-t border-[color:var(--dash-surface-border)] px-4 py-3 sm:px-5">
                              <span
                                title={item.lesson_title}
                                className="font-sans block max-w-[22rem] truncate text-sm font-semibold text-[color:var(--dash-text)]"
                              >
                                {item.lesson_title}
                              </span>
                              <span className="text-brand-caption mt-0.5 block text-[color:var(--dash-faint)]">
                                Lesson {item.lesson_order}
                              </span>
                            </td>
                            <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                              <span className="font-sans text-sm font-semibold tabular-nums text-[color:var(--dash-text)]">
                                {item.score_percent}%
                              </span>
                            </td>
                            <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                              <span className="font-sans text-sm tabular-nums text-[color:var(--dash-muted)]">
                                {item.correct_count}/{item.total_questions}
                              </span>
                            </td>
                            <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                              <AttemptStatus passed={item.passed} />
                            </td>
                            <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                              <span className="text-brand-caption whitespace-nowrap text-[color:var(--dash-muted)]">
                                {when || "—"}
                              </span>
                            </td>
                            <td className="border-t border-[color:var(--dash-surface-border)] px-4 py-3 sm:px-5">
                              <Link
                                href={href}
                                className="portal-action-link"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  scrollAppToTopSoon();
                                }}
                              >
                                Open
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center px-5 py-12 text-center sm:py-14">
                <p className="font-sans text-base font-semibold text-[color:var(--dash-text)] sm:text-lg">
                  No quiz results yet
                </p>
                <p className="text-brand-body mt-1.5 max-w-sm text-[color:var(--dash-muted)]">
                  Complete a lesson quiz and your score will show up here.
                </p>
                <Button
                  href={`/student/lectures/${courseId}/lessons`}
                  className="lecture-page-action mt-4 w-full px-5 sm:w-auto"
                >
                  Start a lesson
                  <SidebarSvgIcon name="next" size={16} />
                </Button>
              </div>
            )}

            {pagination && pagination.total > 0 && (pagination.has_next || pagination.has_previous) ? (
              <div className="px-3.5 pb-4 sm:px-5">
                <PaginationControls
                  appearance="lecture"
                  page={pagination.page}
                  total={pagination.total}
                  pageCount={pagination.total_pages}
                  hasNext={pagination.has_next}
                  hasPrevious={pagination.has_previous}
                  loading={loadingResults}
                  onPrevious={() => {
                    scrollAppToTopSoon();
                    setPage((current) => Math.max(1, current - 1));
                  }}
                  onNext={() => {
                    scrollAppToTopSoon();
                    setPage((current) => current + 1);
                  }}
                />
              </div>
            ) : null}
          </section>
        </div>
      )}
    </CoursePageLayout>
  );
}

function AttemptStatus({ passed }: { passed: boolean }) {
  return (
    <span className="text-brand-caption inline-flex rounded-full bg-[color:var(--dash-soft)] px-2.5 py-1 font-semibold text-[color:var(--dash-text)]">
      {passed ? "Passed" : "Review"}
    </span>
  );
}

