"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { AdviserPageLayout } from "@/components/platform/provider/student/adviser/AdviserPageLayout";
import { CreatePatientDialog } from "@/components/platform/provider/student/adviser/CreatePatientDialog";
import { IntakeOnboardingDialog } from "@/components/platform/provider/student/adviser/IntakeOnboardingDialog";
import { LecturePlansDialog } from "@/components/platform/provider/student/lectures/LecturePlansDialog";
import { INTAKE_STAGES } from "@/components/platform/provider/student/adviser/IntakeWizard";
import {
  PatientListPanel,
  type SortFilter,
  type StatusFilter,
} from "@/components/platform/provider/student/adviser/PatientListPanel";
import { AdviserHubPageSkeleton } from "@/components/platform/provider/student/DashboardSkeletons";
import { ApiRequestError } from "@/lib/integrate/client";
import {
  createPatient,
  getAdviserBootstrap,
  getCachedAdviserBootstrap,
  getPatient,
  listPatients,
  readStoredActivePatientId,
  recommendPatient,
  savePatientIntake,
  sanitizeIntakeAnswers,
  isSnapshotComplete,
  writeStoredActivePatientId,
  type IntakeAnswers,
  type PatientDetail,
  type PatientSummary,
  type QuestionnaireFlow,
} from "@/lib/integrate/provider/student/chat";
import { scrollAppToTopSoon } from "@/lib/scroll-to-top";
import {
  isMembershipRequiredError,
  useStudentMembershipAccess,
} from "@/lib/integrate/provider/student/payment/membershipAccess";

function hasValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== "" && value != null;
}

/** Infer the current intake stage from saved answers. */
export function resolveStep(patient: PatientDetail): number {
  if (patient.recommendation || patient.evaluation) return 7;

  const answers = sanitizeIntakeAnswers(patient.intake_answers || {});
  if (!answers.consent) return 0;
  if (!isSnapshotComplete(answers)) {
    return 1;
  }
  if (
    !["cancer", "mtc_men2", "peptide_allergy", "medications"].every((key) => hasValue(answers[key])) ||
    !hasValue(answers.conditions)
  ) {
    return 2;
  }
  if (!hasValue(answers.primary_goal)) return 3;
  // Branch step is complete once any branch-related progress or history fields exist,
  // or if preferences already started — otherwise stay on deep dive.
  if (
    !["injection_tolerance", "complexity", "timeline"].some((key) => hasValue(answers[key])) &&
    !hasValue(answers.prior_peptides) &&
    !hasValue(answers.labs)
  ) {
    return 4;
  }
  if (!["injection_tolerance", "complexity", "timeline"].every((key) => hasValue(answers[key]))) {
    // If preferences incomplete, they may still be on history (5) or preferences (6)
    if (!hasValue(answers.prior_peptides) && !hasValue(answers.labs) && !hasValue(answers.injection_tolerance)) {
      return 5;
    }
    return 6;
  }
  return 7;
}

function progressLabel(patient: PatientSummary, answersStep?: number, chatLocked = false) {
  if (patient.primary_goal) return String(patient.primary_goal);
  if (patient.has_recommendation) {
    return chatLocked ? "Membership required" : "Recommendation ready";
  }
  if (typeof answersStep === "number") {
    return INTAKE_STAGES[Math.min(answersStep, INTAKE_STAGES.length - 1)];
  }
  return "Intake in progress";
}

function chatRouteForPatient(patientId: string) {
  return `/student/adviser/chat/${patientId}`;
}

const PATIENT_PAGE_SIZE = 10;

export function StudentPeptideAdviserHubPage() {
  const router = useRouter();
  const membershipAccess = useStudentMembershipAccess();
  const [flow, setFlow] = useState<QuestionnaireFlow | null>(null);
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [activePatient, setActivePatient] = useState<PatientDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [isSavingIntake, setIsSavingIntake] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDialogError, setCreateDialogError] = useState<string | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortFilter>("newest");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [appliedListKey, setAppliedListKey] = useState("");
  const listKey = `${page}|${debouncedSearch}|${filter}|${sort}`;
  const listPending = listLoading || appliedListKey !== listKey;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = searchQuery.trim();
      setDebouncedSearch((current) => {
        if (current !== next) setPage(1);
        return next;
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const refreshPatients = useCallback(
    async (overrides?: { page?: number; q?: string; status?: StatusFilter; sort?: SortFilter }) => {
      const nextPage = overrides?.page ?? page;
      const nextQuery = overrides?.q ?? debouncedSearch;
      const nextStatus = overrides?.status ?? filter;
      const nextSort = overrides?.sort ?? sort;
      setListLoading(true);
      try {
        const result = await listPatients({
          page: nextPage,
          limit: PATIENT_PAGE_SIZE,
          q: nextQuery || undefined,
          status: nextStatus,
          sort: nextSort,
        });
        setPatients(result.patients);
        const pagination = result.pagination;
        setTotal(pagination?.total ?? result.total ?? 0);
        setHasNext(Boolean(pagination?.has_next));
        setHasPrevious(Boolean(pagination?.has_previous ?? nextPage > 1));
        setAppliedListKey(`${nextPage}|${nextQuery}|${nextStatus}|${nextSort}`);
        return result.patients;
      } finally {
        setListLoading(false);
      }
    },
    [debouncedSearch, filter, page, sort],
  );

  const routeToChat = useCallback(
    (patientId: string) => {
      writeStoredActivePatientId(patientId);
      router.push(chatRouteForPatient(patientId));
    },
    [router],
  );

  const openOnboarding = useCallback((patient: PatientDetail) => {
    setActivePatient(patient);
    setStep(resolveStep(patient));
    setOnboardingOpen(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!membershipAccess.ready) return;

      try {
        const storedPatientId = readStoredActivePatientId();
        const cached = getCachedAdviserBootstrap(storedPatientId ?? undefined);
        if (cached && !cancelled) {
          setFlow(cached.flow);
          setLoading(false);
          if (cached.active_patient && !cached.active_patient.recommendation) {
            openOnboarding(cached.active_patient);
          }
        }

        const payload = await getAdviserBootstrap(storedPatientId ?? undefined);
        if (cancelled) return;

        setFlow(payload.flow);

        if (payload.active_patient && !payload.active_patient.recommendation) {
          if (payload.active_patient_id) {
            writeStoredActivePatientId(payload.active_patient_id);
          }
          openOnboarding(payload.active_patient);
        }
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof ApiRequestError
            ? err.message
            : "Could not connect to the peptide adviser service.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [membershipAccess.ready, openOnboarding]);

  useEffect(() => {
    if (!membershipAccess.ready) return;
    let cancelled = false;

    async function loadPage() {
      setListLoading(true);
      try {
        const result = await listPatients({
          page,
          limit: PATIENT_PAGE_SIZE,
          q: debouncedSearch || undefined,
          status: filter,
          sort,
        });
        if (cancelled) return;
        setPatients(result.patients);
        const pagination = result.pagination;
        setTotal(pagination?.total ?? result.total ?? 0);
        setHasNext(Boolean(pagination?.has_next));
        setHasPrevious(Boolean(pagination?.has_previous ?? page > 1));
        setAppliedListKey(`${page}|${debouncedSearch}|${filter}|${sort}`);
      } catch (err) {
        if (cancelled) return;
        setActionError(err instanceof ApiRequestError ? err.message : "Could not load patients.");
      } finally {
        if (!cancelled) setListLoading(false);
      }
    }

    void loadPage();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, filter, membershipAccess.ready, page, sort]);

  const selectPatient = useCallback(
    async (patientId: string) => {
      setActionError(null);
      const summary = patients.find((patient) => patient.patient_id === patientId);
      if (summary?.has_recommendation) {
        if (membershipAccess.locked) {
          setPlansOpen(true);
          return;
        }
        routeToChat(patientId);
        return;
      }

      writeStoredActivePatientId(patientId);
      try {
        const patient = await getPatient(patientId);
        openOnboarding(patient);
      } catch (err) {
        if (isMembershipRequiredError(err)) {
          setPlansOpen(true);
          return;
        }
        setActionError(err instanceof ApiRequestError ? err.message : "Could not load patient.");
      }
    },
    [membershipAccess.locked, openOnboarding, patients, routeToChat, router],
  );

  const handleCreatePatient = useCallback(
    async (displayName: string) => {
      setCreateDialogError(null);
      setActionError(null);
      setIsCreating(true);
      try {
        const patient = await createPatient(displayName);
        writeStoredActivePatientId(patient.patient_id);
        setSearchQuery("");
        setDebouncedSearch("");
        setFilter("all");
        setSort("newest");
        setPage(1);
        await refreshPatients({ page: 1, q: "", status: "all", sort: "newest" });
        setCreateDialogOpen(false);
        openOnboarding(patient);
      } catch (err) {
        const message =
          err instanceof ApiRequestError ? err.message : "Could not create patient.";
        setCreateDialogError(message);
        setActionError(message);
      } finally {
        setIsCreating(false);
      }
    },
    [openOnboarding, refreshPatients],
  );

  const openCreateDialog = useCallback(() => {
    setCreateDialogError(null);
    setOnboardingOpen(false);
    setCreateDialogOpen(true);
  }, []);

  const handleIntakeComplete = useCallback(async () => {
    if (!activePatient) return;

    setActionError(null);
    setIsSavingIntake(true);
    try {
      const updated = await savePatientIntake(activePatient.patient_id, {
        answers: sanitizeIntakeAnswers(activePatient.intake_answers || {}),
        display_name: activePatient.display_name,
      });
      setActivePatient(updated);
      await refreshPatients();
      setStep(7);
    } catch (err) {
      setActionError(err instanceof ApiRequestError ? err.message : "Could not save intake.");
    } finally {
      setIsSavingIntake(false);
    }
  }, [activePatient, refreshPatients]);

  const handleGenerateRecommendation = useCallback(async () => {
    if (!activePatient) return;
    if (membershipAccess.locked) {
      setPlansOpen(true);
      return;
    }

    setActionError(null);
    setIsGenerating(true);
    try {
      await recommendPatient(activePatient.patient_id);
      await refreshPatients();
      setOnboardingOpen(false);
      routeToChat(activePatient.patient_id);
    } catch (err) {
      if (isMembershipRequiredError(err)) {
        setPlansOpen(true);
        return;
      }
      setActionError(
        err instanceof ApiRequestError ? err.message : "Could not generate recommendation.",
      );
    } finally {
      setIsGenerating(false);
    }
  }, [activePatient, membershipAccess.locked, refreshPatients, routeToChat]);

  const showRecommendPrompt =
    Boolean(activePatient) &&
    !activePatient?.recommendation &&
    step >= 7 &&
    !isSavingIntake &&
    !isGenerating;

  const closeOnboarding = useCallback(() => {
    if (isSavingIntake || isGenerating) return;
    setOnboardingOpen(false);
  }, [isGenerating, isSavingIntake]);

  return (
    <AdviserPageLayout>
      <CreatePatientDialog
        open={createDialogOpen}
        defaultName={`Patient ${total + 1}`}
        isSubmitting={isCreating}
        error={createDialogError}
        onClose={() => {
          if (!isCreating) setCreateDialogOpen(false);
        }}
        onSubmit={(displayName) => void handleCreatePatient(displayName)}
      />

      <LecturePlansDialog
        open={plansOpen}
        stacked
        title="Membership required"
        description="A plan is required to generate this recommendation and open consultation chat."
        onClose={() => setPlansOpen(false)}
      />

      {flow && activePatient && onboardingOpen ? (
        <IntakeOnboardingDialog
          open={onboardingOpen}
          patientName={activePatient.display_name}
          flow={flow}
          step={step}
          answers={activePatient.intake_answers}
          isSaving={isSavingIntake}
          isGenerating={isGenerating}
          error={actionError}
          showRecommendPrompt={showRecommendPrompt}
          accessLocked={membershipAccess.locked}
          onClose={closeOnboarding}
          onStepChange={setStep}
          onAnswersChange={(answers: IntakeAnswers) =>
            setActivePatient((current) =>
              current ? { ...current, intake_answers: answers } : current,
            )
          }
          onComplete={() => void handleIntakeComplete()}
          onGenerate={() => void handleGenerateRecommendation()}
        />
      ) : null}

      {loadError ? <AuthAlert variant="error">{loadError}</AuthAlert> : null}
      {loading ? (
        <AdviserHubPageSkeleton />
      ) : (
        <>
          {actionError && !onboardingOpen ? <AuthAlert variant="error">{actionError}</AuthAlert> : null}

          <PatientListPanel
            patients={patients}
            activePatientId={activePatient?.patient_id ?? null}
            onSelect={(patientId) => void selectPatient(patientId)}
            onCreate={openCreateDialog}
            isCreating={isCreating}
            chatLocked={membershipAccess.locked}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filter={filter}
            onFilterChange={(value) => {
              setFilter(value);
              setPage(1);
            }}
            sort={sort}
            onSortChange={(value) => {
              setSort(value);
              setPage(1);
            }}
            page={page}
            total={total}
            hasNext={hasNext}
            hasPrevious={hasPrevious}
            listLoading={listPending}
            onPreviousPage={() => {
              scrollAppToTopSoon();
              setPage((current) => Math.max(1, current - 1));
            }}
            onNextPage={() => {
              scrollAppToTopSoon();
              setPage((current) => current + 1);
            }}
            progressLabelFor={(patient) =>
              progressLabel(
                patient,
                activePatient?.patient_id === patient.patient_id ? step : undefined,
                membershipAccess.locked,
              )
            }
            headerExtra={
              activePatient && !activePatient.recommendation ? (
                <button
                  type="button"
                  onClick={() => setOnboardingOpen(true)}
                  className="adviser-resume-row flex min-h-11 w-full min-w-0 items-center gap-3 rounded-2xl border px-3.5 py-3 text-left sm:px-4"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--dash-navy)] text-white">
                    <SidebarSvgIcon name="next" size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-sans block text-sm font-semibold text-[color:var(--dash-text)]">
                      Resume intake
                    </span>
                    <span className="text-brand-caption mt-0.5 block truncate text-[color:var(--dash-muted)]">
                      {activePatient.display_name} · pick up where you left off
                    </span>
                  </span>
                  <SidebarSvgIcon
                    name="next"
                    size={16}
                    className="shrink-0 text-[color:var(--dash-dim)]"
                  />
                </button>
              ) : null
            }
          />
        </>
      )}
    </AdviserPageLayout>
  );
}
