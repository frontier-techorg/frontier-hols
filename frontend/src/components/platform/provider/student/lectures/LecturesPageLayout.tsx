"use client";

import { Icon, Menu } from "@/components/icons";
import { PortalShell } from "@/components/platform/provider/PortalShell";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { studentNav } from "@/components/platform/provider/student/studentNav";
import { cn } from "@/lib/utils";

type LecturesPageLayoutProps = {
  children: React.ReactNode;
  searchQuery?: string;
  onSearchQueryChange?: (value: string) => void;
};

function openSidebar() {
  window.dispatchEvent(new Event("hols-portal-open-sidebar"));
}

function LecturesSearch({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={cn("lecture-library-search lecture-library-search--header w-full", className)}>
      <span className="lecture-library-search-icon" aria-hidden>
        <SidebarSvgIcon name="search" size={16} />
      </span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search lectures…"
        className="hols-plain-control lecture-library-search-input"
        aria-label="Search lectures"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="lecture-library-search-clear"
          aria-label="Clear search"
        >
          <SidebarSvgIcon name="cross" size={14} />
        </button>
      ) : null}
    </label>
  );
}

export function LecturesPageLayout({
  children,
  searchQuery = "",
  onSearchQueryChange,
}: LecturesPageLayoutProps) {
  const search = Boolean(onSearchQueryChange);

  return (
    <PortalShell
      role="student"
      title="Lectures"
      showPageHeader={false}
      contentFlush
      brandBackdrop
      nav={studentNav}
    >
      <div className="dashboard-screen lectures-page min-w-0 overflow-x-hidden">
        <header className="mb-3 flex min-w-0 flex-wrap items-center gap-2 sm:mb-4 sm:min-h-12 sm:flex-nowrap sm:gap-3 md:mb-5 md:gap-4">
          <button
            type="button"
            aria-label="Open sidebar"
            onClick={openSidebar}
            className="dashboard-icon-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-full lg:hidden sm:h-12 sm:w-12"
          >
            <Icon icon={Menu} size={18} />
          </button>

          <h1 className="font-sans min-w-0 flex-1 truncate text-lg font-bold leading-none tracking-[0.01em] text-[color:var(--dash-text)] sm:flex-none sm:text-xl md:text-2xl">
            Lectures
          </h1>

          {search && onSearchQueryChange ? (
            <LecturesSearch
              value={searchQuery}
              onChange={onSearchQueryChange}
              className="w-full min-w-0 basis-full sm:ml-auto sm:w-auto sm:max-w-[20rem] sm:flex-1 sm:basis-auto md:max-w-[22rem]"
            />
          ) : (
            <div className="hidden min-w-0 flex-1 sm:block" aria-hidden />
          )}
        </header>

        <div className="grid w-full min-w-0 gap-3 sm:gap-4">{children}</div>
      </div>
    </PortalShell>
  );
}
