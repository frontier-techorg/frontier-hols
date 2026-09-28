"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { LessonLearningSkeleton } from "@/components/platform/provider/student/DashboardSkeletons";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import type { LessonDetail } from "@/lib/integrate/provider/student/lectures";
import { BookOpen, Highlighter, Icon, Moon, Sun } from "@/components/icons";
import { cn } from "@/lib/utils";
import { LessonProse } from "./lessonProse";
import {
  LessonMarkerOverlay,
  MARKER_COLORS,
  MARKER_SIZES,
  loadMarkerStrokes,
  saveMarkerStrokes,
  type MarkerColorId,
  type MarkerSizeId,
  type MarkerStroke,
} from "./LessonMarkerOverlay";

const ZOOM_STEPS = [0.9, 1, 1.12, 1.25, 1.4, 1.55] as const;
const BASE_FONT_PX = 17;
const LINE_HEIGHT_STEPS = { compact: 1.65, normal: 1.85, relaxed: 2.05 } as const;
const PREFS_KEY = "hols-learning-prefs";

type LayoutWidth = "center" | "full";
type ReadingTheme = "light" | "sepia" | "dark";
type LineSpacing = keyof typeof LINE_HEIGHT_STEPS;

type LearningPrefs = {
  layout: LayoutWidth;
  theme: ReadingTheme;
  spacing: LineSpacing;
  zoomIndex: number;
  focusMode: boolean;
  markerColor: MarkerColorId;
  markerSize: MarkerSizeId;
};

type LessonLearningViewProps = {
  lesson: LessonDetail;
  detailLoading?: boolean;
  currentIndex?: number | null;
  total?: number;
  onExit: () => void;
};

type ReadingSection = {
  title: string | null;
  body: string;
};

function loadPrefs(): Partial<LearningPrefs> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(sessionStorage.getItem(PREFS_KEY) ?? "{}") as Partial<LearningPrefs>;
  } catch {
    return {};
  }
}

function resolveInitialTheme(saved: Partial<LearningPrefs>): ReadingTheme {
  if (saved.theme) return saved.theme;
  if (typeof document !== "undefined") {
    const portal = document.querySelector(".portal-shell");
    if (portal?.getAttribute("data-theme") === "dark") return "dark";
  }
  return "light";
}

function savePrefs(prefs: LearningPrefs) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

function buildReadingSections(lesson: LessonDetail): ReadingSection[] {
  const sections: ReadingSection[] = [];
  if (lesson.fact?.trim()) sections.push({ title: null, body: lesson.fact.trim() });
  if (lesson.text_content?.trim()) sections.push({ title: "Full Text", body: lesson.text_content.trim() });
  if (lesson.study_bullets?.trim()) sections.push({ title: "Study Bullets", body: lesson.study_bullets.trim() });
  return sections;
}

function clearHighlights(container: HTMLElement | null) {
  if (!container) return;
  container.querySelectorAll("mark.lesson-text-highlight").forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
  });
}

const Icons = {
  light: <Icon icon={Sun} size={15} />,
  sepia: <Icon icon={BookOpen} size={15} />,
  dark: <Icon icon={Moon} size={15} />,
  highlight: <Icon icon={Highlighter} size={15} />,
  book: <Icon icon={BookOpen} size={15} />,
};

function ToolButton({
  onClick,
  disabled,
  active,
  label,
  children,
  className,
}: {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        "lesson-learning-tool inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition",
        active
          ? "is-active bg-[#142644] text-white [.lesson-learning-theme-dark_&]:bg-[#C5D63A] [.lesson-learning-theme-dark_&]:text-[#142644]"
          : "text-[#152744] [.lesson-learning-theme-dark_&]:text-[#e8eef6] [.lesson-learning-theme-sepia_&]:text-[#3d3428]",
        disabled && "cursor-not-allowed opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}

function IconSegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Array<{ id: T; label: string; icon: ReactNode }>;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="lesson-learning-seg inline-flex shrink-0 items-center gap-0.5 rounded-full p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          title={option.label}
          aria-label={option.label}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            "lesson-learning-seg-btn inline-flex h-8 w-8 items-center justify-center rounded-full transition",
            value === option.id
              ? "is-active bg-[#142644] text-white [.lesson-learning-theme-dark_&]:bg-[#C5D63A] [.lesson-learning-theme-dark_&]:text-[#142644]"
              : "text-[#152744] [.lesson-learning-theme-dark_&]:text-[#e8eef6] [.lesson-learning-theme-sepia_&]:text-[#3d3428]",
          )}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}

export function LessonLearningView({
  lesson,
  detailLoading = false,
  currentIndex,
  total,
  onExit,
}: LessonLearningViewProps) {
  const saved = loadPrefs();
  const sections = buildReadingSections(lesson);
  const scrollRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [zoomIndex, setZoomIndex] = useState(saved.zoomIndex ?? 2);
  const [highlightMode, setHighlightMode] = useState(false);
  const [markerMode, setMarkerMode] = useState(false);
  const [markerColor] = useState<MarkerColorId>(saved.markerColor ?? "yellow");
  const [markerSize] = useState<MarkerSizeId>(saved.markerSize ?? "medium");
  const [markerStrokes, setMarkerStrokes] = useState<MarkerStroke[]>([]);
  const [layout] = useState<LayoutWidth>(saved.layout ?? "center");
  const [theme, setTheme] = useState<ReadingTheme>(() => resolveInitialTheme(saved));
  const [spacing] = useState<LineSpacing>(saved.spacing ?? "normal");
  const [focusMode] = useState(saved.focusMode ?? false);
  const [scrollProgress, setScrollProgress] = useState(0);

  const fontSize = BASE_FONT_PX * ZOOM_STEPS[zoomIndex];
  const lineHeight = LINE_HEIGHT_STEPS[spacing];
  const zoomLabel = `${Math.round(ZOOM_STEPS[zoomIndex] * 100)}%`;
  const activeMarkerColor = MARKER_COLORS.find((item) => item.id === markerColor) ?? MARKER_COLORS[0];
  const activeMarkerWidth = MARKER_SIZES.find((item) => item.id === markerSize) ?? MARKER_SIZES[1];

  const lessonIdRef = useRef(lesson.lesson_id);
  lessonIdRef.current = lesson.lesson_id;

  useEffect(() => {
    savePrefs({ layout, theme, spacing, zoomIndex, focusMode, markerColor, markerSize });
  }, [focusMode, layout, markerColor, markerSize, spacing, theme, zoomIndex]);

  useEffect(() => {
    saveMarkerStrokes(lessonIdRef.current, markerStrokes);
  }, [markerStrokes]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    clearHighlights(contentRef.current);
    setHighlightMode(false);
    setMarkerMode(false);
    setScrollProgress(0);
    setMarkerStrokes(loadMarkerStrokes(lesson.lesson_id));
  }, [lesson.lesson_id]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    function onScroll() {
      if (!element) return;
      const max = element.scrollHeight - element.clientHeight;
      setScrollProgress(max > 0 ? (element.scrollTop / max) * 100 : 0);
    }

    onScroll();
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, [lesson.lesson_id, detailLoading]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (markerMode) {
          setMarkerMode(false);
          return;
        }
        if (highlightMode) {
          setHighlightMode(false);
          return;
        }
        onExit();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "=") {
        event.preventDefault();
        setZoomIndex((index) => Math.min(ZOOM_STEPS.length - 1, index + 1));
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "-") {
        event.preventDefault();
        setZoomIndex((index) => Math.max(0, index - 1));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [highlightMode, markerMode, onExit]);

  const enableHighlightMode = useCallback(() => {
    setMarkerMode(false);
    setHighlightMode((value) => !value);
  }, []);

  const applyHighlight = useCallback(() => {
    if (!highlightMode || !contentRef.current) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    if (!contentRef.current.contains(range.commonAncestorContainer)) return;

    const mark = document.createElement("mark");
    mark.className = "lesson-text-highlight";

    try {
      range.surroundContents(mark);
    } catch {
      const extracted = range.extractContents();
      mark.appendChild(extracted);
      range.insertNode(mark);
    }

    selection.removeAllRanges();
  }, [highlightMode]);

  return (
    <div
      className={cn(
        "lesson-learning-view fixed inset-0 z-[120] flex flex-col",
        `lesson-learning-theme-${theme}`,
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Learning mode"
    >
      <header className="lesson-learning-header shrink-0 border-b px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-sm md:px-4 md:py-2.5">
        <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-2">
          <div className="flex min-w-0 items-center gap-2 md:contents">
            <button
              type="button"
              onClick={onExit}
              aria-label="Close learning mode"
              className="lesson-learning-close inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            >
              <SidebarSvgIcon name="cross" size={24} strokeWidth={2.25} />
            </button>

            <div className="lesson-learning-meta flex min-w-0 flex-1 items-center gap-2 text-sm font-medium md:flex-initial">
              <span className="lesson-learning-chip inline-flex h-7 max-w-full shrink-0 items-center rounded-full px-2.5 text-xs font-semibold">
                {currentIndex && total ? `${currentIndex} / ${total}` : `Lesson ${lesson.order}`}
              </span>
              {scrollProgress > 0 ? (
                <span className="min-w-0 truncate text-xs opacity-70">{Math.round(scrollProgress)}% read</span>
              ) : null}
            </div>
          </div>

          <div className="lesson-learning-toolbar flex w-full min-w-0 flex-wrap items-center gap-1.5 md:ml-auto md:w-auto">
            <IconSegmentedControl
              ariaLabel="Reading theme"
              value={theme}
              onChange={setTheme}
              options={[
                { id: "light", label: "Light theme", icon: Icons.light },
                { id: "sepia", label: "Sepia theme", icon: Icons.sepia },
                { id: "dark", label: "Dark theme", icon: Icons.dark },
              ]}
            />

            <div className="lesson-learning-seg inline-flex shrink-0 items-center gap-0.5 rounded-full p-0.5">
              <ToolButton
                label="Zoom out"
                disabled={zoomIndex <= 0}
                onClick={() => setZoomIndex((index) => Math.max(0, index - 1))}
                className="!bg-transparent"
              >
                <SidebarSvgIcon name="minus" size={16} />
              </ToolButton>
              <span className="lesson-learning-meta min-w-[2.75rem] text-center text-xs font-semibold tabular-nums">
                {zoomLabel}
              </span>
              <ToolButton
                label="Zoom in"
                disabled={zoomIndex >= ZOOM_STEPS.length - 1}
                onClick={() => setZoomIndex((index) => Math.min(ZOOM_STEPS.length - 1, index + 1))}
                className="!bg-transparent"
              >
                <SidebarSvgIcon name="plus" size={16} />
              </ToolButton>
            </div>

            <ToolButton
              label="Text highlight"
              active={highlightMode}
              onClick={enableHighlightMode}
            >
              {Icons.highlight}
            </ToolButton>
          </div>
        </div>
      </header>

      <div className="lesson-learning-progress h-0.5 w-full">
        <div
          className="lesson-learning-progress-bar h-full transition-[width] duration-150"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      <div
        ref={scrollRef}
        className={cn(
          "lesson-learning-stage min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-4 md:px-6",
          markerMode && "lesson-learning-marker-scroll",
        )}
      >
        <article
          ref={articleRef}
          className={cn(
            "lesson-learning-page relative mx-auto my-3 w-full min-w-0 px-4 py-5 transition-[max-width,padding,box-shadow] duration-300 sm:my-6 sm:px-6 sm:py-7 md:my-8 md:px-10 md:py-9",
            layout === "center" ? "max-w-3xl" : "max-w-none lg:max-w-5xl",
          )}
        >
          {!focusMode ? (
            <div className="mb-4 flex flex-wrap gap-2">
              <span className="lesson-learning-badge inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
                {Icons.book}
                Lesson {lesson.order}
              </span>
              {lesson.l2_name ? (
                <span className="lesson-learning-tag inline-flex max-w-full rounded-full px-3 py-1 text-xs font-medium break-words">
                  {lesson.l2_name}
                </span>
              ) : null}
            </div>
          ) : null}

          <h1
            className="lesson-learning-title font-sans break-words font-bold leading-tight tracking-[0.01em] text-balance"
            style={{ fontSize: `${fontSize * 1.35}px`, lineHeight: 1.25 }}
          >
            {lesson.title}
          </h1>

          {detailLoading ? (
            <LessonLearningSkeleton />
          ) : sections.length === 0 ? (
            <p className="lesson-learning-body mt-6" style={{ fontSize: `${fontSize}px`, lineHeight }}>
              No lesson content available yet.
            </p>
          ) : (
            <div
              ref={contentRef}
              className={cn("mt-5 space-y-6 sm:mt-6 sm:space-y-7", highlightMode && "lesson-learning-highlight-mode")}
              onMouseUp={applyHighlight}
            >
              {sections.map((section, index) => (
                <div key={`${section.title ?? "main"}-${index}`}>
                  {!focusMode && section.title ? (
                    <h2
                      className="lesson-learning-section-label mb-2.5 font-semibold uppercase tracking-[0.1em]"
                      style={{ fontSize: `${Math.max(11, fontSize * 0.7)}px` }}
                    >
                      {section.title}
                    </h2>
                  ) : null}
                  <div
                    className="lesson-learning-body"
                    style={{ fontSize: `${fontSize}px`, lineHeight }}
                  >
                    <LessonProse text={section.body} />
                  </div>
                </div>
              ))}
            </div>
          )}

          <LessonMarkerOverlay
            active={markerMode}
            containerRef={articleRef}
            scrollRef={scrollRef}
            layoutKey={`${layout}-${spacing}-${zoomIndex}-${detailLoading}-${sections.length}`}
            color={activeMarkerColor.value}
            width={activeMarkerWidth.value}
            strokes={markerStrokes}
            onStrokesChange={setMarkerStrokes}
          />
        </article>
      </div>
    </div>
  );
}

export function LearningModeToggle({
  active,
  onToggle,
  disabled,
}: {
  active: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "lecture-page-action dashboard-navy-btn font-sans inline-flex h-10 min-h-10 w-full items-center justify-center gap-1.5 rounded-full px-5 text-sm font-medium tracking-[0.01em] text-white",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      {Icons.book}
      {active ? "Learning mode on" : "Learning mode"}
    </button>
  );
}
