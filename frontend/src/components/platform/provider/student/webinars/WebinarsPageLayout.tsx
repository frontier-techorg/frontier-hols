"use client";

import Link from "next/link";
import { Icon, Menu } from "@/components/icons";
import { PortalShell } from "@/components/platform/provider/PortalShell";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { studentNav } from "@/components/platform/provider/student/studentNav";

type WebinarsPageLayoutProps = {
  title?: string;
  backHref?: string;
  backLabel?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
};

function openSidebar() {
  window.dispatchEvent(new Event("hols-portal-open-sidebar"));
}

export function WebinarsPageLayout({
  title = "Webinars",
  backHref,
  backLabel = "Back to webinars",
  headerRight,
  children,
}: WebinarsPageLayoutProps) {
  return (
    <PortalShell
      role="student"
      title={title}
      showPageHeader={false}
      contentFlush
      brandBackdrop
      nav={studentNav}
    >
      <div className="dashboard-screen lectures-page webinars-page relative min-w-0 overflow-x-hidden">
        <header className="mb-3 flex min-h-10 min-w-0 items-center gap-2 sm:mb-3 sm:min-h-12 sm:gap-3">
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
                aria-label={backLabel}
                className="webinar-back-btn flex h-10 w-8 shrink-0 items-center justify-center rounded-full no-underline"
              >
                <SidebarSvgIcon name="back" size={32} className="webinar-back-mark" />
              </Link>
            ) : null}

            <h1
              className="font-sans min-w-0 overflow-visible py-1 text-lg font-bold leading-normal tracking-[0.01em] text-[color:var(--dash-text)] sm:text-xl md:text-2xl"
              title={title}
            >
              {title}
            </h1>
          </div>

          <div className="min-w-0 flex-1" aria-hidden />

          {headerRight ? (
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">{headerRight}</div>
          ) : null}
        </header>

        <div className="grid w-full min-w-0 gap-3 sm:gap-4">{children}</div>
      </div>
    </PortalShell>
  );
}
