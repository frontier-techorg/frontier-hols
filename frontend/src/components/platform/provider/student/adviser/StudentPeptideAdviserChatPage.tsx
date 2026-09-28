"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { AdviserChatPageLayout } from "@/components/platform/provider/student/adviser/AdviserChatPageLayout";
import { AdviserChatPanel } from "@/components/platform/provider/student/adviser/AdviserChatPanel";
import { AdviserPageLayout } from "@/components/platform/provider/student/adviser/AdviserPageLayout";
import { ChatMessagesSkeleton } from "@/components/platform/provider/student/DashboardSkeletons";
import { LecturePlansDialog } from "@/components/platform/provider/student/lectures/LecturePlansDialog";
import { ApiRequestError } from "@/lib/integrate/client";
import {
  getCachedPatient,
  getPatient,
  writeStoredActivePatientId,
  type PatientDetail,
} from "@/lib/integrate/provider/student/chat";
import {
  isMembershipRequiredError,
  useStudentMembershipAccess,
} from "@/lib/integrate/provider/student/payment/membershipAccess";

type StudentPeptideAdviserChatPageProps = {
  patientId: string;
};

export function StudentPeptideAdviserChatPage({ patientId }: StudentPeptideAdviserChatPageProps) {
  const router = useRouter();
  const membershipAccess = useStudentMembershipAccess();
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [apiLocked, setApiLocked] = useState(false);

  useEffect(() => {
    writeStoredActivePatientId(patientId);
  }, [patientId]);

  useEffect(() => {
    if (!membershipAccess.ready || membershipAccess.locked) return;

    let cancelled = false;

    async function loadPatient() {
      try {
        const cached = getCachedPatient(patientId, true);
        if (cached && !cancelled) {
          setPatient(cached);
          if (!cached.recommendation) {
            router.replace("/student/adviser");
            return;
          }
        }

        const detail = await getPatient(patientId, { includeMessages: true });
        if (cancelled) return;

        if (!detail.recommendation) {
          router.replace("/student/adviser");
          return;
        }

        setPatient(detail);
      } catch (err) {
        if (cancelled) return;
        if (isMembershipRequiredError(err)) {
          setPatient(null);
          setApiLocked(true);
          return;
        }
        setLoadError(
          err instanceof ApiRequestError ? err.message : "Could not load consultation chat.",
        );
      }
    }

    void loadPatient();

    return () => {
      cancelled = true;
    };
  }, [membershipAccess.locked, membershipAccess.ready, patientId, router]);

  const handlePatientChange = useCallback((updated: PatientDetail) => {
    setPatient((current) =>
      current
        ? {
            ...current,
            ...updated,
            messages: updated.messages ?? current.messages,
            messages_pagination:
              updated.messages_pagination ?? current.messages_pagination,
            turns_used: updated.turns_used ?? current.turns_used,
            turns_max: updated.turns_max ?? current.turns_max,
          }
        : updated,
    );
  }, []);

  if (!membershipAccess.ready) {
    return (
      <AdviserChatPageLayout patientName="">
        <ChatMessagesSkeleton pinnedComposer />
      </AdviserChatPageLayout>
    );
  }

  if (membershipAccess.locked || apiLocked) {
    return (
      <AdviserPageLayout>
        <LecturePlansDialog
          open
          stacked
          title="Membership required"
          description="A plan is required to generate this recommendation and open consultation chat."
          onClose={() => router.push("/student/adviser")}
        />
      </AdviserPageLayout>
    );
  }

  if (loadError) {
    return (
      <AdviserChatPageLayout patientName="">
        <div className="flex min-h-0 flex-1 flex-col justify-center">
          <AuthAlert variant="error">{loadError}</AuthAlert>
        </div>
      </AdviserChatPageLayout>
    );
  }

  if (!patient) {
    return (
      <AdviserChatPageLayout patientName="">
        <ChatMessagesSkeleton pinnedComposer />
      </AdviserChatPageLayout>
    );
  }

  return (
    <AdviserChatPageLayout patientName={patient.display_name}>
      <AdviserChatPanel
        key={patient.patient_id}
        patient={patient}
        onPatientChange={handlePatientChange}
      />
    </AdviserChatPageLayout>
  );
}
