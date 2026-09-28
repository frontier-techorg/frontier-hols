"use client";

import { type ReactNode } from "react";
import {
  DirectoryMobileRow,
  DirectorySearchBar,
  PaginationControls,
} from "@/components/platform/provider/admin/shared";
import { AdviserPatientRowsSkeleton } from "@/components/platform/provider/student/DashboardSkeletons";
import { ProfileSelect } from "@/components/platform/provider/student/profile/ProfileSelect";
import type { PatientSummary } from "@/lib/integrate/provider/student/chat";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { cn } from "@/lib/utils";

const ACTION_LINK_CLASS =
  "font-sans text-sm font-semibold text-[#142644] underline decoration-[rgba(20,38,68,0.45)] decoration-1 underline-offset-[3px] transition-colors hover:text-[#6f7a1c] hover:decoration-[#6f7a1c] focus-visible:text-[#6f7a1c] focus-visible:decoration-[#6f7a1c] focus-visible:outline-none bg-transparent border-0 p-0 cursor-pointer";

export type StatusFilter = "all" | "progress" | "chat";
export type SortFilter = "newest" | "oldest";

type PatientListPanelProps = {
  patients: PatientSummary[];
  activePatientId: string | null;
  onSelect: (patientId: string) => void;
  onCreate: () => void;
  isCreating?: boolean;
  progressLabelFor?: (patient: PatientSummary) => string;
  headerExtra?: ReactNode;
  chatLocked?: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  filter: StatusFilter;
  onFilterChange: (value: StatusFilter) => void;
  sort: SortFilter;
  onSortChange: (value: SortFilter) => void;
  page: number;
  total: number;
  hasNext: boolean;
  hasPrevious: boolean;
  listLoading?: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
};

function isChatCase(patient: PatientSummary) {
  return patient.has_recommendation;
}

function formatUpdated(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusLabel(patient: PatientSummary) {
  return isChatCase(patient) ? "Chat" : "In progress";
}

export function PatientListPanel({
  patients,
  activePatientId,
  onSelect,
  onCreate,
  isCreating = false,
  progressLabelFor,
  headerExtra,
  chatLocked = false,
  searchQuery,
  onSearchChange,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  page,
  total,
  hasNext,
  hasPrevious,
  listLoading = false,
  onPreviousPage,
  onNextPage,
}: PatientListPanelProps) {
  const needle = (searchQuery ?? "").trim();
  const visiblePatients = patients;

  const detailFor = (patient: PatientSummary) =>
    progressLabelFor?.(patient) ??
    (isChatCase(patient)
      ? `${patient.message_count} messages`
      : patient.primary_goal || "Intake in progress");

  const emptyCopy = needle
    ? "No matching patients"
    : filter === "progress"
      ? "No cases in progress."
      : filter === "chat"
        ? "No chat cases yet."
        : "No patients yet";

  return (
    <div className="@container grid min-w-0 gap-3 sm:gap-4">
      <div className="flex w-full min-w-0 flex-col gap-2 @min-[54rem]:flex-row @min-[54rem]:items-center @min-[54rem]:gap-3">
        <DirectorySearchBar
          value={searchQuery}
          onChange={onSearchChange}
          placeholder="Search patients…"
          label="Search patients"
          className="mt-0 w-full min-w-0 @min-[54rem]:max-w-[22rem] @min-[54rem]:shrink-0"
        />
        <div className="grid min-w-0 grid-cols-2 gap-2 @min-[54rem]:ml-auto @min-[54rem]:flex @min-[54rem]:w-auto @min-[54rem]:items-center">
          <ProfileSelect
            id="adviser-patient-status-filter"
            label="Filter patients"
            hideLabel
            className="w-full @min-[54rem]:w-[9.75rem]"
            portalToBody
            menuZIndex={120}
            value={filter}
            onChange={(value) =>
              onFilterChange(value === "progress" || value === "chat" ? value : "all")
            }
            options={[
              { value: "all", label: "All" },
              { value: "progress", label: "In progress" },
              { value: "chat", label: "Chat" },
            ]}
          />
          <ProfileSelect
            id="adviser-patient-sort-filter"
            label="Sort patients"
            hideLabel
            className="w-full @min-[54rem]:w-[9.75rem]"
            portalToBody
            menuZIndex={120}
            value={sort}
            onChange={(value) => onSortChange(value === "oldest" ? "oldest" : "newest")}
            options={[
              { value: "newest", label: "Newest" },
              { value: "oldest", label: "Oldest" },
            ]}
          />
        </div>
        <button
          type="button"
          onClick={onCreate}
          disabled={isCreating}
          className="dashboard-navy-btn lecture-page-action font-sans inline-flex h-10 min-h-10 w-full shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium tracking-[0.01em] text-white disabled:pointer-events-none disabled:opacity-60 @min-[54rem]:w-auto"
        >
          <SidebarSvgIcon name="plus" size={15} strokeWidth={2.2} />
          {isCreating ? "Creating…" : "New patient"}
        </button>
      </div>

      {headerExtra}

      <section className="dashboard-glass-card min-w-0 overflow-hidden rounded-2xl">
        {listLoading && patients.length === 0 ? (
          <AdviserPatientRowsSkeleton />
        ) : total === 0 && !needle && filter === "all" ? (
          <div className="flex flex-col items-center px-5 py-12 text-center sm:py-14">
            <p className="font-sans text-base font-semibold text-[color:var(--dash-text)] sm:text-lg">
              No patients yet
            </p>
            <p className="text-brand-body mt-1.5 max-w-sm text-[color:var(--dash-muted)]">
              Create a case with a name. Intake takes a couple of minutes, then generate a
              recommendation to open the consultation chat.
            </p>
          </div>
        ) : visiblePatients.length === 0 && !listLoading ? (
          <div className="px-4 py-10 text-center">
            <p className="font-sans text-sm font-semibold text-[color:var(--dash-text)]">{emptyCopy}</p>
            <p className="text-brand-caption mt-1 text-[color:var(--dash-faint)]">
              {needle
                ? "Try another search or switch the filter."
                : "Switch the filter, or create a new patient."}
            </p>
          </div>
        ) : (
          <>
          <ul className="grid gap-2.5 px-3.5 pb-4 sm:gap-3 sm:px-5 md:hidden">
            {visiblePatients.map((patient) => {
              const active = activePatientId === patient.patient_id;
              const chat = isChatCase(patient);
              const rowLocked = chatLocked && chat;
              const actionLabel = rowLocked ? "Unlock" : chat ? "Open" : "Continue";
              return (
                <li key={patient.patient_id} className="min-w-0">
                  <DirectoryMobileRow
                    title={patient.display_name}
                    subtitle={rowLocked ? "Membership required" : detailFor(patient)}
                    wrapSubtitle
                    active={active}
                    ariaLabel={`${patient.display_name}, ${statusLabel(patient)}. ${
                      rowLocked
                        ? "Membership required to open chat"
                        : chat
                          ? "Open chat"
                          : "Continue intake"
                    }`}
                    onClick={() => onSelect(patient.patient_id)}
                    stats={[
                      { label: "Status", value: statusLabel(patient) },
                      { label: "Messages", value: patient.message_count },
                      { label: "Updated", value: formatUpdated(patient.updated_at) },
                      {
                        label: "Action",
                        value: <span className={ACTION_LINK_CLASS}>{actionLabel}</span>,
                      },
                    ]}
                  />
                </li>
              );
            })}
          </ul>
          <div className="hidden min-w-0 overflow-hidden md:block">
            <table className="w-full table-fixed border-separate border-spacing-0 text-left">
              <thead>
                <tr className="bg-[color:var(--dash-soft)] text-brand-caption font-semibold uppercase tracking-[0.06em] text-[color:var(--dash-faint)]">
                  <th scope="col" className="w-[22%] px-4 py-3 font-semibold sm:px-5">
                    Patient
                  </th>
                  <th scope="col" className="w-[14%] px-3 py-3 font-semibold">
                    Status
                  </th>
                  <th scope="col" className="w-[24%] px-3 py-3 font-semibold">
                    Details
                  </th>
                  <th scope="col" className="w-[12%] px-3 py-3 font-semibold">
                    Messages
                  </th>
                  <th scope="col" className="w-[16%] px-3 py-3 font-semibold">
                    Updated
                  </th>
                  <th scope="col" className="w-[12%] px-4 py-3 font-semibold sm:px-5">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {visiblePatients.map((patient) => {
                  const active = activePatientId === patient.patient_id;
                  const chat = isChatCase(patient);
                  const rowLocked = chatLocked && chat;
                  const actionLabel = rowLocked ? "Unlock" : chat ? "Open" : "Continue";
                  return (
                    <tr
                      key={patient.patient_id}
                      tabIndex={0}
                      role="button"
                      aria-label={`${patient.display_name}, ${statusLabel(patient)}. ${
                        rowLocked
                          ? "Membership required to open chat"
                          : chat
                            ? "Open chat"
                            : "Continue intake"
                      }`}
                      className={cn(
                        "adviser-table-row cursor-pointer outline-none transition focus-visible:bg-[color:var(--dash-soft)]",
                        active ? "bg-[color:var(--dash-soft)]" : "hover:bg-[color:var(--dash-soft)]",
                      )}
                      onClick={() => {
                        onSelect(patient.patient_id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelect(patient.patient_id);
                        }
                      }}
                    >
                      <td className="border-t border-[color:var(--dash-surface-border)] px-4 py-3 sm:px-5">
                        <span className="font-sans block truncate text-sm font-semibold text-[color:var(--dash-text)]">
                          {patient.display_name}
                        </span>
                      </td>
                      <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                        <span className="text-brand-caption inline-flex max-w-full truncate rounded-full bg-[color:var(--dash-soft)] px-2.5 py-1 font-semibold text-[color:var(--dash-text)]">
                          {statusLabel(patient)}
                        </span>
                      </td>
                      <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                        <span className="text-brand-caption block truncate text-[color:var(--dash-muted)]">
                          {detailFor(patient)}
                        </span>
                      </td>
                      <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                        <span className="font-sans block text-sm tabular-nums text-[color:var(--dash-text)]">
                          {patient.message_count}
                        </span>
                      </td>
                      <td className="border-t border-[color:var(--dash-surface-border)] px-3 py-3">
                        <span className="text-brand-caption block truncate text-[color:var(--dash-muted)]">
                          {formatUpdated(patient.updated_at)}
                        </span>
                      </td>
                      <td className="border-t border-[color:var(--dash-surface-border)] px-4 py-3 sm:px-5">
                        <button
                          type="button"
                          className={cn(ACTION_LINK_CLASS, rowLocked && "inline-flex items-center gap-1")}
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelect(patient.patient_id);
                          }}
                        >
                          {rowLocked ? <SidebarSvgIcon name="lock" size={14} /> : null}
                          {actionLabel}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
        {total > 0 && (hasNext || hasPrevious) ? (
          <div className="px-3.5 pb-4 sm:px-5">
            <PaginationControls
              appearance="lecture"
              page={page}
              total={total}
              hasNext={hasNext}
              hasPrevious={hasPrevious}
              loading={listLoading}
              onPrevious={onPreviousPage}
              onNext={onNextPage}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}
