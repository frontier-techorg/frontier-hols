import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

/** Custom HOLS sidebar icons — mirror files in /public/assets/icon */
export type SidebarIconName =
  | "dashboard"
  | "lectures"
  | "webinars"
  | "calculator"
  | "adviser"
  | "payment"
  | "profile"
  | "users"
  | "referrals"
  | "earnings"
  | "plans"
  | "search"
  | "logout"
  | "previous"
  | "back"
  | "next"
  | "cross"
  | "roman"
  | "check"
  | "clock"
  | "quiz"
  | "up"
  | "send"
  | "chevron-down"
  | "chevron-up"
  | "focus"
  | "spinner"
  | "plus"
  | "minus"
  | "mail"
  | "shield"
  | "location"
  | "notification"
  | "bell"
  | "orders"
  | "star"
  | "menu"
  | "alert"
  | "lock";

export type RomanChapterName =
  | "roman-i"
  | "roman-ii"
  | "roman-iii"
  | "roman-iv"
  | "roman-v"
  | "roman-vi"
  | "roman-vii"
  | "roman-viii"
  | "roman-ix"
  | "roman-x"
  | "roman-xi"
  | "roman-xii";

type SvgProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

function BaseIcon({ size = 22, className, children, ...props }: SvgProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("shrink-0", className)}
      {...props}
    >
      {children}
    </svg>
  );
}

const ICON_PATHS: Record<SidebarIconName, React.ReactNode> = {
  dashboard: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.75" />
      <rect x="13.5" y="3.5" width="7" height="4.5" rx="1.5" />
      <rect x="13.5" y="10.5" width="7" height="10" rx="1.75" />
      <rect x="3.5" y="13" width="7" height="7.5" rx="1.75" />
    </>
  ),
  lectures: (
    <>
      <path d="M4 5.75c1.6-.85 3.35-1.25 5.25-1.25 1.9 0 3.65.4 5.25 1.25v12.5c-1.6-.85-3.35-1.25-5.25-1.25-1.9 0-3.65.4-5.25 1.25V5.75Z" />
      <path d="M14.5 5.75c1.6-.85 3.35-1.25 5.25-1.25V17c-1.9 0-3.65.4-5.25 1.25" />
      <path d="M9.25 4.5v12.25" />
    </>
  ),
  webinars: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="M8 3.75h8" />
      <path d="M10.25 10.1 15 12.5l-4.75 2.4V10.1Z" fill="currentColor" stroke="none" />
    </>
  ),
  calculator: (
    <>
      <rect x="4.5" y="2.75" width="15" height="18.5" rx="2.5" />
      <rect x="7" y="5.25" width="10" height="3.5" rx="1" />
      <circle cx="8.25" cy="12.25" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12.25" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15.75" cy="12.25" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="8.25" cy="15.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="15.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15.75" cy="15.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="8.25" cy="18.75" r="0.9" fill="currentColor" stroke="none" />
      <path d="M11.1 18.75h4.65" strokeWidth={1.9} />
    </>
  ),
  adviser: (
    <>
      <path d="M5.5 16.75 4 20l3.5-1.35A8.75 8.75 0 1 0 5.5 16.75Z" fill="none" />
      <circle cx="9.25" cy="11" r="1.05" fill="currentColor" stroke="none" />
      <circle cx="12" cy="11" r="1.05" fill="currentColor" stroke="none" />
      <circle cx="14.75" cy="11" r="1.05" fill="currentColor" stroke="none" />
    </>
  ),
  payment: (
    <>
      <rect x="2.75" y="5.5" width="18.5" height="13" rx="2.5" />
      <path d="M2.75 9.75h18.5" />
      <path d="M7 15h3.25" />
      <path d="M13.75 15h3.5" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 19.25c1.35-3.1 3.55-4.65 6.5-4.65s5.15 1.55 6.5 4.65" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="2.85" />
      <path d="M3.75 18.75c1.05-2.55 2.85-3.85 5.25-3.85s4.2 1.3 5.25 3.85" />
      <circle cx="16.5" cy="8.5" r="2.35" />
      <path d="M14.35 14.85c1.55-.55 3.2-.45 4.9.95" />
    </>
  ),
  referrals: (
    <>
      <circle cx="7" cy="7" r="2.35" />
      <circle cx="17" cy="7" r="2.35" />
      <circle cx="12" cy="17" r="2.35" />
      <path d="M9 8.35h6" />
      <path d="M8.35 8.9 10.9 15.1" />
      <path d="M15.65 8.9 13.1 15.1" />
    </>
  ),
  earnings: (
    <>
      <path d="M4.5 8.25h12.25A3.25 3.25 0 0 1 20 11.5v6.25A2.75 2.75 0 0 1 17.25 20.5H7.5A3 3 0 0 1 4.5 17.5V8.25Z" />
      <path d="M4.5 8.25V6.75A2.5 2.5 0 0 1 7 4.25h9.5" />
      <circle cx="14.75" cy="14.5" r="1.85" />
    </>
  ),
  plans: (
    <>
      <rect x="4.5" y="4.25" width="15" height="4.25" rx="1.35" />
      <rect x="4.5" y="9.875" width="15" height="4.25" rx="1.35" />
      <rect x="4.5" y="15.5" width="15" height="4.25" rx="1.35" />
      <path d="M7.25 6.375h2.5" />
      <path d="M7.25 12h2.5" />
      <path d="M7.25 17.625h2.5" />
    </>
  ),
  search: (
    <>
      <circle cx="10.75" cy="10.75" r="6.25" />
      <path d="m15.4 15.4 4.35 4.35" />
    </>
  ),
  logout: (
    <>
      <path d="M10 4.5H7.5A3 3 0 0 0 4.5 7.5v9A3 3 0 0 0 7.5 19.5H10" />
      <path d="M14 8.25 18.5 12 14 15.75" />
      <path d="M18.25 12H9.5" />
    </>
  ),
  previous: (
    <>
      <path d="M14.75 5.5 8.25 12l6.5 6.5" />
      <path d="M8.5 12h11" />
    </>
  ),
  back: (
    <>
      <circle cx="12" cy="12" r="9.15" fill="none" stroke="currentColor" strokeWidth="1.9" />
      <path fill="currentColor" stroke="none" d="M12.8 8.6 7.4 12 12.8 15.4v-2.1h3.8v-2.6h-3.8z" />
    </>
  ),
  next: (
    <>
      <path d="M9.25 5.5 15.75 12l-6.5 6.5" />
      <path d="M4.5 12h11" />
    </>
  ),
  cross: (
    <>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M9 9 15 15" />
      <path d="M15 9 9 15" />
    </>
  ),
  roman: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M8.4 8h2.8" />
      <path d="M9.8 8v8" />
      <path d="M8.4 16h2.8" />
      <path d="M12.8 8h2.8" />
      <path d="M14.2 8v8" />
      <path d="M12.8 16h2.8" />
    </>
  ),
  check: <path d="M5.5 12.5 10 17l8.5-10" />,
  clock: (
    <>
      <path d="M9.25 3.5h5.5" />
      <path d="M12 3.5V5.5" />
      <circle cx="12" cy="13" r="7.25" />
      <path d="M12 9.5v3.5l2.5 1.5" />
    </>
  ),
  quiz: (
    <>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M9.6 9.4a2.5 2.5 0 1 1 3.85 2.1c-.7.45-1.2.95-1.2 1.75" />
      <path d="M12 16.85h.01" />
    </>
  ),
  up: <path d="M4.5 16 12 8.5l7.5 7.5" />,
  send: (
    <>
      <path d="M12 18.25V5.75" />
      <path d="M6.25 11.5 12 5.75 17.75 11.5" />
    </>
  ),
  "chevron-down": <path d="M5.5 9 12 15.5 18.5 9" />,
  "chevron-up": <path d="M5.5 15 12 8.5 18.5 15" />,
  focus: (
    <>
      <circle cx="12" cy="12" r="3.25" />
      <path d="M4.5 12h3.25M16.25 12H19.5M12 4.5v3.25M12 16.25V19.5" />
    </>
  ),
  spinner: <path d="M12 3.75a8.25 8.25 0 1 1-7.15 4.12" />,
  plus: (
    <>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.25" />
      <path d="m4.75 7.5 7.25 5.25L19.25 7.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 19.25 6.25v5.1c0 4.35-2.95 7.85-7.25 9.15-4.3-1.3-7.25-4.8-7.25-9.15v-5.1L12 3.5Z" />
      <path d="m9.1 12.1 1.95 1.95 3.9-3.95" />
    </>
  ),
  location: (
    <>
      <path d="M12 21s-6.5-4.35-6.5-10.1A6.5 6.5 0 0 1 12 4.4a6.5 6.5 0 0 1 6.5 6.5C18.5 16.65 12 21 12 21Z" />
      <circle cx="12" cy="11.3" r="2.15" />
    </>
  ),
  notification: (
    <>
      <path d="M6.75 9.2c0-2.9 2.35-5.25 5.25-5.25S17.25 6.3 17.25 9.2c0 3.9 1.45 6.1 2.3 7.15.4.5.1 1.3-.6 1.3H5.05c-.7 0-1-.8-.6-1.3.85-1.05 2.3-3.25 2.3-7.15Z" />
      <path d="M9.85 17.65a2.15 2.15 0 0 0 4.3 0" />
      <circle cx="16.85" cy="5.35" r="1.7" fill="currentColor" stroke="none" />
    </>
  ),
  bell: (
    <>
      <path d="M6.75 9.2c0-2.9 2.35-5.25 5.25-5.25S17.25 6.3 17.25 9.2c0 3.9 1.45 6.1 2.3 7.15.4.5.1 1.3-.6 1.3H5.05c-.7 0-1-.8-.6-1.3.85-1.05 2.3-3.25 2.3-7.15Z" />
      <path d="M9.85 17.65a2.15 2.15 0 0 0 4.3 0" />
    </>
  ),
  orders: (
    <>
      <path d="M7.25 8.5V6.75A2.25 2.25 0 0 1 9.5 4.5h5A2.25 2.25 0 0 1 16.75 6.75V8.5" />
      <rect x="4.5" y="8.5" width="15" height="11" rx="2.25" />
      <path d="M9.25 12.5h5.5" />
      <path d="M9.25 15.75h3.75" />
    </>
  ),
  star: (
    <path d="M12 3.5 14.1 8.7l5.65.55-4.25 3.75 1.25 5.5L12 15.85 7.25 18.5l1.25-5.5L4.25 9.25l5.65-.55L12 3.5Z" />
  ),
  menu: (
    <>
      <path d="M5.5 4.75h13" />
      <path d="M5.5 12h13" />
      <path d="M5.5 19.25h13" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 8v5" />
      <path d="M12 16.85h.01" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="11" width="15" height="9.5" rx="2.25" />
      <path d="M8 11V7.75a4 4 0 0 1 8 0V11" />
    </>
  ),
};

const ROMAN_CHAPTER_PATHS: Record<RomanChapterName, React.ReactNode> = {
  "roman-i": (
    <>
      <path d="M9.2 6.4h5.6" />
      <path d="M12 6.4v11.2" />
      <path d="M9.2 17.6h5.6" />
    </>
  ),
  "roman-ii": (
    <>
      <path d="M7.4 6.4h4" />
      <path d="M9.4 6.4v11.2" />
      <path d="M7.4 17.6h4" />
      <path d="M12.6 6.4h4" />
      <path d="M14.6 6.4v11.2" />
      <path d="M12.6 17.6h4" />
    </>
  ),
  "roman-iii": (
    <>
      <path d="M5.8 6.4h3.6" />
      <path d="M7.6 6.4v11.2" />
      <path d="M5.8 17.6h3.6" />
      <path d="M10.2 6.4h3.6" />
      <path d="M12 6.4v11.2" />
      <path d="M10.2 17.6h3.6" />
      <path d="M14.6 6.4h3.6" />
      <path d="M16.4 6.4v11.2" />
      <path d="M14.6 17.6h3.6" />
    </>
  ),
  "roman-iv": (
    <>
      <path d="M5.6 6.4h3.6" />
      <path d="M7.4 6.4v11.2" />
      <path d="M5.6 17.6h3.6" />
      <path d="M11.2 6.4 15.4 17.6" />
      <path d="M19.6 6.4 15.4 17.6" />
    </>
  ),
  "roman-v": (
    <>
      <path d="M7.4 6.4 12 17.6" />
      <path d="M16.6 6.4 12 17.6" />
    </>
  ),
  "roman-vi": (
    <>
      <path d="M5.8 6.4 9.8 17.6" />
      <path d="M13.8 6.4 9.8 17.6" />
      <path d="M15.4 6.4h3.4" />
      <path d="M17.1 6.4v11.2" />
      <path d="M15.4 17.6h3.4" />
    </>
  ),
  "roman-vii": (
    <>
      <path d="M4.6 6.4 8 17.6" />
      <path d="M11.4 6.4 8 17.6" />
      <path d="M12.8 6.4h3.2" />
      <path d="M14.4 6.4v11.2" />
      <path d="M12.8 17.6h3.2" />
      <path d="M16.4 6.4h3.2" />
      <path d="M18 6.4v11.2" />
      <path d="M16.4 17.6h3.2" />
    </>
  ),
  "roman-viii": (
    <>
      <path d="M3.8 6.4 6.8 17.6" />
      <path d="M9.8 6.4 6.8 17.6" />
      <path d="M11 6.4h2.8" />
      <path d="M12.4 6.4v11.2" />
      <path d="M11 17.6h2.8" />
      <path d="M14.2 6.4h2.8" />
      <path d="M15.6 6.4v11.2" />
      <path d="M14.2 17.6h2.8" />
      <path d="M17.4 6.4h2.8" />
      <path d="M18.8 6.4v11.2" />
      <path d="M17.4 17.6h2.8" />
    </>
  ),
  "roman-ix": (
    <>
      <path d="M6.2 6.4h3.8" />
      <path d="M8.1 6.4v11.2" />
      <path d="M6.2 17.6h3.8" />
      <path d="M12.2 6.4 16.6 17.6" />
      <path d="M16.6 6.4 12.2 17.6" />
    </>
  ),
  "roman-x": (
    <>
      <path d="M7.4 6.4 16.6 17.6" />
      <path d="M16.6 6.4 7.4 17.6" />
    </>
  ),
  "roman-xi": (
    <>
      <path d="M5.6 6.4 13.2 17.6" />
      <path d="M13.2 6.4 5.6 17.6" />
      <path d="M15.2 6.4h3.4" />
      <path d="M16.9 6.4v11.2" />
      <path d="M15.2 17.6h3.4" />
    </>
  ),
  "roman-xii": (
    <>
      <path d="M4.4 6.4 11.2 17.6" />
      <path d="M11.2 6.4 4.4 17.6" />
      <path d="M13 6.4h3" />
      <path d="M14.5 6.4v11.2" />
      <path d="M13 17.6h3" />
      <path d="M16.6 6.4h3" />
      <path d="M18.1 6.4v11.2" />
      <path d="M16.6 17.6h3" />
    </>
  ),
};

const ROMAN_CHAPTER_NAMES: RomanChapterName[] = [
  "roman-i",
  "roman-ii",
  "roman-iii",
  "roman-iv",
  "roman-v",
  "roman-vi",
  "roman-vii",
  "roman-viii",
  "roman-ix",
  "roman-x",
  "roman-xi",
  "roman-xii",
];

export function SidebarSvgIcon({
  name,
  size = 22,
  className,
  ...props
}: SvgProps & { name: SidebarIconName }) {
  return (
    <BaseIcon size={size} className={className} {...props}>
      {ICON_PATHS[name]}
    </BaseIcon>
  );
}

/** Chapter roman numeral (I–XII) — bold serif strokes for TOC badges */
export function RomanChapterIcon({
  index,
  size = 18,
  className,
  ...props
}: SvgProps & { index: number }) {
  const name = ROMAN_CHAPTER_NAMES[Math.max(0, Math.min(index, ROMAN_CHAPTER_NAMES.length - 1))];
  return (
    <BaseIcon size={size} className={className} strokeWidth={2.55} {...props}>
      {ROMAN_CHAPTER_PATHS[name]}
    </BaseIcon>
  );
}

/** Portal nav chrome wrapper — icons read larger than label text. */
export function PortalNavIcon({
  name,
  size = 20,
  className,
}: {
  name: SidebarIconName;
  size?: number;
  className?: string;
}) {
  return (
    <span className="portal-nav-icon flex h-5 w-5 shrink-0 items-center justify-center bg-transparent text-current transition-colors duration-200">
      <SidebarSvgIcon name={name} size={size} className={className} />
    </span>
  );
}
