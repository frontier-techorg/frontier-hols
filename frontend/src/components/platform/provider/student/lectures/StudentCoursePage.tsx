"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useGSAP } from "@gsap/react";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import {
  RomanChapterIcon,
  SidebarSvgIcon,
} from "@/components/platform/provider/sidebar-icons";
import { CourseCoverArt } from "@/components/platform/provider/student/lectures/CourseCoverArt";
import {
  getCoverDisplayTitle,
  hashCourseId,
  resolveCourseCover,
} from "@/components/platform/provider/student/lectures/courseCover";
import {
  CoursePageLayout,
} from "@/components/platform/provider/student/lectures/CoursePageLayout";
import {
  CoursePageSkeleton,
  lectureOverviewGridClass,
} from "@/components/platform/provider/student/DashboardSkeletons";
import { LectureMembershipLockedScreen } from "@/components/platform/provider/student/lectures/LectureMembershipLock";
import {
  getPortalThemeSnapshot,
  subscribePortalTheme,
} from "@/components/platform/provider/portal-theme-store";
import { useServerPortalTheme } from "@/components/platform/provider/PortalThemeProvider";
import { ApiRequestError } from "@/lib/integrate/client";
import { gsap, registerGsap } from "@/lib/gsap";
import { prefersReducedMotion } from "@/lib/motion";
import {
  getCourseBundle,
  type CourseSummary,
  type SectionSummary,
  type TopicSummary,
} from "@/lib/integrate/provider/student/lectures";
import {
  isMembershipRequiredError,
  useStudentMembershipAccess,
} from "@/lib/integrate/provider/student/payment/membershipAccess";
import { cn } from "@/lib/utils";

type StudentCoursePageProps = {
  courseId: string;
};

type TopicGroup = TopicSummary & {
  sections: SectionSummary[];
};

export function StudentCoursePage({ courseId }: StudentCoursePageProps) {
  const membershipAccess = useStudentMembershipAccess();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiLocked, setApiLocked] = useState(false);
  const [course, setCourse] = useState<CourseSummary | null>(null);
  const [topics, setTopics] = useState<TopicSummary[]>([]);
  const [sections, setSections] = useState<SectionSummary[]>([]);
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const bundle = await getCourseBundle(courseId);
      setCourse(bundle.course);
      setTopics(bundle.topics);
      setSections(bundle.sections);
      setExpandedTopic((current) => current ?? bundle.topics[0]?.l1_name ?? null);
    } catch (err) {
      if (isMembershipRequiredError(err)) {
        setApiLocked(true);
        return;
      }
      setError(err instanceof ApiRequestError ? err.message : "Failed to load course.");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    if (!membershipAccess.ready || membershipAccess.locked) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load, membershipAccess.locked, membershipAccess.ready]);

  const topicGroups = useMemo<TopicGroup[]>(() => {
    return [...topics]
      .sort((a, b) => a.order - b.order)
      .map((topic) => ({
        ...topic,
        sections: sections
          .filter((section) => section.l1_name === topic.l1_name)
          .sort((a, b) => a.order - b.order),
      }));
  }, [sections, topics]);

  useGSAP(
    () => {
      registerGsap();
      if (prefersReducedMotion() || !stageRef.current || !course) return;

      const cover = stageRef.current.querySelector("[data-book-cover]");
      const coverArt = stageRef.current.querySelector("[data-book-cover-art]");
      const toc = stageRef.current.querySelector("[data-book-toc]");
      const rows = stageRef.current.querySelectorAll("[data-toc-row]");

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      if (cover) {
        tl.fromTo(
          cover,
          { opacity: 0, y: 28, rotate: -1.5 },
          { opacity: 1, y: 0, rotate: 0, duration: 0.7 },
          0,
        );
      }
      if (coverArt) {
        tl.fromTo(
          coverArt,
          { opacity: 0 },
          { opacity: 1, duration: 1.1, ease: "power2.out" },
          0.08,
        );
      }
      if (toc) {
        tl.fromTo(toc, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.55 }, 0.12);
      }
      if (rows.length) {
        tl.fromTo(
          rows,
          { opacity: 0, x: -12 },
          { opacity: 1, x: 0, duration: 0.35, stagger: 0.05 },
          0.28,
        );
      }
    },
    { dependencies: [course?.course_id, topicGroups.length], scope: stageRef },
  );

  if (!membershipAccess.ready) {
    return (
      <CoursePageLayout
        title="Course"
        description=""
        courseId={courseId}
        courseNavActive="overview"
        backHref="/student/lectures"
        backLabel="All lectures"
        hideHero
      >
        <CoursePageSkeleton />
      </CoursePageLayout>
    );
  }

  if (membershipAccess.locked || apiLocked) {
    return <LectureMembershipLockedScreen />;
  }

  return (
    <CoursePageLayout
      title={course?.title ?? "Course"}
      description=""
      courseId={courseId}
      courseNavActive="overview"
      backHref="/student/lectures"
      backLabel="All lectures"
      hideHero
    >
      {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}

      {loading && !course ? <CoursePageSkeleton /> : null}

      {course ? (
        <div className="@container min-w-0 w-full">
        <div ref={stageRef} className={lectureOverviewGridClass}>
          <HolsVolume course={course} courseId={courseId} topicGroups={topicGroups} />

          <TableOfContents
            courseId={courseId}
            topicGroups={topicGroups}
            expandedTopic={expandedTopic}
            onToggle={(name) =>
              setExpandedTopic((current) => (current === name ? null : name))
            }
          />
        </div>
        </div>
      ) : null}
    </CoursePageLayout>
  );
}

function HolsVolume({
  course,
  courseId,
  topicGroups,
}: {
  course: CourseSummary;
  courseId: string;
  topicGroups: TopicGroup[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const serverTheme = useServerPortalTheme();
  const paperTheme = useSyncExternalStore(
    subscribePortalTheme,
    getPortalThemeSnapshot,
    () => serverTheme,
  );
  const displayTitle = getCoverDisplayTitle(course.title);
  const cover = resolveCourseCover(courseId, course.title);
  const isBookCover = cover.layout === "book";
  const isCustomVialCover = cover.isCustom && cover.layout !== "book";
  // Books bake the title into art; product vials need the overview title visible.
  const hideTitleOverlay = Boolean(cover.titleInArt && isBookCover);
  const volumeIndex = String((hashCourseId(courseId) % 12) + 1).padStart(2, "0");
  const volumeLabel = course.section?.trim()
    ? course.section.toUpperCase()
    : isCustomVialCover
      ? "LECTURES"
      : `VOLUME ${volumeIndex}`;
  const previewTopics = topicGroups.slice(0, 5);
  const description =
    course.description?.trim() ||
    "A curated clinical reference volume from the HOLS library.";

  const toggleOpen = useCallback(() => {
    setIsOpen((current) => !current);
  }, []);

  const handleCoverKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleOpen();
    }
  };

  return (
    <div className="hols-volume-panel min-w-0 w-full max-w-full">
      <div
        data-book-cover
        data-paper-theme={paperTheme}
        className={cn("hols-volume", isOpen && "is-open")}
        aria-label={`${course.title} volume`}
      >
        {/* Assembly tilts as one unit (cover + page stack); cover still flips independently when open */}
        <div className="book-assembly">
          <div className="book-stack" aria-hidden>
            <div className="book-page-layer book-page-layer--3" />
            <div className="book-page-layer book-page-layer--2" />
            <div className="book-page-layer book-page-layer--1" />
          </div>

          <div
            className="book-interior"
            aria-hidden={!isOpen}
            inert={!isOpen ? true : undefined}
          >
            <div className="book-interior-grain" aria-hidden />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/logo/hols-logo-mark.png"
              alt=""
              className="book-interior-watermark"
              draggable={false}
              aria-hidden
            />

            <div className="book-interior-content">
              <div className="book-interior-header">
                <p className="book-interior-eyebrow">HOLS Clinical Library</p>
                <button
                  type="button"
                  className="book-interior-close"
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsOpen(false);
                  }}
                  aria-label="Close volume"
                >
                  <SidebarSvgIcon name="cross" size={24} strokeWidth={2.15} className="sm:hidden" />
                  <SidebarSvgIcon name="cross" size={28} strokeWidth={2.15} className="hidden sm:block" />
                </button>
              </div>

              <h3 className="book-interior-title font-sans">Volume overview</h3>
              <p className="book-interior-description">{description}</p>

              {previewTopics.length > 0 ? (
                <div className="book-interior-section">
                  <p className="book-interior-section-label">In this volume</p>
                  <ul className="book-interior-topics">
                    {previewTopics.map((topic, index) => (
                      <li key={`${topic.topic_key}-${topic.order}`}>
                        <span className="book-interior-topic-index">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="book-interior-topic-name">{topic.l1_name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <dl className="book-interior-metrics">
                <div>
                  <dt>Chapters</dt>
                  <dd>{course.topic_count}</dd>
                </div>
                <div>
                  <dt>Lessons</dt>
                  <dd>{course.lesson_count}</dd>
                </div>
              </dl>
            </div>
          </div>

          <button
            type="button"
            className="book-cover"
            onClick={toggleOpen}
            onKeyDown={handleCoverKeyDown}
            aria-expanded={isOpen}
            aria-label={isOpen ? "Close volume cover" : "Open volume cover"}
          >
            <div className="book-cover-face">
              <div className="book-cover-base" aria-hidden />
              <div className="book-cover-spotlight" aria-hidden />
              <div className="book-cover-art-bg" data-book-cover-art aria-hidden>
                <CourseCoverArt courseId={courseId} title={course.title} variant="panel" />
              </div>
              <div className="book-cover-vignette" aria-hidden />
              <div className="book-cover-ambient" aria-hidden />
              <div className="book-cover-grain" aria-hidden />
              <div className="book-cover-shine" aria-hidden />
              <div className="book-cover-foil-edge" aria-hidden />

              {/* Soft embossed mark — brand presence without sticker clutter */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/logo/hols-logo-mark.png"
                alt=""
                className="book-cover-mark-watermark book-cover-mark-watermark--theme-dark"
                draggable={false}
                aria-hidden
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/logo/hols-logo-mark-light.png"
                alt=""
                className="book-cover-mark-watermark book-cover-mark-watermark--theme-light"
                draggable={false}
                aria-hidden
              />

              <div
                className={cn(
                  "book-cover-content",
                  isCustomVialCover && "book-cover-content--photo-vial",
                  hideTitleOverlay && "book-cover-content--art-title",
                )}
              >
                <header className="book-cover-header">
                  <div className="book-cover-brand">
                    <div className="book-cover-logo-wrap" aria-label="HOLS">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/assets/logo/hols-logo-mark.png"
                        alt=""
                        className="book-cover-mark book-cover-mark--theme-dark"
                        draggable={false}
                      />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/assets/logo/hols-logo-mark-light.png"
                        alt=""
                        className="book-cover-mark book-cover-mark--theme-light"
                        draggable={false}
                      />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/assets/logo/hols-logo.png"
                        alt=""
                        className="book-cover-logo book-cover-logo--theme-dark"
                        draggable={false}
                      />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/assets/logo/hols-logo-light.png"
                        alt=""
                        className="book-cover-logo book-cover-logo--theme-light"
                        draggable={false}
                      />
                    </div>
                    {!isCustomVialCover ? (
                      <p className="book-cover-publisher">HOLS Library</p>
                    ) : null}
                  </div>
                  {!isCustomVialCover ? (
                    <p className="book-cover-volume-label">
                      <span className="book-cover-volume-label-text">{volumeLabel}</span>
                    </p>
                  ) : null}
                </header>

                <h2
                  className={cn(
                    "book-cover-title font-sans",
                    hideTitleOverlay && "sm:sr-only",
                  )}
                >
                  {displayTitle}
                </h2>

                {isCustomVialCover && !hideTitleOverlay ? (
                  <p className="book-cover-volume-label">
                    <span className="book-cover-volume-label-text">{volumeLabel}</span>
                  </p>
                ) : null}

                <div className="book-cover-rule" aria-hidden />

                <footer className="book-cover-footer">
                  <span className="book-cover-footer-brand">House of Life Sciences</span>
                  <span className="book-cover-footer-dot" aria-hidden>
                    •
                  </span>
                  <span className="book-cover-footer-meta">
                    {course.topic_count} chapter{course.topic_count === 1 ? "" : "s"} ·{" "}
                    {course.lesson_count} lesson{course.lesson_count === 1 ? "" : "s"}
                  </span>
                </footer>
              </div>

              {!isOpen ? (
                <span className="book-open-hint" aria-hidden>
                  Open volume
                </span>
              ) : null}
            </div>

            <div className="book-cover-spine" aria-hidden />
            <div className="book-cover-edge" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

function TableOfContents({
  courseId,
  topicGroups,
  expandedTopic,
  onToggle,
}: {
  courseId: string;
  topicGroups: TopicGroup[];
  expandedTopic: string | null;
  onToggle: (name: string) => void;
}) {
  return (
    <section
      data-book-toc
      className="dashboard-glass-card course-book-toc relative min-w-0 w-full overflow-hidden rounded-2xl p-4 sm:p-5 md:p-6"
    >
      <div className="flex flex-col gap-3 border-b border-[color:var(--dash-surface-border)] pb-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-faint)]">
            Inside this volume
          </p>
          <h2 className="font-sans mt-1 text-lg font-bold tracking-[0.01em] text-[color:var(--dash-text)] sm:text-2xl">
            Table of contents
          </h2>
          <p className="text-brand-caption mt-1.5 text-[color:var(--dash-muted)]">
            Expand a chapter, then open a section to begin reading.
          </p>
        </div>
        <Link
          href={`/student/lectures/${courseId}/lessons`}
          className="lecture-page-action dashboard-navy-btn font-sans inline-flex h-10 min-h-10 w-full shrink-0 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-medium tracking-[0.01em] text-white sm:w-auto"
        >
          Start reading
          <SidebarSvgIcon name="next" size={15} />
        </Link>
      </div>

      {topicGroups.length === 0 ? (
        <p className="py-10 text-center font-sans text-sm text-[color:var(--dash-faint)]">
          No chapters available yet.
        </p>
      ) : (
        <ol className="mt-1 divide-y divide-[color:var(--dash-surface-border)]">
          {topicGroups.map((topic, index) => (
            <TopicChapter
              key={`${topic.topic_key}-${topic.order}`}
              courseId={courseId}
              topic={topic}
              index={index}
              expanded={expandedTopic === topic.l1_name}
              onToggle={() => onToggle(topic.l1_name)}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function TopicChapter({
  courseId,
  topic,
  index,
  expanded,
  onToggle,
}: {
  courseId: string;
  topic: TopicGroup;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    if (prefersReducedMotion()) {
      panel.style.height = expanded ? "auto" : "0px";
      panel.style.opacity = expanded ? "1" : "0";
      return;
    }

    registerGsap();
    if (expanded) {
      gsap.set(panel, { height: "auto", opacity: 1 });
      const full = panel.scrollHeight;
      gsap.fromTo(
        panel,
        { height: 0, opacity: 0 },
        { height: full, opacity: 1, duration: 0.35, ease: "power2.out", clearProps: "height" },
      );
    } else {
      gsap.to(panel, { height: 0, opacity: 0, duration: 0.25, ease: "power2.in" });
    }
  }, [expanded]);

  return (
    <li data-toc-row className="py-1">
      <button
        type="button"
        onClick={onToggle}
        data-expanded={expanded}
        className={cn(
          "course-toc-row flex min-h-10 w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left sm:gap-3 sm:px-3",
          expanded && "bg-[color:var(--dash-soft)]",
        )}
        aria-expanded={expanded}
      >
        <span className="dashboard-tool-icon course-toc-badge flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[color:var(--dash-text)]">
          <RomanChapterIcon index={index} size={18} aria-hidden />
          <span className="sr-only">Chapter {index + 1}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-sans block break-words text-sm font-semibold leading-5 tracking-[0.005em] text-[color:var(--dash-text)]">
            {topic.l1_name}
          </span>
          <span className="text-brand-caption mt-0.5 block text-[color:var(--dash-faint)]">
            {topic.section_count} section{topic.section_count === 1 ? "" : "s"} · {topic.lesson_count}{" "}
            lesson{topic.lesson_count === 1 ? "" : "s"}
          </span>
        </span>
        <span className="course-toc-chevron flex shrink-0 items-center justify-center rounded-full" aria-hidden>
          <SidebarSvgIcon name={expanded ? "chevron-up" : "chevron-down"} size={16} strokeWidth={2.25} />
        </span>
      </button>

      <div ref={panelRef} className="overflow-hidden" style={{ height: 0, opacity: 0 }}>
        <div className="pb-2">
          <p className="mb-1.5 pl-[calc(0.625rem+2rem+0.625rem)] pt-2 font-sans text-sm text-[color:var(--dash-faint)] sm:pl-[calc(0.75rem+2rem+0.75rem)]">
            In this chapter
          </p>
          {topic.sections.length === 0 ? (
            <p className="text-brand-caption py-2 text-[color:var(--dash-faint)]">No sections yet.</p>
          ) : (
            <ul className="space-y-1">
              {topic.sections.map((section, sectionIndex) => (
                <SectionEntry
                  key={section.topic_id}
                  courseId={courseId}
                  section={section}
                  index={sectionIndex}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}

function SectionEntry({
  courseId,
  section,
  index,
}: {
  courseId: string;
  section: SectionSummary;
  index: number;
}) {
  const href = `/student/lectures/${courseId}/lessons?topic_id=${encodeURIComponent(section.topic_id)}`;

  return (
    <li>
      <Link
        href={href}
        className="course-section-row hols-option-hover flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 py-1.5 font-sans text-sm sm:gap-3 sm:px-3"
      >
        <span className="font-sans w-8 shrink-0 text-center text-xs font-semibold tabular-nums text-[color:var(--dash-dim)]">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="min-w-0 flex-1 border-b border-dotted border-[color:var(--dash-surface-border)] pb-1">
          <span className="font-sans break-words text-sm font-medium leading-snug text-[color:var(--dash-text)]">
            {section.l2_name}
          </span>
        </span>
        <span className="shrink-0 font-sans text-sm text-[color:var(--dash-faint)]">
          {section.item_count}
        </span>
      </Link>
    </li>
  );
}
