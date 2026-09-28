"use client";

import { PlansPageLayout } from "@/components/platform/provider/student/payment/PlansPageLayout";
import { StudentPlansPage } from "@/components/platform/provider/student/payment/StudentPlansPage";

export function StudentPlansScreen() {
  return (
    <PlansPageLayout title="Plans">
      <StudentPlansPage />
    </PlansPageLayout>
  );
}
