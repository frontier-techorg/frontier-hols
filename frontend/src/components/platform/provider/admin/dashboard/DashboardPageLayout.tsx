"use client";

import { Icon, Menu } from "@/components/icons";
import { PortalShell } from "@/components/platform/provider/PortalShell";
import { NotificationsBell } from "@/components/platform/provider/notifications/NotificationsBell";
import { WelcomeChip } from "@/components/platform/provider/student/WelcomeChip";
import { adminNav } from "@/components/platform/provider/admin/adminNav";

type DashboardPageLayoutProps = {
  children: React.ReactNode;
  headerAction?: React.ReactNode;
};

function openSidebar() {
  window.dispatchEvent(new Event("hols-portal-open-sidebar"));
}

export function DashboardPageLayout({ children, headerAction }: DashboardPageLayoutProps) {
  return (
    <PortalShell
      role="admin"
      title="Dashboard"
      showPageHeader={false}
      contentFlush
      brandBackdrop
      nav={adminNav}
    >
      <div className="dashboard-screen lectures-page student-home min-w-0 overflow-x-hidden">
        <header className="mb-4 flex min-h-10 min-w-0 items-center gap-2 sm:mb-5 sm:min-h-12 sm:gap-3 md:gap-4">
          <button
            type="button"
            aria-label="Open sidebar"
            onClick={openSidebar}
            className="dashboard-icon-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-full lg:hidden sm:h-12 sm:w-12"
          >
            <Icon icon={Menu} size={18} />
          </button>

          <h1 className="font-sans min-w-0 truncate py-1 text-lg font-bold leading-normal tracking-[0.01em] text-[color:var(--dash-text)] sm:text-xl md:text-2xl">
            Dashboard
          </h1>

          <div className="min-w-0 flex-1" aria-hidden />

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
            {headerAction}
            <NotificationsBell buttonClassName="dashboard-notify-btn relative flex h-10 w-10 items-center justify-center rounded-full sm:h-12 sm:w-12" />
            <WelcomeChip fallbackName="Admin" tone="navy" className="lecture-header-welcome h-10" />
          </div>
        </header>

        <div className="grid w-full min-w-0 gap-3 sm:gap-4">{children}</div>
      </div>
    </PortalShell>
  );
}
