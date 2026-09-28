"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import {
  lessonWorkspaceGridClass,
  LessonsWorkspaceSkeleton,
} from "@/components/platform/provider/student/DashboardSkeletons";
import { CoursePageLayout } from "@/components/platform/provider/student/lectures/CoursePageLayout";
import { LectureMembershipLockedScreen } from "@/components/platform/provider/student/lectures/LectureMembershipLock";
import { LessonContentPanel } from "@/components/platform/provider/student/lectures/LessonContentPanel";
import {
  LearningModeToggle,
  LessonLearningView,
} from "@/components/platform/provider/student/lectures/LessonLearningView";
import { ApiRequestError } from "@/lib/integrate/client";
import { gsap, registerGsap } from "@/lib/gsap";
import {
  getCachedLesson,
  getCourseBundle,
  getLesson,
  type CourseSummary,
  type LessonDetail,
} from "@/lib/integrate/provider/student/lectures";
import {
  isMembershipRequiredError,
  useStudentMembershipAccess,
} from "@/lib/integrate/provider/student/payment/membershipAccess";
import { prefersReducedMotion } from "@/lib/motion";
import { scrollAppToTop } from "@/lib/scroll-to-top";
import { cn } from "@/lib/utils";

type StudentLessonsWorkspaceProps = {
  courseId: string;
  topicId?: string;
  l1Name?: string;
  selectedLessonId?: string;
};

function lessonHasFullDetail(lesson: LessonDetail) {
  return (
    Boolean(lesson.fact || lesson.text_content || lesson.supporting_content || lesson.study_bullets) ||
    lesson.variants.length > 0
  );
}

function buildLessonsHref(courseId: string, lessonId: string, topicId?: string, l1Name?: string) {
  const params = new URLSearchParams();
  if (topicId) params.set("topic_id", topicId);
  if (l1Name) params.set("l1_name", l1Name);
  const query = params.toString();
  return `/student/lectures/${courseId}/lessons/${lessonId}${query ? `?${query}` : ""}`;
}

function LessonIndexRow({
  lesson,
  index,
  selected,
  onSelect,
}: {
  lesson: LessonDetail;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "lesson-index-row flex min-h-10 w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left font-sans text-sm",
        selected ? "bg-[color:var(--dash-soft)]" : "hols-option-hover",
      )}
      aria-current={selected ? "true" : undefined}
    >
      <span
        className="lesson-index-badge flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold tabular-nums"
      >
        {selected ? <SidebarSvgIcon name="check" size={13} /> : index + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-sans line-clamp-2 text-sm font-medium leading-snug text-[color:var(--dash-text)]">
          {lesson.title}
        </span>
        {lesson.l2_name ? (
          <span className="mt-0.5 block truncate font-sans text-sm text-[color:var(--dash-faint)]">
            {lesson.l2_name}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function StudentLessonsWorkspace({
  courseId,
  topicId,
  l1Name,
  selectedLessonId,
}: StudentLessonsWorkspaceProps) {
  const membershipAccess = useStudentMembershipAccess();
  const router = useRouter();
  const stageRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiLocked, setApiLocked] = useState(false);
  const [course, setCourse] = useState<CourseSummary | null>(null);
  const [lessons, setLessons] = useState<LessonDetail[]>([]);
  const [activeLessonId, setActiveLessonId] = useState<string | undefined>(selectedLessonId);
  const [lessonDetail, setLessonDetail] = useState<LessonDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [learningMode, setLearningMode] = useState(false);
  const [mobileIndexOpen, setMobileIndexOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("hols-learning-mode") === "1") {
      setLearningMode(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (learningMode) sessionStorage.setItem("hols-learning-mode", "1");
    else sessionStorage.removeItem("hols-learning-mode");
  }, [learningMode]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const bundle = await getCourseBundle(courseId);
      setCourse(bundle.course);
      setLessons(bundle.lessons);
    } catch (err) {
      if (isMembershipRequiredError(err)) {
        setApiLocked(true);
        return;
      }
      setError(err instanceof ApiRequestError ? err.message : "Failed to load lessons.");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    if (!membershipAccess.ready || membershipAccess.locked) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load, membershipAccess.locked, membershipAccess.ready]);

  const filteredLessons = useMemo(
    () =>
      [...lessons]
        .filter((lesson) => {
          if (topicId && lesson.topic_id !== topicId) return false;
          if (l1Name && lesson.l1_name !== l1Name) return false;
          return true;
        })
        .sort((a, b) => a.order - b.order),
    [l1Name, lessons, topicId],
  );

  const filterLabel = useMemo(() => {
    if (topicId) {
      const match = lessons.find((lesson) => lesson.topic_id === topicId);
      return match?.l2_name ?? "Selected section";
    }
    if (l1Name) return l1Name;
    return null;
  }, [l1Name, lessons, topicId]);

  useEffect(() => {
    if (filteredLessons.length === 0) {
      setActiveLessonId(undefined);
      return;
    }

    if (selectedLessonId && filteredLessons.some((lesson) => lesson.lesson_id === selectedLessonId)) {
      setActiveLessonId(selectedLessonId);
      return;
    }

    setActiveLessonId((current) => {
      if (current && filteredLessons.some((lesson) => lesson.lesson_id === current)) {
        return current;
      }
      return filteredLessons[0]?.lesson_id;
    });
  }, [filteredLessons, selectedLessonId]);

  const activeLesson = useMemo(
    () => filteredLessons.find((lesson) => lesson.lesson_id === activeLessonId) ?? null,
    [activeLessonId, filteredLessons],
  );

  const activeIndex = activeLesson
    ? filteredLessons.findIndex((lesson) => lesson.lesson_id === activeLesson.lesson_id)
    : -1;

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      if (membershipAccess.locked || !membershipAccess.ready) return;
      if (!activeLessonId || !activeLesson) {
        setLessonDetail(null);
        setDetailLoading(false);
        return;
      }

      const cached = getCachedLesson(courseId, activeLessonId)?.lesson ?? null;
      if (cached && lessonHasFullDetail(cached)) {
        setLessonDetail(cached);
        setDetailLoading(false);
        return;
      }

      if (cached) {
        setLessonDetail(cached);
      } else {
        setLessonDetail(activeLesson);
      }

      setDetailLoading(true);
      try {
        const data = await getLesson(courseId, activeLessonId);
        setLessonDetail(data.lesson);
      } catch (err) {
        if (isMembershipRequiredError(err)) {
          setApiLocked(true);
          return;
        }
        setLessonDetail(activeLesson);
      } finally {
        setDetailLoading(false);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [activeLesson, activeLessonId, courseId, membershipAccess.locked, membershipAccess.ready]);

  useGSAP(
    () => {
      registerGsap();
      if (prefersReducedMotion() || !stageRef.current || loading) return;
      const index = stageRef.current.querySelector("[data-book-index]");
      const page = stageRef.current.querySelector("[data-book-reading]");
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      if (index) {
        tl.fromTo(index, { opacity: 0, x: -16 }, { opacity: 1, x: 0, duration: 0.5 }, 0);
      }
      if (page) {
        tl.fromTo(page, { opacity: 0, x: 20 }, { opacity: 1, x: 0, duration: 0.55 }, 0.08);
      }
    },
    { dependencies: [loading, course?.course_id], scope: stageRef },
  );

  function navigateLesson(lessonId: string) {
    setActiveLessonId(lessonId);
    setMobileIndexOpen(false);
    scrollAppToTop();
    router.replace(buildLessonsHref(courseId, lessonId, topicId, l1Name));
  }

  function selectLesson(lessonId: string) {
    setMobileIndexOpen(false);
    if (learningMode) {
      navigateLesson(lessonId);
      return;
    }
    setActiveLessonId(lessonId);
    scrollAppToTop();
    router.push(buildLessonsHref(courseId, lessonId, topicId, l1Name));
  }

  const displayLesson = lessonDetail ?? activeLesson;
  const prevLesson = activeIndex > 0 ? filteredLessons[activeIndex - 1] : null;
  const nextLesson =
    activeIndex >= 0 && activeIndex < filteredLessons.length - 1
      ? filteredLessons[activeIndex + 1]
      : null;

  if (!membershipAccess.ready) {
    return (
      <CoursePageLayout
        title="Lessons"
        description=""
        courseId={courseId}
        courseNavActive="lessons"
        backHref={`/student/lectures/${courseId}`}
        backLabel="Back to cover"
        hideHero
      >
        <LessonsWorkspaceSkeleton />
      </CoursePageLayout>
    );
  }

  if (membershipAccess.locked || apiLocked) {
    return <LectureMembershipLockedScreen />;
  }

  return (
    <>
      {learningMode && displayLesson ? (
        <LessonLearningView
          lesson={displayLesson}
          detailLoading={detailLoading}
          currentIndex={activeIndex >= 0 ? activeIndex + 1 : null}
          total={filteredLessons.length}
          onExit={() => setLearningMode(false)}
        />
      ) : null}

      <CoursePageLayout
        title={course ? course.title : "Lessons"}
        description=""
        courseId={courseId}
        courseNavActive="lessons"
        backHref={`/student/lectures/${courseId}`}
        backLabel="Back to cover"
        hideHero
      >
        {(topicId || l1Name) && (
          <div className="dashboard-glass-card course-book-filter mb-1 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
            <p className="font-sans text-sm text-[color:var(--dash-muted)]">
              Reading{" "}
              <span className="font-medium text-[color:var(--dash-text)]">{filterLabel}</span>
            </p>
            <Link
              href={`/student/lectures/${courseId}/lessons`}
              className="lecture-page-action dashboard-pill-soft font-sans inline-flex h-10 min-h-10 w-full items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium tracking-[0.01em] text-[color:var(--dash-text)] sm:w-auto"
            >
              <SidebarSvgIcon name="lectures" size={15} />
              Show full volume
            </Link>
          </div>
        )}

        {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}

        {loading ? (
          <LessonsWorkspaceSkeleton />
        ) : filteredLessons.length === 0 ? (
          <div className="dashboard-glass-card course-book-page rounded-2xl p-10 text-center">
            <p className="font-sans text-sm text-[color:var(--dash-faint)]">No lessons found.</p>
            {(topicId || l1Name) && (
              <Link
                href={`/student/lectures/${courseId}/lessons`}
                className="lecture-page-action dashboard-navy-btn font-sans mt-4 inline-flex h-10 min-h-10 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-medium tracking-[0.01em] text-white"
              >
                <SidebarSvgIcon name="lectures" size={15} />
                View all lessons
              </Link>
            )}
          </div>
        ) : (
          <div className="@container min-w-0 w-full">
          <div ref={stageRef} className={lessonWorkspaceGridClass}>
            {/* Narrow: compact index control above reading content */}
            <div className="order-1 min-w-0 @min-[52rem]:hidden">
              <div className="dashboard-glass-card course-book-index overflow-hidden rounded-2xl">
                <button
                  type="button"
                  onClick={() => setMobileIndexOpen((open) => !open)}
                  className="flex min-h-11 w-full items-center gap-3 px-3.5 py-3 text-left sm:px-4"
                  aria-expanded={mobileIndexOpen}
                  aria-controls="lesson-mobile-index"
                >
                  <span className="dashboard-tool-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[color:var(--dash-text)]">
                    <SidebarSvgIcon name="lectures" size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-brand-caption block font-semibold uppercase tracking-[0.12em] text-[color:var(--dash-faint)]">
                      Lesson index
                    </span>
                    <span className="font-sans mt-0.5 block truncate text-sm font-semibold text-[color:var(--dash-text)]">
                      {displayLesson?.title ?? course?.title ?? "Lessons"}
                    </span>
                    <span className="text-brand-caption mt-0.5 block text-[color:var(--dash-muted)]">
                      {activeIndex >= 0 ? `${activeIndex + 1} / ${filteredLessons.length}` : `${filteredLessons.length} pages`}
                    </span>
                  </span>
                  <SidebarSvgIcon
                    name={mobileIndexOpen ? "chevron-up" : "chevron-down"}
                    size={16}
                    className="shrink-0 text-[color:var(--dash-muted)]"
                  />
                </button>

                {mobileIndexOpen ? (
                  <div
                    id="lesson-mobile-index"
                    className="border-t border-[color:var(--dash-surface-border)]"
                  >
                    <div className="px-3.5 pb-3 pt-2 sm:px-4">
                      <LearningModeToggle
                        active={learningMode}
                        onToggle={() => setLearningMode((value) => !value)}
                        disabled={!displayLesson || detailLoading}
                      />
                    </div>
                    <div className="max-h-[min(50vh,20rem)] space-y-1 overflow-y-auto overscroll-contain px-2.5 pb-3 [scrollbar-width:thin]">
                      {filteredLessons.map((lesson, index) => (
                        <LessonIndexRow
                          key={lesson.lesson_id}
                          lesson={lesson}
                          index={index}
                          selected={lesson.lesson_id === activeLessonId}
                          onSelect={() => selectLesson(lesson.lesson_id)}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <aside
              data-book-index
              className="dashboard-glass-card course-book-index relative order-3 hidden flex-col overflow-hidden rounded-2xl @min-[52rem]:sticky @min-[52rem]:top-4 @min-[52rem]:order-1 @min-[52rem]:flex @min-[52rem]:max-h-[calc(100dvh-2rem)]"
            >
              <div className="relative flex shrink-0 flex-col gap-3 border-b border-[color:var(--dash-surface-border)] px-4 py-4 sm:px-5">
                <div>
                  <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
                    Index
                  </p>
                  <h2 className="font-sans mt-1 text-lg font-semibold tracking-[0.005em] text-[color:var(--dash-text)]">
                    {course?.title ?? "Lessons"}
                  </h2>
                  <p className="text-brand-caption mt-1 text-[color:var(--dash-muted)]">
                    {filteredLessons.length} page{filteredLessons.length === 1 ? "" : "s"}
                    {filterLabel ? ` · ${filterLabel}` : ""}
                  </p>
                </div>
                <LearningModeToggle
                  active={learningMode}
                  onToggle={() => setLearningMode((value) => !value)}
                  disabled={!displayLesson || detailLoading}
                />
              </div>

              <div className="relative min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3 [scrollbar-width:thin]">
                {filteredLessons.map((lesson, index) => (
                  <LessonIndexRow
                    key={lesson.lesson_id}
                    lesson={lesson}
                    index={index}
                    selected={lesson.lesson_id === activeLessonId}
                    onSelect={() => selectLesson(lesson.lesson_id)}
                  />
                ))}
              </div>
            </aside>

            <main data-book-reading className="order-2 min-w-0 lg:order-2">
              {displayLesson ? (
                <LessonContentPanel
                  lesson={displayLesson}
                  detailLoading={detailLoading}
                  currentIndex={activeIndex >= 0 ? activeIndex + 1 : null}
                  total={filteredLessons.length}
                  prevLessonId={prevLesson?.lesson_id ?? null}
                  nextLessonId={nextLesson?.lesson_id ?? null}
                  courseId={courseId}
                  topicId={topicId}
                  l1Name={l1Name}
                />
              ) : (
                <div className="dashboard-glass-card course-book-page rounded-2xl p-6 text-center sm:p-10">
                  <p className="font-sans text-sm text-[color:var(--dash-faint)]">
                    Select a page from the index to begin reading.
                  </p>
                </div>
              )}
            </main>
          </div>
          </div>
        )}
      </CoursePageLayout>
    </>
  );
}
