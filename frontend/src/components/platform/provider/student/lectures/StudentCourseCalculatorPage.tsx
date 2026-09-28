"use client";

import { useEffect, useState } from "react";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { StudentPeptideCalculatorPage } from "@/components/platform/provider/student/calculator/StudentPeptideCalculatorPage";
import { CoursePageLayout } from "@/components/platform/provider/student/lectures/CoursePageLayout";
import { LectureMembershipLockedScreen } from "@/components/platform/provider/student/lectures/LectureMembershipLock";
import { ApiRequestError } from "@/lib/integrate/client";
import { getCourse, type CourseSummary } from "@/lib/integrate/provider/student/lectures";
import {
  isMembershipRequiredError,
  useStudentMembershipAccess,
} from "@/lib/integrate/provider/student/payment/membershipAccess";

type StudentCourseCalculatorPageProps = {
  courseId: string;
};

export function StudentCourseCalculatorPage({ courseId }: StudentCourseCalculatorPageProps) {
  const membershipAccess = useStudentMembershipAccess();
  const [course, setCourse] = useState<CourseSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiLocked, setApiLocked] = useState(false);

  useEffect(() => {
    if (!membershipAccess.ready || membershipAccess.locked) return;

    async function loadCourse() {
      setLoading(true);
      setError(null);
      try {
        const data = await getCourse(courseId);
        setCourse(data.course);
      } catch (err) {
        if (isMembershipRequiredError(err)) {
          setApiLocked(true);
          return;
        }
        setError(err instanceof ApiRequestError ? err.message : "Failed to load course.");
      } finally {
        setLoading(false);
      }
    }
    void loadCourse();
  }, [courseId, membershipAccess.locked, membershipAccess.ready]);

  if (!membershipAccess.ready) {
    return (
      <CoursePageLayout
        title="Calculator"
        description=""
        courseId={courseId}
        courseNavActive="calculator"
        backHref={`/student/lectures/${courseId}`}
        backLabel="Back to cover"
        hideHero
      >
        {null}
      </CoursePageLayout>
    );
  }

  if (membershipAccess.locked || apiLocked) {
    return <LectureMembershipLockedScreen />;
  }

  return (
    <CoursePageLayout
      title={course ? `Calculator · ${course.title}` : "Calculator"}
      description="Reconstitution and dosing helper while you study this course."
      courseId={courseId}
      courseNavActive="calculator"
      backHref={`/student/lectures/${courseId}`}
      backLabel="Back to cover"
      hideHero
    >
      {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}
      {!loading || course ? (
        <StudentPeptideCalculatorPage embedded key={`course-calculator-${courseId}`} />
      ) : null}
    </CoursePageLayout>
  );
}
