"use client";

import { useRouter } from "next/navigation";
import { LecturePlansDialog } from "@/components/platform/provider/student/lectures/LecturePlansDialog";
import { LecturesPageLayout } from "@/components/platform/provider/student/lectures/LecturesPageLayout";

export function LectureMembershipLockedScreen() {
  const router = useRouter();

  return (
    <LecturesPageLayout>
      <LecturePlansDialog open onClose={() => router.push("/student/lectures")} />
    </LecturesPageLayout>
  );
}
