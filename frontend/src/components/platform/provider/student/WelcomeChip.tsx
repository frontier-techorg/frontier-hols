"use client";

import {
  avatarSrcFromUser,
  displayNameFromUser,
  initialsFor,
  useStoredUser,
} from "@/lib/integrate/auth/useStoredUser";
import { cn } from "@/lib/utils";

type WelcomeChipProps = {
  className?: string;
  /** Shown before hydration and when the stored user has no name. */
  fallbackName?: string;
  /** Navy capsule used on the dashboard header. */
  tone?: "glass" | "navy";
};

/** Hydration-safe welcome chip — initials first, then stored photo/name after mount. */
export function WelcomeChip({
  className,
  fallbackName = "Student",
  tone = "glass",
}: WelcomeChipProps) {
  const { user, ready } = useStoredUser();
  const name = ready ? displayNameFromUser(user, fallbackName) : fallbackName;
  const photo = ready ? avatarSrcFromUser(user) : undefined;
  const initials = initialsFor(name);
  const navy = tone === "navy";

  return (
    <span
      className={cn(
        "dashboard-welcome-chip flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-1.5 sm:gap-2.5 sm:pr-3.5",
        navy && "dashboard-welcome-chip-navy border-transparent bg-[#142644]",
        className,
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#DDE466] text-brand-caption font-semibold text-[#152744]">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="h-full w-full object-cover" />
        ) : (
          initials
        )}
      </span>
      <span className="hidden max-w-[9rem] flex-col leading-tight sm:flex md:max-w-[12rem]">
        <span
          className={cn(
            "text-brand-caption font-medium tracking-[0.005em]",
            navy ? "text-white" : "text-[color:var(--dash-muted)]",
          )}
        >
          Welcome Back !
        </span>
        <span
          className={cn(
            "font-sans truncate text-sm font-semibold tracking-[0.005em]",
            navy ? "text-white" : "text-[color:var(--dash-text)]",
          )}
        >
          {name}
        </span>
      </span>
    </span>
  );
}
