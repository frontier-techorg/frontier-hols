import { Suspense } from "react";
import { PortalGate } from "@/components/platform/provider/PortalGate";
import { StudentSettingsPage } from "@/components/platform/provider/student/profile/StudentSettingsPage";

export default function StudentProfilePlansRoute() {
  return (
    <PortalGate role="student">
      <Suspense fallback={null}>
        <StudentSettingsPage section="plan" />
      </Suspense>
    </PortalGate>
  );
}
