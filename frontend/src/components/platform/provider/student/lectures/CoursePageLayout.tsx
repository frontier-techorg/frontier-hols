"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo } from "react";
import { Icon, Menu } from "@/components/icons";
import { PortalShell } from "@/components/platform/provider/PortalShell";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import {
  CourseOptionNav,
  type CourseOption,
} from "@/components/platform/provider/student/lectures/CourseOptionNav";
import { studentNav } from "@/components/platform/provider/student/studentNav";
import { cn } from "@/lib/utils";

type CalculatorApi = {
  openCalculator: () => void;
  calculatorHref: string;
};

const OpenCalculatorContext = createContext<CalculatorApi>({
  openCalculator: () => undefined,
  calculatorHref: "/student/calculator",
});

export function useOpenCourseCalculator() {
  return useContext(OpenCalculatorContext);
}

type CoursePageLayoutProps = {
  title: string;
  description: string;
  courseId?: string;
  courseNavActive?: CourseOption;
  backHref?: string;
  backLabel?: string;
  /** When true, skip the default dashboard hero (page owns its own cover). */
  hideHero?: boolean;
  heroActions?: React.ReactNode | ((api: CalculatorApi) => React.ReactNode);
  children: React.ReactNode;
};

function openSidebar() {
  window.dispatchEvent(new Event("hols-portal-open-sidebar"));
}

export function CoursePageLayout({
  title,
  description,
  courseId,
  courseNavActive,
  backHref,
  backLabel,
  hideHero = false,
  heroActions,
  children,
}: CoursePageLayoutProps) {
  const router = useRouter();
  const calculatorHref = courseId
    ? `/student/lectures/${courseId}/calculator`
    : "/student/calculator";

  const openCalculator = useCallback(() => {
    router.push(calculatorHref);
  }, [calculatorHref, router]);

  const calculatorApi = useMemo(
    () => ({ openCalculator, calculatorHref }),
    [openCalculator, calculatorHref],
  );

  const resolvedHeroActions =
    typeof heroActions === "function" ? heroActions(calculatorApi) : heroActions;

  return (
    <OpenCalculatorContext.Provider value={calculatorApi}>
      <PortalShell
        role="student"
        title={title}
        showPageHeader={false}
        contentFlush
        brandBackdrop
        nav={studentNav}
      >
        <div className="dashboard-screen lectures-page min-w-0 overflow-x-hidden">
          <header className="mb-3 flex min-h-10 min-w-0 items-center gap-2">
            <button
              type="button"
              aria-label="Open sidebar"
              onClick={openSidebar}
              className="dashboard-icon-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-full lg:hidden"
            >
              <Icon icon={Menu} size={18} />
            </button>

            <div className="flex min-w-0 items-center gap-0.5">
              {backHref ? (
                <Link
                  href={backHref}
                  aria-label={backLabel ?? "Back"}
                  className="lecture-back-btn flex h-10 w-8 shrink-0 items-center justify-center rounded-full no-underline"
                >
                  <SidebarSvgIcon name="back" size={32} className="lecture-back-mark" />
                </Link>
              ) : null}

              <h1 className="font-sans min-w-0 overflow-visible py-1 text-lg font-bold leading-normal tracking-[0.01em] text-[color:var(--dash-text)] sm:text-xl md:text-2xl">
                Lectures
              </h1>
            </div>
          </header>

          {courseId && courseNavActive ? (
            <div className="mb-3 min-w-0 sm:mb-4">
              <CourseOptionNav courseId={courseId} active={courseNavActive} />
            </div>
          ) : null}

          {!hideHero ? (
            <section className="dashboard-hero relative min-w-0 overflow-hidden rounded-2xl p-3.5 sm:p-5 md:p-6">
              <p className="text-brand-caption font-semibold uppercase tracking-[0.08em] text-[color:var(--dash-text)]/55">
                HOLS · Learning
              </p>
              <h2 className="font-sans mt-1.5 break-words text-xl font-bold tracking-[0.01em] text-[color:var(--dash-text)] sm:mt-2 sm:text-2xl md:text-[2.5rem] md:leading-none">
                {title}
              </h2>
              {description ? (
                <p className="text-brand-body mt-2 max-w-lg text-sm text-[color:var(--dash-muted)] sm:text-base">
                  {description}
                </p>
              ) : null}
              {resolvedHeroActions ? (
                <div className="mt-4 flex flex-col gap-2 sm:mt-5 sm:flex-row sm:flex-wrap sm:gap-2.5">
                  {resolvedHeroActions}
                </div>
              ) : null}
            </section>
          ) : null}

          <div className={cn(!hideHero && "mt-4", "grid w-full min-w-0 max-w-full gap-3 sm:gap-4")}>{children}</div>
        </div>
      </PortalShell>
    </OpenCalculatorContext.Provider>
  );
}
