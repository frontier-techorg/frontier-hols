"use client";

import Link from "next/link";
import { Icon, Menu } from "@/components/icons";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";

type AdviserChatHeaderStripProps = {
  patientName: string;
};

function openSidebar() {
  window.dispatchEvent(new Event("hols-portal-open-sidebar"));
}

/** Full-bleed milky frosted-glass top bar (sibling above the transcript scrollport). */
export function AdviserChatHeaderStrip({ patientName }: AdviserChatHeaderStripProps) {
  const heading = patientName.trim()
    ? `AI assistant for ${patientName.trim()}`
    : "AI assistant";

  return (
    <div className="adviser-chat-header-strip">
      <div className="adviser-chat-header-frost" aria-hidden="true">
        <span className="adviser-chat-header-refraction adviser-chat-header-refraction--one" />
        <span className="adviser-chat-header-refraction adviser-chat-header-refraction--two" />
        <span className="adviser-chat-header-refraction adviser-chat-header-refraction--three" />
      </div>
      <div className="adviser-chat-header-chrome">
        <button
          type="button"
          aria-label="Open sidebar"
          onClick={openSidebar}
          className="dashboard-icon-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-full lg:hidden"
        >
          <Icon icon={Menu} size={18} />
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-0.5">
          <Link
            href="/student/adviser"
            aria-label="Back to Peptide Advisor"
            className="adviser-chat-back-btn flex h-10 w-8 shrink-0 items-center justify-center rounded-full no-underline"
          >
            <SidebarSvgIcon name="back" size={32} className="adviser-chat-back-mark" />
          </Link>

          <h1
            className="font-sans min-w-0 flex-1 truncate py-1 text-base font-bold leading-normal tracking-[0.01em] text-[color:var(--dash-text)] sm:text-xl md:text-2xl"
            title={heading}
          >
            {heading}
          </h1>
        </div>
      </div>
    </div>
  );
}
