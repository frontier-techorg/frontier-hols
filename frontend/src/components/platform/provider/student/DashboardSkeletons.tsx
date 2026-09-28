"use client";

import { cn } from "@/lib/utils";

export function SkeletonBlock({ className }: { className?: string }) {
  return <span className={cn("dashboard-skeleton-block", className)} aria-hidden />;
}

export function MembershipPageSkeleton() {
  return (
    <div className="grid w-full min-w-0 gap-3 sm:gap-4" aria-busy="true" aria-label="Loading membership">
      <div className="min-w-0">
        <SkeletonBlock className="h-3 w-24 rounded-lg" />
        <SkeletonBlock className="mt-2 h-5 w-40 rounded-lg" />
        <div className="mt-4 grid w-full gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <section
              key={index}
              className="membership-plan-card flex min-h-[18rem] flex-col rounded-xl p-4 sm:p-5"
            >
              <SkeletonBlock className="h-6 w-20 rounded-lg" />
              <SkeletonBlock className="mt-4 h-11 w-11 rounded-lg" />
              <SkeletonBlock className="mt-4 h-6 w-28 rounded-lg" />
              <SkeletonBlock className="mt-2 h-8 w-24 rounded-lg" />
              <div className="mt-5 space-y-2.5">
                <SkeletonBlock className="h-3 w-full rounded-lg" />
                <SkeletonBlock className="h-3 w-[90%] rounded-lg" />
                <SkeletonBlock className="h-3 w-[80%] rounded-lg" />
                <SkeletonBlock className="h-3 w-[70%] rounded-lg" />
              </div>
              <SkeletonBlock className="mt-auto h-11 w-full rounded-lg" />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MembershipHubSkeleton() {
  return (
    <div className="grid w-full min-w-0 gap-3 sm:gap-4" aria-busy="true" aria-label="Loading membership">
      <section className="dashboard-glass-card flex min-w-0 items-start gap-3 rounded-2xl px-4 py-4 sm:gap-4 sm:px-5 sm:py-5">
        <SkeletonBlock className="h-11 w-11 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonBlock className="h-5 w-40 max-w-full rounded-full" />
          <SkeletonBlock className="h-4 w-full max-w-md rounded-full" />
          <SkeletonBlock className="h-4 w-[82%] max-w-sm rounded-full" />
        </div>
      </section>
      <div className="@container min-w-0">
        <div className="grid grid-cols-1 gap-3 @min-[36rem]:grid-cols-2 @min-[36rem]:gap-4 @min-[56rem]:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <section
              key={index}
              className="dashboard-glass-card membership-plan-card flex min-h-[18rem] min-w-0 flex-col rounded-2xl p-4 sm:p-5"
            >
              <SkeletonBlock className="h-6 w-24 max-w-full rounded-lg" />
              <SkeletonBlock className="mt-3 h-6 w-28 max-w-full rounded-full" />
              <SkeletonBlock className="mt-3 h-8 w-32 max-w-full rounded-full" />
              <div className="mt-5 space-y-2.5">
                <SkeletonBlock className="h-3.5 w-[88%] max-w-full rounded-full" />
                <SkeletonBlock className="h-3.5 w-[72%] max-w-full rounded-full" />
                <SkeletonBlock className="h-3.5 w-[80%] max-w-full rounded-full" />
              </div>
              <SkeletonBlock className="mt-auto h-10 w-full rounded-full" />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export function OrdersListSkeleton() {
  const columns = ["w-20", "w-16", "w-14", "w-16", "w-16", "w-20", "w-14"];

  return (
    <div aria-busy="true" aria-label="Loading orders">
      <ul className="grid gap-2.5 px-3.5 py-4 sm:gap-3 sm:px-5 md:hidden">
        {Array.from({ length: 4 }, (_, index) => (
          <li key={index} className="min-w-0 overflow-hidden rounded-2xl bg-[color:var(--dash-soft)]/80 px-4 py-4">
            <SkeletonBlock className="h-4 w-28 max-w-full rounded-full" />
            <SkeletonBlock className="mt-2 h-3.5 w-40 max-w-full rounded-full" />
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3">
              <SkeletonBlock className="h-8 w-full rounded-lg" />
              <SkeletonBlock className="h-8 w-full rounded-lg" />
              <SkeletonBlock className="col-span-2 h-8 w-full max-w-[10rem] rounded-lg" />
            </div>
            <div className="mt-3 flex justify-end border-t border-[color:var(--dash-surface-border)] pt-3">
              <SkeletonBlock className="h-4 w-16 rounded-full" />
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden min-w-0 overflow-x-auto md:block">
        <table className="w-full min-w-[52rem] border-separate border-spacing-0 text-left">
          <thead>
            <tr className="bg-[color:var(--dash-soft)]">
              {columns.map((width, index) => (
                <th key={index} className="px-4 py-3 sm:px-5">
                  <SkeletonBlock className={cn("h-3 rounded-full", width)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }, (_, index) => (
              <tr key={index}>
                {columns.map((width, cell) => (
                  <td
                    key={cell}
                    className="border-t border-[color:var(--dash-surface-border)] px-4 py-3 sm:px-5"
                  >
                    <SkeletonBlock className={cn("h-4 rounded-full", width)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function OrderListRowsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2.5" aria-busy="true" aria-label="Loading orders">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="flex items-center justify-between gap-3 rounded-xl px-2.5 py-2.5 sm:px-3.5 sm:py-3"
        >
          <div className="flex min-w-0 items-center gap-3">
            <SkeletonBlock className="h-9 w-9 shrink-0 rounded-lg" />
            <div className="min-w-0 space-y-2">
              <SkeletonBlock className="h-3.5 w-28 rounded-lg" />
              <SkeletonBlock className="h-3 w-20 rounded-lg" />
            </div>
          </div>
          <SkeletonBlock className="h-4 w-14 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export function OrdersPageSkeleton() {
  return (
    <div className="grid w-full min-w-0 gap-3 sm:gap-4" aria-busy="true" aria-label="Loading orders">
      <div className="grid w-full min-w-0 items-start gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className="hols-auth-card order-2 min-w-0 rounded-xl p-4 sm:p-5 lg:order-1">
          <div className="flex items-center justify-between gap-2">
            <SkeletonBlock className="h-5 w-32 rounded-lg" />
            <SkeletonBlock className="h-4 w-14 rounded-lg" />
          </div>
          <div className="mt-4">
            <OrderListRowsSkeleton />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <SkeletonBlock className="h-9 w-full rounded-lg" />
            <SkeletonBlock className="h-9 w-full rounded-lg" />
          </div>
        </section>

        <section className="hols-auth-card order-1 min-w-0 rounded-xl p-4 sm:p-5 lg:order-2">
          <SkeletonBlock className="h-3 w-20 rounded-lg" />
          <SkeletonBlock className="mt-3 h-8 w-16 rounded-lg" />
          <SkeletonBlock className="mt-2 h-4 w-40 rounded-lg" />
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="rounded-lg bg-[color:var(--dash-soft)] px-3 py-3 sm:px-3.5">
                <SkeletonBlock className="h-3 w-16 rounded-lg" />
                <SkeletonBlock className="mt-2 h-4 w-12 rounded-lg" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export function ProfilePageSkeleton() {
  return (
    <div
      className="grid w-full min-w-0 items-start gap-3 sm:gap-4 lg:grid-cols-[minmax(15.5rem,18.75rem)_minmax(0,1fr)]"
      aria-busy="true"
      aria-label="Loading settings"
    >
      <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
        <section className="dashboard-glass-card flex flex-col items-center rounded-2xl px-4 py-5 sm:p-5">
          <SkeletonBlock className="h-20 w-20 rounded-full sm:h-24 sm:w-24" />
          <SkeletonBlock className="mt-3 h-3 w-20 rounded-full" />
          <SkeletonBlock className="mt-3 h-5 w-36 rounded-full" />
          <SkeletonBlock className="mt-2 h-3 w-40 rounded-full" />
          <SkeletonBlock className="mt-3 h-6 w-16 rounded-full" />
        </section>
        <section className="dashboard-glass-card hidden rounded-2xl p-2.5 lg:block">
          <div className="space-y-1">
            {Array.from({ length: 1 }, (_, index) => (
              <div key={index} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                <SkeletonBlock className="h-5 w-5 shrink-0 rounded-full" />
                <SkeletonBlock className="h-3.5 w-32 rounded-full" />
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="dashboard-glass-card min-w-0 rounded-2xl p-4 sm:p-5 md:p-6">
        <SkeletonBlock className="h-5 w-40 rounded-full" />
        <SkeletonBlock className="mt-2 h-4 w-64 rounded-full" />
        <div className="mt-6 grid gap-4">
          <div className="space-y-2">
            <SkeletonBlock className="h-3 w-24 rounded-full" />
            <SkeletonBlock className="h-11 w-full rounded-2xl" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <SkeletonBlock className="h-3 w-20 rounded-full" />
              <SkeletonBlock className="h-11 w-full rounded-2xl" />
            </div>
            <div className="space-y-2">
              <SkeletonBlock className="h-3 w-20 rounded-full" />
              <SkeletonBlock className="h-11 w-full rounded-2xl" />
            </div>
          </div>
          <div className="space-y-2">
            <SkeletonBlock className="h-3 w-28 rounded-full" />
            <SkeletonBlock className="h-11 w-full rounded-2xl" />
          </div>
          <div className="space-y-2">
            <SkeletonBlock className="h-3 w-28 rounded-full" />
            <SkeletonBlock className="h-11 w-full rounded-2xl" />
          </div>
        </div>
      </section>
    </div>
  );
}

export function AdviserPatientRowsSkeleton({ count = 5 }: { count?: number }) {
  const columns = ["w-[22%]", "w-[14%]", "w-[24%]", "w-[12%]", "w-[16%]", "w-[12%]"];

  return (
    <div aria-busy="true" aria-label="Loading patients">
      <ul className="grid gap-2.5 px-3.5 py-4 sm:gap-3 sm:px-5 md:hidden">
        {Array.from({ length: Math.min(count, 4) }, (_, index) => (
          <li
            key={index}
            className="min-w-0 overflow-hidden rounded-2xl bg-[color:var(--dash-soft)]/80 px-4 py-4"
          >
            <SkeletonBlock className="block h-4 w-[62%] max-w-full rounded-md" />
            <SkeletonBlock className="mt-2 block h-3 w-[48%] max-w-full rounded-md" />
            <div className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-2.5">
              {Array.from({ length: 4 }, (_, field) => (
                <div key={field} className="min-w-0 space-y-1.5">
                  <SkeletonBlock className="block h-2.5 w-14 max-w-full rounded-md" />
                  <SkeletonBlock className="block h-3.5 w-20 max-w-full rounded-md" />
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden min-w-0 md:block">
        <table className="w-full table-fixed border-separate border-spacing-0 text-left">
          <thead>
            <tr className="bg-[color:var(--dash-soft)]">
              {columns.map((width, index) => (
                <th key={index} className={cn("px-3 py-3 first:pl-5 last:pr-5", width)}>
                  <SkeletonBlock className="block h-3 w-16 max-w-full rounded-full" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: count }, (_, index) => (
              <tr key={index}>
                {columns.map((_, cell) => (
                  <td
                    key={cell}
                    className="border-t border-[color:var(--dash-surface-border)] px-3 py-3 first:pl-5 last:pr-5"
                  >
                    <SkeletonBlock className="block h-4 w-[70%] max-w-full rounded-full" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdviserHubPageSkeleton() {
  return (
    <div className="@container grid w-full min-w-0 gap-3 sm:gap-4" aria-busy="true" aria-label="Loading adviser">
      <div className="flex w-full min-w-0 flex-col gap-2 @min-[54rem]:flex-row @min-[54rem]:items-center @min-[54rem]:gap-3">
        <SkeletonBlock className="h-10 w-full rounded-xl @min-[54rem]:max-w-[22rem] @min-[54rem]:shrink-0" />
        <div className="grid w-full min-w-0 grid-cols-2 gap-2 @min-[54rem]:ml-auto @min-[54rem]:flex @min-[54rem]:w-auto">
          <SkeletonBlock className="h-10 w-full rounded-xl @min-[54rem]:w-[9.75rem]" />
          <SkeletonBlock className="h-10 w-full rounded-xl @min-[54rem]:w-[9.75rem]" />
        </div>
        <SkeletonBlock className="h-10 w-full rounded-full @min-[54rem]:w-36 @min-[54rem]:shrink-0" />
      </div>
      <section className="dashboard-glass-card min-w-0 overflow-hidden rounded-2xl">
        <AdviserPatientRowsSkeleton />
      </section>
    </div>
  );
}

export function WebinarsPageSkeleton({ hideToolbar = false }: { hideToolbar?: boolean }) {
  return (
    <div className="grid w-full min-w-0 gap-3 sm:gap-4" aria-busy="true" aria-label="Loading webinars">
      {hideToolbar ? null : (
        <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <SkeletonBlock className="h-10 w-full rounded-xl sm:max-w-[22rem] sm:shrink-0" />
          <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-auto sm:items-center">
            <SkeletonBlock className="h-10 w-full rounded-xl sm:w-[9.75rem]" />
            <SkeletonBlock className="h-10 w-full rounded-xl sm:w-[9.75rem]" />
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <article
            key={index}
            className="dashboard-glass-card flex min-w-0 flex-col overflow-hidden rounded-2xl"
          >
            <SkeletonBlock className="block aspect-[16/9] w-full rounded-none" />
            <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
              <div className="min-w-0 space-y-2">
                <SkeletonBlock className="block h-5 w-[78%] max-w-full rounded-full" />
                <SkeletonBlock className="block h-4 w-[64%] max-w-full rounded-full" />
                <SkeletonBlock className="block h-3 w-[46%] max-w-full rounded-full" />
              </div>
              <div className="mt-auto flex min-w-0 gap-2">
                <SkeletonBlock className="h-10 min-w-0 flex-1 rounded-full" />
                <SkeletonBlock className="h-10 min-w-0 flex-1 rounded-full" />
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function ChatAssistantSkeleton({ card = false }: { card?: boolean }) {
  return (
    <div className="grid w-full min-w-0 grid-cols-[37px_minmax(0,1fr)] items-start gap-x-4">
      <SkeletonBlock className="col-start-1 row-start-1 block h-[37px] w-[37px] rounded-full" />
      <SkeletonBlock className="col-start-2 row-start-1 mt-0.5 block h-3 w-24 max-w-full rounded-md" />
      {card ? (
        <div className="@container col-start-2 row-start-2 -mt-2 min-w-0 rounded-[1.5rem] rounded-tl-[10px] bg-white px-3.5 py-4 sm:px-[1.375rem] sm:py-5">
          <SkeletonBlock className="block h-5 w-[min(100%,16rem)] rounded-md" />
          <SkeletonBlock className="mt-3 block h-3 w-full rounded-full" />
          <SkeletonBlock className="mt-2 block h-3 w-[78%] max-w-full rounded-full" />
          <SkeletonBlock className="mt-3 block h-6 w-28 rounded-full" />
          <div className="mt-3 grid gap-2.5 @min-[32rem]:grid-cols-[5.25rem_minmax(0,1fr)]">
            <SkeletonBlock className="block h-24 w-full rounded-2xl @min-[32rem]:h-36" />
            <div className="min-w-0 space-y-2">
              <SkeletonBlock className="block h-4 w-20 rounded-full" />
              <SkeletonBlock className="block h-4 w-[70%] max-w-full rounded-md" />
              <SkeletonBlock className="block h-3 w-full rounded-full" />
              <SkeletonBlock className="block h-3 w-[64%] max-w-full rounded-full" />
            </div>
          </div>
          <div className="mt-2.5 grid gap-2.5 @min-[32rem]:grid-cols-2">
            <SkeletonBlock className="block h-24 w-full rounded-2xl" />
            <SkeletonBlock className="block h-24 w-full rounded-2xl" />
          </div>
        </div>
      ) : (
        <div className="col-start-2 row-start-2 -mt-2 min-w-0 max-w-xl space-y-2 rounded-[1.5rem] rounded-tl-[10px] bg-white px-3.5 py-4 sm:px-[1.375rem]">
          <SkeletonBlock className="block h-3 w-full rounded-full" />
          <SkeletonBlock className="block h-3 w-[92%] max-w-full rounded-full" />
          <SkeletonBlock className="block h-3 w-[68%] max-w-full rounded-full" />
        </div>
      )}
    </div>
  );
}

function ChatUserSkeleton({ width }: { width: string }) {
  return (
    <div className="flex min-w-0 justify-end pl-[8%] sm:pl-[12%]">
      <div className={cn("flex min-w-0 flex-col items-end gap-1", width)}>
        <SkeletonBlock className="block h-3 w-8 rounded-md" />
        <SkeletonBlock className="block h-14 w-full rounded-[1.5rem] rounded-tr-[10px]" />
      </div>
    </div>
  );
}

export function ChatMessagesSkeleton({ pinnedComposer = false }: { pinnedComposer?: boolean }) {
  const thread = (
    <div
      className={cn(
        "mx-auto flex w-full min-w-0 max-w-[54rem] flex-col gap-4",
        pinnedComposer && "pb-8 pt-[37px]",
      )}
    >
      <ChatAssistantSkeleton card />
      <ChatUserSkeleton width="w-[min(78%,18rem)]" />
      <ChatAssistantSkeleton />
      <ChatUserSkeleton width="w-[min(62%,12rem)]" />
    </div>
  );

  if (!pinnedComposer) {
    return (
      <div className="w-full min-w-0" aria-busy="true" aria-label="Loading conversation">
        {thread}
      </div>
    );
  }

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      aria-busy="true"
      aria-label="Loading conversation"
    >
      <div className="min-h-0 flex-1 overflow-hidden px-4 sm:px-6 md:px-11">{thread}</div>
      <div className="shrink-0 px-4 pb-[max(31px,env(safe-area-inset-bottom))] pt-2 sm:px-6 md:px-11">
        <div className="mx-auto flex h-[67px] w-full max-w-[54rem] items-center gap-2 rounded-full bg-white px-7">
          <SkeletonBlock className="block h-4 min-w-0 flex-1 rounded-full" />
          <SkeletonBlock className="block h-[51px] w-[51px] shrink-0 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function CalculatorPageSkeleton() {
  return (
    <div
      className="grid w-full min-w-0 max-w-full gap-3 overflow-hidden sm:gap-4"
      aria-busy="true"
      aria-label="Loading calculator"
    >
      <div className="mx-auto w-full min-w-0 px-0.5 sm:px-2 md:max-w-2xl md:px-1">
        <div className="flex items-start justify-between">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex min-w-0 flex-1 flex-col items-center">
              <SkeletonBlock className="h-7 w-7 shrink-0 rounded-full sm:h-8 sm:w-8" />
              <SkeletonBlock className="mt-2 h-3 w-[72%] max-w-[4rem] rounded-full sm:mt-2.5" />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 grid min-w-0 items-start gap-3 max-[390px]:mt-2.5 max-[390px]:gap-2.5 sm:mt-4 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] md:gap-4 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
        <section className="dashboard-glass-card flex min-w-0 flex-col gap-3 rounded-2xl p-3 sm:p-4">
          <SkeletonBlock className="h-5 w-28 max-w-full rounded-full" />
          <SkeletonBlock className="h-12 w-full rounded-[0.875rem]" />
          <div className="flex w-full sm:justify-end">
            <SkeletonBlock className="h-10 w-full rounded-full sm:w-28" />
          </div>
        </section>

        <section className="dashboard-glass-card flex min-w-0 flex-col items-center overflow-hidden rounded-2xl px-3 py-4 max-[390px]:px-2.5 max-[390px]:py-3 sm:px-5 sm:py-5 md:px-6 md:py-6">
          <SkeletonBlock className="h-8 w-full max-w-[16rem] rounded-full sm:h-10 sm:max-w-[20rem]" />
          <div className="mt-4 flex w-full min-w-0 items-end justify-center gap-3 max-[390px]:gap-2.5 sm:mt-5 sm:gap-6 md:gap-12">
            <SkeletonBlock className="h-32 w-[5.5rem] max-w-[42%] rounded-[1.25rem] max-[390px]:h-28 sm:h-40 sm:w-[6.75rem] md:h-52 md:w-[9.4rem]" />
            <SkeletonBlock className="h-28 w-[4.25rem] max-w-[34%] rounded-[1.25rem] max-[390px]:h-24 sm:h-36 sm:w-[5.25rem] md:h-48 md:w-[7.25rem]" />
          </div>
        </section>
      </div>
    </div>
  );
}

export const lectureOverviewGridClass =
  "lecture-overview-stage grid w-full min-w-0 max-w-full items-start gap-3 sm:gap-4 md:gap-5 @min-[52rem]:grid-cols-[minmax(0,0.92fr)_minmax(0,1.18fr)] @min-[56rem]:grid-cols-[minmax(0,0.88fr)_minmax(0,1.22fr)]";

export function CoursePageSkeleton() {
  return (
    <div className="@container min-w-0 w-full" aria-busy="true" aria-label="Loading course">
      <div className={lectureOverviewGridClass}>
        <div className="hols-volume-panel min-w-0 w-full max-w-full">
          <div className="hols-volume lecture-overview-book-skeleton">
            <SkeletonBlock className="rounded-[1.15rem]" />
          </div>
        </div>

        <section className="dashboard-glass-card course-book-toc relative min-w-0 w-full overflow-hidden rounded-2xl p-4 sm:p-5 md:p-6">
          <div className="flex min-w-0 flex-col gap-3 border-b border-[color:var(--dash-surface-border)] pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1">
              <SkeletonBlock className="h-3 w-32 max-w-full rounded-md" />
              <SkeletonBlock className="mt-2 h-6 w-48 max-w-full rounded-md sm:h-8 sm:w-64" />
              <SkeletonBlock className="mt-2 h-4 w-full max-w-md rounded-md" />
            </div>
            <SkeletonBlock className="h-10 w-full shrink-0 rounded-full sm:w-36" />
          </div>
          <div className="mt-1 divide-y divide-[color:var(--dash-surface-border)]">
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className="flex min-h-10 items-center gap-2.5 px-2.5 py-2.5 sm:gap-3 sm:px-3"
              >
                <SkeletonBlock className="h-8 w-8 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <SkeletonBlock className="h-4 w-[78%] max-w-full rounded-md" />
                  <SkeletonBlock className="h-3 w-36 max-w-[70%] rounded-md" />
                </div>
                <SkeletonBlock className="h-10 w-10 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export const lessonWorkspaceGridClass =
  "grid w-full min-w-0 max-w-full gap-3 sm:gap-4 @min-[52rem]:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] @min-[52rem]:items-start";

function LessonIndexRowsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex min-h-10 items-center gap-2.5 rounded-xl px-2.5 py-1.5">
          <SkeletonBlock className="h-8 w-8 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <SkeletonBlock className="h-3.5 w-[88%] max-w-full rounded-md" />
            <SkeletonBlock className="h-3 w-[58%] max-w-full rounded-md" />
          </div>
        </div>
      ))}
    </>
  );
}

function LessonPageSkeleton() {
  return (
    <article className="course-book-page relative min-w-0 overflow-hidden rounded-2xl" aria-hidden>
      <header className="border-b border-[color:var(--dash-surface-border)] px-4 pb-4 pt-4 sm:px-7 sm:pb-5 sm:pt-6 md:px-8">
        <div className="flex items-center justify-between gap-3">
          <SkeletonBlock className="h-3 w-36 max-w-[60%] rounded-md" />
          <SkeletonBlock className="h-9 w-9 shrink-0 rounded-lg" />
        </div>
        <SkeletonBlock className="mt-3 h-6 w-[82%] max-w-lg rounded-md sm:h-8" />
        <SkeletonBlock className="mt-2 h-4 w-48 max-w-full rounded-md" />
        <div className="mt-3 flex flex-wrap gap-2">
          <SkeletonBlock className="h-7 w-24 rounded-full" />
          <SkeletonBlock className="h-7 w-32 rounded-full" />
        </div>
      </header>
      <div className="px-4 py-4 sm:px-7 sm:py-6 md:px-8 md:py-7">
        <LessonContentSkeleton includeHeader={false} />
      </div>
      <footer className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7 md:px-8">
        <SkeletonBlock className="h-4 w-24 rounded-md" />
        <div className="flex w-full gap-2 sm:w-auto">
          <SkeletonBlock className="h-10 min-w-0 flex-1 rounded-full sm:w-36 sm:flex-none" />
          <SkeletonBlock className="h-10 min-w-0 flex-1 rounded-full sm:w-32 sm:flex-none" />
        </div>
      </footer>
    </article>
  );
}

export function LessonsWorkspaceSkeleton() {
  return (
    <div className="@container min-w-0 w-full" aria-busy="true" aria-label="Loading lessons">
      <div className={lessonWorkspaceGridClass}>
        <div className="dashboard-glass-card course-book-index order-1 overflow-hidden rounded-2xl @min-[52rem]:hidden">
          <div className="flex min-h-11 items-center gap-3 px-3.5 py-3 sm:px-4">
            <SkeletonBlock className="h-9 w-9 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <SkeletonBlock className="h-3 w-24 rounded-md" />
              <SkeletonBlock className="h-4 w-[70%] max-w-full rounded-md" />
              <SkeletonBlock className="h-3 w-16 rounded-md" />
            </div>
            <SkeletonBlock className="h-4 w-4 shrink-0 rounded-full" />
          </div>
        </div>

        <aside className="dashboard-glass-card course-book-index relative order-3 hidden flex-col overflow-hidden rounded-2xl @min-[52rem]:order-1 @min-[52rem]:flex">
          <div className="flex flex-col gap-3 border-b border-[color:var(--dash-surface-border)] px-4 py-4 sm:px-5">
            <div>
              <SkeletonBlock className="h-3 w-12 rounded-md" />
              <SkeletonBlock className="mt-2 h-5 w-40 max-w-full rounded-md" />
              <SkeletonBlock className="mt-2 h-3 w-16 rounded-md" />
            </div>
            <SkeletonBlock className="h-10 w-full rounded-full" />
          </div>
          <div className="space-y-1 p-3">
            <LessonIndexRowsSkeleton />
          </div>
        </aside>

        <div className="order-2 min-w-0">
          <LessonPageSkeleton />
        </div>
      </div>
    </div>
  );
}

export function LessonContentSkeleton({ includeHeader = true }: { includeHeader?: boolean }) {
  return (
    <div className="grid min-w-0 gap-7" aria-busy="true" aria-label="Loading lesson content">
      {includeHeader ? <LessonPageSkeleton /> : null}
      {Array.from({ length: includeHeader ? 0 : 3 }, (_, index) => (
        <div key={index} className="min-w-0">
          <SkeletonBlock className="h-4 w-32 max-w-full rounded-md" />
          <div className="mt-3 space-y-2">
            <SkeletonBlock className="h-3.5 w-full rounded-md" />
            <SkeletonBlock className="h-3.5 w-[96%] rounded-md" />
            <SkeletonBlock className="h-3.5 w-[90%] rounded-md" />
            <SkeletonBlock className="h-3.5 w-[72%] rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LessonLearningSkeleton() {
  return (
    <div className="mt-8 space-y-4" aria-busy="true" aria-label="Loading lesson">
      <SkeletonBlock className="h-3 w-28 rounded-full" />
      <SkeletonBlock className="h-3.5 w-full rounded-full" />
      <SkeletonBlock className="h-3.5 w-[96%] rounded-full" />
      <SkeletonBlock className="h-3.5 w-[90%] rounded-full" />
      <SkeletonBlock className="mt-4 h-3 w-24 rounded-full" />
      <SkeletonBlock className="h-3.5 w-full rounded-full" />
      <SkeletonBlock className="h-3.5 w-[92%] rounded-full" />
      <SkeletonBlock className="h-3.5 w-[80%] rounded-full" />
    </div>
  );
}

export function TestResultsPageSkeleton() {
  return (
    <div
      className="test-result-page grid w-full min-w-0 gap-3 sm:gap-4"
      aria-busy="true"
      aria-label="Loading test results"
    >
      <section className="dashboard-glass-card min-w-0 rounded-2xl p-4 sm:p-5">
        <SkeletonBlock className="h-3 w-28 rounded-md" />
        <div className="mt-3 flex items-end gap-2">
          <SkeletonBlock className="h-8 w-16 rounded-md" />
          <SkeletonBlock className="mb-0.5 h-3 w-24 rounded-md" />
        </div>
        <SkeletonBlock className="mt-4 h-2 w-full rounded-full" />
        <SkeletonBlock className="mt-2 h-3 w-52 max-w-full rounded-md" />
      </section>
      <section className="dashboard-glass-card min-w-0 overflow-hidden rounded-2xl">
        <TestResultRowsSkeleton />
      </section>
    </div>
  );
}

export function TestResultRowsSkeleton({ count = 5 }: { count?: number }) {
  const columns = ["w-40", "w-12", "w-14", "w-16", "w-20", "w-12"];

  return (
    <div aria-busy="true" aria-label="Loading results">
      <ul className="grid gap-2.5 px-3.5 py-4 sm:gap-3 sm:px-5 md:hidden">
        {Array.from({ length: Math.min(count, 4) }, (_, index) => (
          <li key={index} className="min-w-0 overflow-hidden rounded-2xl bg-[color:var(--dash-soft)]/80 px-4 py-4">
            <SkeletonBlock className="h-4 w-[78%] max-w-full rounded-md" />
            <SkeletonBlock className="mt-2 h-3 w-32 max-w-full rounded-md" />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <SkeletonBlock className="h-8 w-full rounded-lg" />
              <SkeletonBlock className="h-8 w-full rounded-lg" />
            </div>
            <div className="mt-3 flex justify-end border-t border-[color:var(--dash-surface-border)] pt-3">
              <SkeletonBlock className="h-4 w-12 rounded-md" />
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden min-w-0 overflow-x-auto md:block">
        <table className="w-full min-w-[40rem] border-separate border-spacing-0 text-left">
          <thead>
            <tr className="bg-[color:var(--dash-soft)]">
              {columns.map((width, index) => (
                <th key={index} className="px-3 py-3 sm:px-5">
                  <SkeletonBlock className={`h-3 rounded-full ${width}`} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: count }, (_, index) => (
              <tr key={index}>
                {columns.map((width, cell) => (
                  <td key={cell} className="border-t border-[color:var(--dash-surface-border)] px-3 py-3 sm:px-5">
                    <SkeletonBlock className={`h-4 rounded-full ${width}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
