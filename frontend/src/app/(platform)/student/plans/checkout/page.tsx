import { Suspense } from "react";
import { PortalGate } from "@/components/platform/provider/PortalGate";
import { StudentPlanCheckoutPage } from "@/components/platform/provider/student/payment/StudentPlanCheckoutPage";

export default function StudentPlanCheckoutRoute() {
  return (
    <PortalGate role="student">
      <Suspense
        fallback={
          <div className="flex min-h-svh items-center justify-center text-sm text-[color:var(--dash-muted)]">
            Loading checkout…
          </div>
        }
      >
        <StudentPlanCheckoutPage />
      </Suspense>
    </PortalGate>
  );
}
