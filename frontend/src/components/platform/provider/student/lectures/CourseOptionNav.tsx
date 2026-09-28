"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export type CourseOption = "overview" | "lessons" | "calculator" | "test-result";

type CourseOptionNavProps = {
  courseId: string;
  active: CourseOption;
};

const OPTIONS: Array<{
  id: CourseOption;
  label: string;
  href: (courseId: string) => string;
}> = [
  {
    id: "overview",
    label: "Overview",
    href: (courseId) => `/student/lectures/${courseId}`,
  },
  {
    id: "lessons",
    label: "Lessons",
    href: (courseId) => `/student/lectures/${courseId}/lessons`,
  },
  {
    id: "calculator",
    label: "Calculator",
    href: (courseId) => `/student/lectures/${courseId}/calculator`,
  },
  {
    id: "test-result",
    label: "Results",
    href: (courseId) => `/student/lectures/${courseId}/test-result`,
  },
];

const optionClass = (isActive: boolean) =>
  cn(
    "lecture-page-action font-sans inline-flex h-10 min-h-10 w-full min-w-0 items-center justify-center whitespace-nowrap rounded-full px-2 text-sm font-medium tracking-[0.01em] transition sm:w-auto sm:shrink-0 sm:px-4",
    isActive
      ? "dashboard-navy-btn text-white"
      : "dashboard-pill-soft text-[color:var(--dash-text)]",
  );

export function CourseOptionNav({ courseId, active }: CourseOptionNavProps) {
  return (
    <nav
      aria-label="Course sections"
      className="grid w-full min-w-0 grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:gap-2"
    >
      {OPTIONS.map((option) => {
        const isActive = option.id === active;
        return (
          <Link
            key={option.id}
            href={option.href(courseId)}
            className={optionClass(isActive)}
            aria-current={isActive ? "page" : undefined}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
