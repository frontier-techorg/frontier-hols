"use client";

import Image from "next/image";
import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  BookOpen,
  Calculator,
  CreditCard,
  Icon,
  LayoutDashboard,
  Sparkles,
  User,
} from "@/components/icons";
import { CalculatorReconScene } from "@/components/platform/provider/student/calculator/CalculatorReconScene";
import { landingContent } from "@/content/landing";
import { cn } from "@/lib/utils";

/** Student portal palette — mirrors `.portal-shell` / `.dashboard-screen` tokens. */
const LIME = "#DDE466";
const NAVY = "#142644";
const TEXT_NAVY = "#152744";

const THEME = {
  light: {
    chromeBg: "#ffffff",
    chromeUrl: "rgba(21, 39, 68, 0.04)",
    pageBg: "#e5e5e5",
    pageBgSolid: "#e5e5e5",
    sidebarBg: "#ffffff",
    sidebarBorder: "rgba(21, 39, 68, 0.12)",
    sidebarText: "#142644",
    sidebarMuted: "rgba(20, 38, 68, 0.62)",
    sidebarHover: "rgba(20, 38, 68, 0.08)",
    sidebarActive: "rgba(221, 228, 102, 0.28)",
    sidebarActiveShadow: "inset 0 0 0 1px rgba(221, 228, 102, 0.36)",
    sidebarFooter: "#ffffff",
    cardBg: "rgba(255, 255, 255, 0.42)",
    cardBorder: "rgba(255, 255, 255, 0.55)",
    text: "#152744",
    muted: "rgba(21, 39, 68, 0.72)",
    faint: "rgba(21, 39, 68, 0.52)",
    accent: "#6f7a1c",
    soft: "rgba(21, 39, 68, 0.05)",
    softBorder: "rgba(21, 39, 68, 0.08)",
    shellBorder: "rgba(21, 39, 68, 0.1)",
    switchOff: "rgba(20, 38, 68, 0.12)",
  },
  dark: {
    chromeBg: "#142644",
    chromeUrl: "rgba(255, 255, 255, 0.08)",
    pageBg:
      "radial-gradient(100% 90% at 100% 0%, rgba(221, 228, 102, 0.28) 0%, transparent 55%), radial-gradient(90% 85% at 0% 100%, rgba(141, 195, 225, 0.22) 0%, transparent 58%), linear-gradient(150deg, #142644 0%, #1a2f55 40%, #162848 100%)",
    pageBgSolid: "#142644",
    sidebarBg: "#142644",
    sidebarBorder: "rgba(141, 195, 225, 0.14)",
    sidebarText: "#f4f7fb",
    sidebarMuted: "rgba(244, 247, 251, 0.68)",
    sidebarHover: "rgba(255, 255, 255, 0.08)",
    sidebarActive: "rgba(221, 228, 102, 0.2)",
    sidebarActiveShadow: "inset 0 0 0 1px rgba(221, 228, 102, 0.4)",
    sidebarFooter: "rgba(0, 0, 0, 0.22)",
    cardBg: "rgba(20, 38, 68, 0.45)",
    cardBorder: "rgba(141, 195, 225, 0.2)",
    text: "#f4f7fb",
    muted: "rgba(244, 247, 251, 0.72)",
    faint: "rgba(244, 247, 251, 0.55)",
    accent: "#dde466",
    soft: "rgba(255, 255, 255, 0.08)",
    softBorder: "rgba(255, 255, 255, 0.14)",
    shellBorder: "rgba(255, 255, 255, 0.12)",
    switchOff: "rgba(255, 255, 255, 0.12)",
  },
} as const;

/** Locked desktop frame — never reflows when switching portal pages. */
export const HOOK_PORTAL_SIZE = {
  width: 460,
  height: 331,
} as const;

/**
 * Desktop: exact locked-size slot (no scale).
 * Mobile (`responsive`): scales the locked frame down to fit container width.
 */
export function HookPortalShell({
  children,
  className,
  responsive = false,
}: {
  children: ReactNode;
  className?: string;
  responsive?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    if (!responsive) return;
    const el = wrapRef.current;
    if (!el) return;

    const update = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      const next = Math.min(1, w / HOOK_PORTAL_SIZE.width);
      setScale((prev) => (Math.abs(prev - next) < 0.001 ? prev : next));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [responsive]);

  // Remeasure hook wires after scale settles (fixed child size won't fire ResizeObserver).
  // Debounce so we don't thrash ScrollTrigger / sibling landing sections.
  useLayoutEffect(() => {
    if (!responsive) return;
    const id = window.setTimeout(() => {
      window.dispatchEvent(new Event("hook-path-sync"));
    }, 50);
    return () => window.clearTimeout(id);
  }, [responsive, scale]);

  if (!responsive) {
    return (
      <div
        data-hook-portal-shell
        className={cn("relative shrink-0", className)}
        style={{
          width: HOOK_PORTAL_SIZE.width,
          height: HOOK_PORTAL_SIZE.height,
          minWidth: HOOK_PORTAL_SIZE.width,
          minHeight: HOOK_PORTAL_SIZE.height,
        }}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      data-hook-portal-shell
      className={cn(
        // min-w-0 + overflow-hidden: the pre-scale 460px child must not
        // inflate the grid track (that was clipping the CTA / breaking pins).
        "relative w-full min-w-0 max-w-[460px] overflow-hidden",
        className,
      )}
      style={{ height: HOOK_PORTAL_SIZE.height * scale }}
    >
      <div
        data-hook-portal-scale
        className="origin-top-left will-change-transform"
        style={{
          width: HOOK_PORTAL_SIZE.width,
          height: HOOK_PORTAL_SIZE.height,
          transform: `scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

const NAV_ICONS: Record<string, ReactNode> = {
  dashboard: <Icon icon={LayoutDashboard} size={12} strokeWidth={1.75} className="h-3 w-3" />,
  lectures: <Icon icon={BookOpen} size={12} strokeWidth={1.75} className="h-3 w-3" />,
  calculator: <Icon icon={Calculator} size={12} strokeWidth={1.75} className="h-3 w-3" />,
  advisor: <Icon icon={Sparkles} size={12} strokeWidth={1.75} className="h-3 w-3" />,
  payment: <Icon icon={CreditCard} size={12} strokeWidth={1.75} className="h-3 w-3" />,
  profile: <Icon icon={User} size={12} strokeWidth={1.75} className="h-3 w-3" />,
};

const COURSES = [
  { id: "bpc", title: "BPC-157 foundations", meta: "4 lessons" },
  { id: "recon", title: "Reconstitution basics", meta: "3 lessons" },
  { id: "safety", title: "Clinic safety checks", meta: "2 lessons" },
];

const ADVISOR_PROMPTS = [
  "How do I reconstitute BPC-157?",
  "What syringe volume for 250 mcg?",
  "Patient handout wording?",
];

const DEMO_PROFILE = {
  name: "Jordan Mitchell",
  initials: "JM",
  email: "jordan.mitchell@email.com",
  clinic: "Summit Wellness Clinic",
  role: "Student account",
  photo: "/assets/hook/jordan-mitchell.jpg",
} as const;

type NavId = (typeof landingContent.hook.dashboard.nav)[number]["id"];

type HookInteractiveDashboardProps = {
  innerRef?: (node: HTMLDivElement | null) => void;
  className?: string;
};

export function HookInteractiveDashboard({
  innerRef,
  className,
}: HookInteractiveDashboardProps) {
  const { dashboard } = landingContent.hook;
  const [activeNav, setActiveNav] = useState<NavId>("dashboard");
  const [darkMode, setDarkMode] = useState(true);
  const [doseMg, setDoseMg] = useState(250);
  const [vialMg, setVialMg] = useState(5);
  const [waterMl, setWaterMl] = useState(2);
  const [advisorPrompt, setAdvisorPrompt] = useState(ADVISOR_PROMPTS[0]);
  const [advisorReply, setAdvisorReply] = useState(
    "Use sterile water, note the concentration, then draw the exact units for your protocol.",
  );

  const units = Math.max(1, Math.round((doseMg / (vialMg * 1000)) * waterMl * 100));

  function openTool(id: string) {
    if (id === "lectures" || id === "calculator" || id === "advisor" || id === "profile" || id === "payment") {
      setActiveNav(id);
    } else if (id === "plans" || id === "orders") {
      setActiveNav("payment");
    } else if (id === "account") {
      setActiveNav("profile");
    } else {
      setActiveNav("dashboard");
    }
  }

  function askAdvisor(prompt: string) {
    setAdvisorPrompt(prompt);
    if (prompt.includes("reconstitute")) {
      setAdvisorReply("Add bacteriostatic water slowly down the vial wall. Swirl gently — never shake.");
    } else if (prompt.includes("syringe") || prompt.includes("250")) {
      setAdvisorReply(`At ${vialMg} mg / ${waterMl} mL, 250 mcg is about ${units} units on an insulin syringe.`);
    } else {
      setAdvisorReply("Keep handouts brand-consistent: dose, schedule, storage, and when to contact the clinic.");
    }
  }

  const t = darkMode ? THEME.dark : THEME.light;

  return (
    <div
      ref={innerRef}
      data-hook-dashboard
      data-theme={darkMode ? "dark" : "light"}
      className={cn(
        "pointer-events-auto relative z-20 box-border shrink-0 overflow-hidden rounded-2xl border",
        className,
      )}
      style={{
        width: HOOK_PORTAL_SIZE.width,
        height: HOOK_PORTAL_SIZE.height,
        minWidth: HOOK_PORTAL_SIZE.width,
        minHeight: HOOK_PORTAL_SIZE.height,
        maxWidth: HOOK_PORTAL_SIZE.width,
        maxHeight: HOOK_PORTAL_SIZE.height,
        backgroundColor: t.pageBgSolid,
        borderColor: t.shellBorder,
      }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        className="flex h-8 shrink-0 items-center gap-2 border-b px-3"
        style={{ backgroundColor: t.chromeBg, borderColor: t.shellBorder }}
      >
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
        </span>
        <div
          className="ml-1 flex h-5 min-w-0 flex-1 items-center rounded-md border px-2"
          style={{ borderColor: t.softBorder, backgroundColor: t.chromeUrl }}
        >
          <span className="truncate font-sans text-[9px] font-medium" style={{ color: t.faint }}>
            app.hols.io/{activeNav}
          </span>
        </div>
      </div>

      <div className="flex h-[calc(100%-2rem)] min-h-0 w-full overflow-hidden">
        <aside
          className="flex w-[112px] shrink-0 flex-col border-r p-2"
          style={{ backgroundColor: t.sidebarBg, borderColor: t.sidebarBorder }}
        >
          <div className="mb-2 flex shrink-0 items-center gap-1.5 px-1">
            <Image
              src={
                darkMode
                  ? "/assets/logo/hols-logo-mark-light.png"
                  : "/assets/logo/hols-logo-mark.png"
              }
              alt=""
              width={18}
              height={18}
              className="h-3.5 w-3.5 object-contain"
            />
            <span className="font-sans text-[11px] font-bold tracking-wide" style={{ color: t.sidebarText }}>
              {dashboard.brand}
            </span>
          </div>

          <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Portal sections">
            {dashboard.nav.map((item) => {
              const active = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveNav(item.id)}
                  className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left font-sans text-[9px] font-semibold outline-none transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-1 focus-visible:ring-[#DDE466]/70"
                  style={
                    active
                      ? {
                          backgroundColor: t.sidebarActive,
                          color: t.sidebarText,
                          boxShadow: t.sidebarActiveShadow,
                        }
                      : {
                          backgroundColor: "transparent",
                          color: t.sidebarMuted,
                          boxShadow: "none",
                        }
                  }
                  onMouseEnter={(event) => {
                    if (active) return;
                    event.currentTarget.style.backgroundColor = t.sidebarHover;
                    event.currentTarget.style.color = t.sidebarText;
                  }}
                  onMouseLeave={(event) => {
                    if (active) return;
                    event.currentTarget.style.backgroundColor = "transparent";
                    event.currentTarget.style.color = t.sidebarMuted;
                  }}
                >
                  <span
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md transition-[background-color,color,box-shadow] duration-150"
                    style={
                      active
                        ? {
                            backgroundColor: LIME,
                            color: NAVY,
                            boxShadow: "0 2px 6px rgba(221, 228, 102, 0.38)",
                          }
                        : { backgroundColor: "transparent", color: t.sidebarMuted, boxShadow: "none" }
                    }
                  >
                    {NAV_ICONS[item.id]}
                  </span>
                  <span className="truncate leading-none">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div
            className="mt-2 shrink-0 rounded-lg border px-1.5 py-1.5"
            style={{ borderColor: t.sidebarBorder, backgroundColor: t.sidebarFooter }}
          >
            <button
              type="button"
              onClick={() => setDarkMode((value) => !value)}
              className="flex w-full cursor-pointer items-center justify-between gap-1 rounded-md outline-none transition-opacity duration-150 hover:opacity-90 focus-visible:ring-1 focus-visible:ring-[#DDE466]/70"
              aria-pressed={darkMode}
            >
              <span className="font-sans text-[8px] font-medium" style={{ color: t.sidebarText }}>
                Dark mode
              </span>
              <span
                className="relative h-3.5 w-6 shrink-0 rounded-full border transition-[background-color,border-color] duration-150"
                style={{
                  backgroundColor: darkMode ? LIME : t.switchOff,
                  borderColor: darkMode ? "transparent" : t.sidebarBorder,
                }}
              >
                <span
                  className={cn(
                    "absolute top-[1px] h-2.5 w-2.5 rounded-full shadow-sm transition-[left,right,background-color] duration-150",
                    darkMode ? "right-[1px] bg-[#142644]" : "left-[1px] bg-white",
                  )}
                />
              </span>
            </button>
          </div>
        </aside>

        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-2.5"
          style={{ background: t.pageBg, backgroundColor: t.pageBgSolid }}
        >
          <div className="mb-2 flex shrink-0 items-center justify-between">
            <p className="font-sans text-[11px] font-bold capitalize" style={{ color: t.text }}>
              {dashboard.nav.find((item) => item.id === activeNav)?.label ?? "Dashboard"}
            </p>
            <span
              className="relative flex h-5 w-5 overflow-hidden rounded-full border"
              style={{ borderColor: t.softBorder }}
            >
              <Image
                src={DEMO_PROFILE.photo}
                alt={DEMO_PROFILE.name}
                width={40}
                height={40}
                className="h-full w-full object-cover"
              />
            </span>
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden">
            {/* Absolute fill keeps every page the same occupied area */}
            <div className="absolute inset-0 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {activeNav === "dashboard" ? (
                <div className="flex h-full flex-col gap-2">
                  <div className="shrink-0 rounded-xl border p-2.5" style={{ backgroundColor: t.cardBg, borderColor: t.cardBorder }}>
                    <p className="font-sans text-[8px] font-semibold uppercase tracking-[0.12em]" style={{ color: t.faint }}>
                      {dashboard.membership.label}
                    </p>
                    <div className="mt-1 flex items-end justify-between gap-2">
                      <div>
                        <p className="font-sans text-[15px] font-bold leading-none" style={{ color: t.text }}>
                          {dashboard.membership.plan}
                        </p>
                        <p className="mt-1 font-sans text-[9px] font-medium" style={{ color: t.muted }}>
                          {dashboard.membership.status}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveNav("payment")}
                        className="cursor-pointer rounded-full px-2.5 py-1 font-sans text-[9px] font-bold outline-none transition-opacity duration-150 hover:opacity-90 focus-visible:ring-1 focus-visible:ring-[#DDE466]/80"
                        style={{ backgroundColor: LIME, color: TEXT_NAVY }}
                      >
                        Upgrade
                      </button>
                    </div>
                  </div>

                  <div className="shrink-0 rounded-xl border p-2.5" style={{ backgroundColor: t.cardBg, borderColor: t.cardBorder }}>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="font-sans text-[9px] font-bold" style={{ color: t.accent }}>
                        Quick tools
                      </p>
                      <span className="font-sans text-[8px] font-medium" style={{ color: t.accent }}>
                        Tap to explore
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {dashboard.tools.map((tool) => (
                        <button
                          key={tool.id}
                          type="button"
                          onClick={() => openTool(tool.id)}
                          className="group flex cursor-pointer flex-col items-center gap-1 rounded-lg p-1 outline-none transition-colors duration-150 focus-visible:ring-1 focus-visible:ring-[#DDE466]/70"
                          onMouseEnter={(event) => {
                            const icon = event.currentTarget.querySelector<HTMLElement>("[data-hook-tool-icon]");
                            if (!icon) return;
                            icon.style.backgroundColor = LIME;
                            icon.style.borderColor = "rgba(221, 228, 102, 0.65)";
                            icon.style.color = TEXT_NAVY;
                          }}
                          onMouseLeave={(event) => {
                            const icon = event.currentTarget.querySelector<HTMLElement>("[data-hook-tool-icon]");
                            if (!icon) return;
                            icon.style.backgroundColor = t.soft;
                            icon.style.borderColor = t.softBorder;
                            icon.style.color = t.text;
                          }}
                        >
                          <span
                            data-hook-tool-icon
                            className="flex h-7 w-7 items-center justify-center rounded-full border transition-[background-color,border-color,color] duration-150"
                            style={{
                              backgroundColor: t.soft,
                              borderColor: t.softBorder,
                              color: t.text,
                            }}
                          >
                            {NAV_ICONS[tool.id]}
                          </span>
                          <span className="font-sans text-[7px] font-semibold" style={{ color: t.muted }}>
                            {tool.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid min-h-0 flex-1 grid-cols-[1.15fr_0.85fr] gap-2">
                    <div className="rounded-xl border p-2.5" style={{ backgroundColor: t.cardBg, borderColor: t.cardBorder }}>
                      <p className="mb-1.5 font-sans text-[9px] font-bold" style={{ color: t.text }}>
                        Recent activity
                      </p>
                      <p className="font-sans text-[9px]" style={{ color: t.muted }}>
                        No orders yet.
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 rounded-xl border p-2" style={{ backgroundColor: t.cardBg, borderColor: t.cardBorder }}>
                      {dashboard.actions.map((action) => (
                        <button
                          key={action.id}
                          type="button"
                          onClick={() => openTool(action.id)}
                          className="flex cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 text-left outline-none transition-[background-color] duration-150 focus-visible:ring-1 focus-visible:ring-[#DDE466]/70"
                          style={{ color: t.muted, backgroundColor: "transparent" }}
                          onMouseEnter={(event) => {
                            event.currentTarget.style.backgroundColor = t.soft;
                            event.currentTarget.style.color = t.text;
                          }}
                          onMouseLeave={(event) => {
                            event.currentTarget.style.backgroundColor = "transparent";
                            event.currentTarget.style.color = t.muted;
                          }}
                        >
                          <span className="shrink-0">{NAV_ICONS[action.id] ?? NAV_ICONS.payment}</span>
                          <span className="min-w-0 flex-1 truncate font-sans text-[7px] font-semibold">
                            {action.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {activeNav === "lectures" ? (
                <div className="flex h-full flex-col gap-1.5">
                  {COURSES.map((course) => (
                    <button
                      key={course.id}
                      type="button"
                      className="shrink-0 cursor-pointer rounded-xl border p-2.5 text-left outline-none transition-[border-color,background-color] duration-150 focus-visible:ring-1 focus-visible:ring-[#DDE466]/70"
                      style={{ backgroundColor: t.cardBg, borderColor: t.cardBorder }}
                      onMouseEnter={(event) => {
                        event.currentTarget.style.borderColor = "rgba(221, 228, 102, 0.55)";
                        event.currentTarget.style.backgroundColor = darkMode
                          ? "rgba(221, 228, 102, 0.08)"
                          : "rgba(221, 228, 102, 0.12)";
                      }}
                      onMouseLeave={(event) => {
                        event.currentTarget.style.borderColor = t.cardBorder;
                        event.currentTarget.style.backgroundColor = t.cardBg;
                      }}
                    >
                      <p className="font-sans text-[10px] font-bold" style={{ color: t.text }}>
                        {course.title}
                      </p>
                      <p className="mt-0.5 font-sans text-[8px]" style={{ color: t.muted }}>
                        {course.meta}
                      </p>
                    </button>
                  ))}
                  <div className="min-h-0 flex-1 rounded-xl border border-dashed" style={{ borderColor: t.cardBorder }} />
                </div>
              ) : null}

              {activeNav === "calculator" ? (
                <div
                  className="flex h-full flex-col overflow-hidden rounded-xl border"
                  style={{
                    backgroundColor: t.cardBg,
                    borderColor: t.cardBorder,
                    color: t.text,
                    ["--dash-text" as string]: t.text,
                    ["--dash-muted" as string]: t.muted,
                    ["--dash-faint" as string]: t.faint,
                  }}
                >
                  <p className="shrink-0 px-2.5 pt-2 font-sans text-[9px] font-bold" style={{ color: t.text }}>
                    Peptide calculator
                  </p>
                  <div className="min-h-0 flex-1 overflow-hidden px-1 pb-1">
                    <CalculatorReconScene
                      layout="overview"
                      preview
                      syringeMl={1}
                      waterFill={0.68}
                      medFill={0.28}
                      medPowder
                      peptideUnit="mg"
                      instantFill
                    />
                  </div>
                </div>
              ) : null}

              {activeNav === "advisor" ? (
                <div className="flex h-full flex-col gap-2">
                  <div className="min-h-0 flex-1 rounded-xl border p-2.5" style={{ backgroundColor: t.cardBg, borderColor: t.cardBorder }}>
                    <p className="font-sans text-[8px] font-semibold uppercase tracking-[0.1em]" style={{ color: t.muted }}>
                      You asked
                    </p>
                    <p className="mt-1 font-sans text-[10px] font-semibold" style={{ color: t.text }}>
                      {advisorPrompt}
                    </p>
                    <p className="mt-2 font-sans text-[9px] leading-relaxed" style={{ color: t.muted }}>
                      {advisorReply}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {ADVISOR_PROMPTS.map((prompt) => {
                      const selected = advisorPrompt === prompt;
                      return (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => askAdvisor(prompt)}
                          className="cursor-pointer rounded-full border px-2 py-1 font-sans text-[7px] font-semibold outline-none transition-opacity duration-150 hover:opacity-90 focus-visible:ring-1 focus-visible:ring-[#DDE466]/70"
                          style={{
                            borderColor: selected ? "transparent" : t.cardBorder,
                            backgroundColor: selected ? LIME : t.cardBg,
                            color: selected ? TEXT_NAVY : t.muted,
                          }}
                        >
                          {prompt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {activeNav === "payment" ? (
                <div className="flex h-full flex-col gap-1.5">
                  {[
                    { id: "monthly", title: "Monthly", price: "$29.99" },
                    { id: "annual", title: "Annual", price: "$249.99" },
                  ].map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      className="flex shrink-0 cursor-pointer items-center justify-between rounded-xl border p-2.5 text-left outline-none transition-[border-color,background-color] duration-150 focus-visible:ring-1 focus-visible:ring-[#DDE466]/70"
                      style={{ backgroundColor: t.cardBg, borderColor: t.cardBorder }}
                      onMouseEnter={(event) => {
                        event.currentTarget.style.borderColor = "rgba(221, 228, 102, 0.55)";
                        event.currentTarget.style.backgroundColor = darkMode
                          ? "rgba(221, 228, 102, 0.08)"
                          : "rgba(221, 228, 102, 0.12)";
                      }}
                      onMouseLeave={(event) => {
                        event.currentTarget.style.borderColor = t.cardBorder;
                        event.currentTarget.style.backgroundColor = t.cardBg;
                      }}
                    >
                      <span>
                        <span className="block font-sans text-[10px] font-bold" style={{ color: t.text }}>
                          {plan.title}
                        </span>
                        <span className="font-sans text-[8px]" style={{ color: t.muted }}>
                          Full portal access
                        </span>
                      </span>
                      <span
                        className="rounded-md px-2 py-1 font-sans text-[9px] font-bold"
                        style={{ backgroundColor: LIME, color: TEXT_NAVY }}
                      >
                        {plan.price}
                      </span>
                    </button>
                  ))}
                  <div className="min-h-0 flex-1 rounded-xl border border-dashed" style={{ borderColor: t.cardBorder }} />
                </div>
              ) : null}

              {activeNav === "profile" ? (
                <div className="flex h-full flex-col rounded-xl border p-2.5" style={{ backgroundColor: t.cardBg, borderColor: t.cardBorder }}>
                  <div className="mb-2 flex shrink-0 items-center gap-2">
                    <span className="relative flex h-8 w-8 overflow-hidden rounded-full border" style={{ borderColor: t.cardBorder }}>
                      <Image
                        src={DEMO_PROFILE.photo}
                        alt={DEMO_PROFILE.name}
                        width={64}
                        height={64}
                        className="h-full w-full object-cover"
                      />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-sans text-[10px] font-bold" style={{ color: t.text }}>
                        {DEMO_PROFILE.name}
                      </p>
                      <p className="truncate font-sans text-[8px]" style={{ color: t.muted }}>
                        {DEMO_PROFILE.role}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {[
                      ["Email", DEMO_PROFILE.email],
                      ["Clinic", DEMO_PROFILE.clinic],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="flex min-w-0 items-center justify-between gap-2 rounded-lg border px-2 py-1.5"
                        style={{ borderColor: t.cardBorder }}
                      >
                        <span className="shrink-0 font-sans text-[8px]" style={{ color: t.muted }}>
                          {label}
                        </span>
                        <span className="min-w-0 truncate text-right font-sans text-[8px] font-semibold" style={{ color: t.text }}>
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="min-h-0 flex-1" />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
