import { Suspense } from "react";
import { PortalGate } from "@/components/platform/provider/PortalGate";
import { StudentPlansScreen } from "@/components/platform/provider/student/payment/StudentPlansScreen";

export default function StudentPlansRoute() {
  return (
    <PortalGate role="student">
      <Suspense fallback={null}>
        <StudentPlansScreen />
      </Suspense>
    </PortalGate>
  );
}
