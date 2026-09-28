"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const GENERIC_COVER = "/assets/webinars/cover-generic.svg";

type WebinarCoverVisualProps = {
  coverUrl?: string | null;
  title?: string | null;
  booked?: boolean;
  className?: string;
};

/** Horizontal cover media: API thumbnail when present, generic asset otherwise. */
export function WebinarCoverVisual({
  coverUrl,
  title,
  booked = false,
  className,
}: WebinarCoverVisualProps) {
  const [failed, setFailed] = useState(false);
  const src = !failed && coverUrl?.trim() ? coverUrl.trim() : GENERIC_COVER;
  const alt = title?.trim() ? `${title.trim()} cover` : "Webinar cover";

  return (
    <div
      className={cn(
        "webinar-cover-visual relative isolate h-[5.75rem] w-full shrink-0 overflow-hidden rounded-xl sm:h-[6.25rem] sm:w-[10.5rem] md:w-[12rem]",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="webinar-cover-photo absolute inset-0 h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
      <div className="webinar-cover-shade absolute inset-0" aria-hidden />
      <div className="webinar-cover-sweep absolute inset-y-0 -left-1/3 w-1/3" aria-hidden />

      <span className="webinar-cover-badge absolute left-2.5 top-2.5 z-10 inline-flex items-center gap-1.5 rounded-full bg-[#142644] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-white">
        <span className="webinar-cover-pulse h-1.5 w-1.5 rounded-full bg-[#DDE466]" />
        {booked ? "Booked" : "Upcoming"}
      </span>
    </div>
  );
}
