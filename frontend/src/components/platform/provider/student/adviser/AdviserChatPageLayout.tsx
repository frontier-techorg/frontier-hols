"use client";

import { PortalShell } from "@/components/platform/provider/PortalShell";
import { AdviserChatHeaderStrip } from "@/components/platform/provider/student/adviser/AdviserChatHeaderStrip";
import { studentNav } from "@/components/platform/provider/student/studentNav";

type AdviserChatPageLayoutProps = {
  patientName: string;
  children: React.ReactNode;
};

export function AdviserChatPageLayout({
  patientName,
  children,
}: AdviserChatPageLayoutProps) {
  return (
    <PortalShell
      role="student"
      title={patientName.trim() || "AI assistant"}
      showPageHeader={false}
      contentFlush
      brandBackdrop
      nav={studentNav}
    >
      <div className="adviser-chat-screen dashboard-screen relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <AdviserChatHeaderStrip patientName={patientName} />
        <div className="adviser-chat-body relative flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </PortalShell>
  );
}
