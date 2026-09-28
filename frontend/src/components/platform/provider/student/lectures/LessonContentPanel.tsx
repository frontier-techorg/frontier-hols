"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import { LessonContentSkeleton } from "@/components/platform/provider/student/DashboardSkeletons";
import { Button } from "@/components/ui/Button";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import {
  LessonQuizOverlay,
  LessonQuizResultCard,
} from "@/components/platform/provider/student/lectures/LessonQuizOverlay";
import { LessonProse } from "@/components/platform/provider/student/lectures/lessonProse";
import { gsap, registerGsap } from "@/lib/gsap";
import type { LessonDetail, LessonQuizResult } from "@/lib/integrate/provider/student/lectures";
import { prefersReducedMotion } from "@/lib/motion";
import { scrollAppToTop, scrollAppToTopSoon } from "@/lib/scroll-to-top";

function PageSection({ title, text }: { title: string; text: string }) {
  return (
    <section data-reveal className="course-book-page-section">
      <h3 className="lesson-section-title">{title}</h3>
      <LessonProse text={text} className="mt-3" />
    </section>
  );
}

function estimateReadingMinutes(lesson: LessonDetail) {
  const text = [lesson.fact, lesson.text_content, lesson.study_bullets]
    .filter(Boolean)
    .join(" ");
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return Math.max(1, Math.round(words / 200));
}

type LessonContentPanelProps = {
  lesson: LessonDetail;
  detailLoading?: boolean;
  currentIndex?: number | null;
  total?: number;
  prevLessonId?: string | null;
  nextLessonId?: string | null;
  courseId: string;
  topicId?: string;
  l1Name?: string;
};

function lessonHref(
  courseId: string,
  lessonId: string,
  topicId?: string,
  l1Name?: string,
) {
  const params = new URLSearchParams();
  if (topicId) params.set("topic_id", topicId);
  if (l1Name) params.set("l1_name", l1Name);
  const query = params.toString();
  return `/student/lectures/${courseId}/lessons/${lessonId}${query ? `?${query}` : ""}`;
}

export function LessonContentPanel({
  lesson,
  detailLoading = false,
  currentIndex,
  total,
  prevLessonId,
  nextLessonId,
  courseId,
  topicId,
  l1Name,
}: LessonContentPanelProps) {
  const router = useRouter();
  const [quizOpen, setQuizOpen] = useState(false);
  const [latestResult, setLatestResult] = useState<LessonQuizResult | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const hasQuiz = lesson.variants.length > 0;
  const hasContent =
    Boolean(lesson.fact || lesson.text_content || lesson.study_bullets) || hasQuiz;
  const readingMinutes = useMemo(() => estimateReadingMinutes(lesson), [lesson]);

  useEffect(() => {
    setQuizOpen(false);
    setLatestResult(null);
  }, [lesson.lesson_id]);

  useGSAP(
    () => {
      registerGsap();
      if (prefersReducedMotion() || !pageRef.current) return;
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.fromTo(
        pageRef.current,
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.4, clearProps: "transform" },
      );
      const reveals = pageRef.current.querySelectorAll("[data-reveal]");
      if (reveals.length) {
        tl.fromTo(
          reveals,
          { opacity: 0, y: 22 },
          { opacity: 1, y: 0, duration: 0.5, stagger: 0.09 },
          0.18,
        );
      }
    },
    { dependencies: [lesson.lesson_id], scope: pageRef },
  );

  // Reset to the top when a new lesson opens (next/prev, sidebar, deep link).
  useEffect(() => {
    scrollAppToTopSoon();
  }, [lesson.lesson_id]);

  // Keyboard page-turning with the arrow keys.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (quizOpen) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
        return;
      }
      if (event.key === "ArrowRight" && nextLessonId) {
        scrollAppToTop();
        router.push(lessonHref(courseId, nextLessonId, topicId, l1Name));
      } else if (event.key === "ArrowLeft" && prevLessonId) {
        scrollAppToTop();
        router.push(lessonHref(courseId, prevLessonId, topicId, l1Name));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [courseId, l1Name, nextLessonId, prevLessonId, quizOpen, router, topicId]);

  return (
    <div className="course-book-open relative min-w-0 overflow-visible">
      <div className="course-book-open-spine pointer-events-none absolute left-0 z-0 hidden w-3 lg:block" aria-hidden />

      <article
        ref={pageRef}
        className="course-book-page relative z-[2] min-w-0 overflow-hidden rounded-2xl"
        style={{ transformOrigin: "left center" }}
      >
        <div className="course-book-page-grain pointer-events-none absolute inset-0 rounded-[inherit]" aria-hidden />

        <header className="relative px-4 pb-4 pt-4 sm:px-7 sm:pb-5 sm:pt-6 md:px-8">
          <div className="flex items-center justify-between gap-3">
            <p className="text-brand-caption min-w-0 font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
              Lesson {lesson.order}
              {currentIndex && total ? ` · Page ${currentIndex} of ${total}` : ""}
            </p>
            <span className="dashboard-tool-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold uppercase tracking-[0.1em] text-[color:var(--dash-text)]">
              HOLS
            </span>
          </div>
          <h2
            title={lesson.title}
            className="font-sans mt-2 w-full text-left text-lg font-bold leading-snug tracking-[0.01em] text-[color:var(--dash-text)] sm:text-xl md:text-2xl"
          >
            {lesson.title}
          </h2>
          {(lesson.l1_name || lesson.l2_name) ? (
            <p className="mt-2 font-sans text-sm text-[color:var(--dash-muted)]">
              {[lesson.l1_name, lesson.l2_name].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="lesson-read-chip">
              <SidebarSvgIcon name="clock" size={13} />
              {readingMinutes} min read
            </span>
            {hasQuiz ? (
              <span className="lesson-read-chip">
                <SidebarSvgIcon name="quiz" size={13} />
                {lesson.variants.length} quiz question{lesson.variants.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
        </header>

        <div className="relative px-4 py-4 sm:px-7 sm:py-6 md:px-8 md:py-7">
          {detailLoading ? (
            <LessonContentSkeleton includeHeader={false} />
          ) : (
            <div className="grid gap-7">
              {lesson.fact ? <PageSection title="Lesson Content" text={lesson.fact} /> : null}
              {lesson.text_content ? (
                <PageSection title="Full Text" text={lesson.text_content} />
              ) : null}
              {lesson.study_bullets ? (
                <PageSection title="Study Bullets" text={lesson.study_bullets} />
              ) : null}

              {!hasContent ? (
                <p className="py-8 text-center font-sans text-sm text-[color:var(--dash-faint)]">
                  No lesson content available yet.
                </p>
              ) : null}

              {latestResult ? (
                <div data-reveal className="min-w-0">
                  <LessonQuizResultCard
                    result={latestResult}
                    courseId={courseId}
                    onRetake={() => setQuizOpen(true)}
                  />
                </div>
              ) : hasQuiz ? (
                <section
                  data-reveal
                  className="course-book-quiz-band @container min-w-0 rounded-2xl px-4 py-4 sm:px-5 sm:py-5"
                >
                  <div className="flex min-w-0 flex-col gap-4 @min-[26rem]:flex-row @min-[26rem]:items-center @min-[26rem]:justify-between">
                    <div className="min-w-0">
                      <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
                        Practice quiz
                      </p>
                      <h3 className="font-sans mt-1 break-words text-lg font-semibold tracking-[0.005em] text-[color:var(--dash-text)]">
                        {lesson.variants.length} question{lesson.variants.length === 1 ? "" : "s"} · 5 minute limit
                      </h3>
                      <p className="mt-2 max-w-2xl font-sans text-sm leading-6 text-[color:var(--dash-muted)]">
                        Finish this page, then take the quiz when you are ready. You will confirm before the
                        countdown starts.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setQuizOpen(true)}
                      className="lecture-page-action dashboard-navy-btn font-sans inline-flex h-10 min-h-10 w-full shrink-0 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-medium tracking-[0.01em] text-white @min-[26rem]:w-auto"
                    >
                      <SidebarSvgIcon name="quiz" size={15} />
                      Take quiz
                    </button>
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </div>

        {(prevLessonId || nextLessonId) && (
          <footer className="@container relative flex min-w-0 flex-col gap-3 px-4 py-4 sm:px-7 md:px-8 @min-[26rem]:flex-row @min-[26rem]:flex-wrap @min-[26rem]:items-center @min-[26rem]:justify-between">
            <div className="flex items-center gap-3">
              <p className="text-brand-caption text-[color:var(--dash-faint)]">
                {currentIndex && total ? `Page ${currentIndex} / ${total}` : "Turn the page"}
              </p>
              {currentIndex && total && total <= 14 ? (
                <span className="hidden items-center gap-1 sm:flex" aria-hidden>
                  {Array.from({ length: total }).map((_, dot) => (
                    <span
                      key={dot}
                      className={
                        dot + 1 === currentIndex
                          ? "h-1.5 w-4 rounded-full bg-[color:var(--dash-navy)]"
                          : "h-1.5 w-1.5 rounded-full bg-[color:var(--dash-surface-border)]"
                      }
                    />
                  ))}
                </span>
              ) : null}
            </div>
            <div className="flex w-full min-w-0 gap-2 @min-[26rem]:w-auto">
              {prevLessonId ? (
                <Link
                  href={lessonHref(courseId, prevLessonId, topicId, l1Name)}
                  onClick={() => scrollAppToTop()}
                  className="lecture-page-action dashboard-navy-btn font-sans inline-flex h-10 min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-medium tracking-[0.01em] text-white @min-[26rem]:flex-initial"
                >
                  <SidebarSvgIcon name="previous" size={16} />
                  <span className="@min-[26rem]:hidden">Prev</span>
                  <span className="hidden @min-[26rem]:inline">Previous page</span>
                </Link>
              ) : null}
              {nextLessonId ? (
                <Button
                  href={lessonHref(courseId, nextLessonId, topicId, l1Name)}
                  onClick={() => scrollAppToTop()}
                  className="lecture-page-action min-w-0 flex-1 px-5 @min-[26rem]:flex-initial"
                >
                  <span className="@min-[26rem]:hidden">Next</span>
                  <span className="hidden @min-[26rem]:inline">Next page</span>
                  <SidebarSvgIcon name="next" size={16} />
                </Button>
              ) : null}
            </div>
          </footer>
        )}
      </article>

      <LessonQuizOverlay
        open={quizOpen}
        courseId={courseId}
        lessonId={lesson.lesson_id}
        lessonTitle={lesson.title}
        variants={lesson.variants}
        onClose={() => setQuizOpen(false)}
        onSubmitted={setLatestResult}
      />
    </div>
  );
}
