"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { HeroLogo } from "@/components/hero/HeroLogo";
import { PortalShell } from "@/components/platform/provider/PortalShell";
import { SidebarSvgIcon } from "@/components/platform/provider/sidebar-icons";
import { Button } from "@/components/ui/Button";
import { studentNav } from "@/components/platform/provider/student/studentNav";
import {
  PLAN_META,
  monthlyEquivalent,
  savingsVersusMonthly,
} from "@/components/platform/provider/student/payment/membershipPlans";
import { ApiRequestError } from "@/lib/integrate/client";
import {
  getCachedCurrentMembership,
  getCachedPlans,
  getCurrentMembership,
  listPlans,
  purchasePlan,
  type Membership,
  type Plan,
  type PlanType,
} from "@/lib/integrate/provider/student/payment/api";
import { formatMoney, planLabels } from "@/lib/integrate/provider/student/payment/types";
import { bookWebinar, getWebinar } from "@/lib/integrate/provider/student/webinars/api";
import {
  formatWebinarWhen,
  type WebinarSummary,
} from "@/lib/integrate/provider/student/webinars/types";
import { cn } from "@/lib/utils";

const PLAN_TYPES: PlanType[] = ["monthly", "biannual", "annual"];

type CheckoutStep = "payment" | "review" | "done";

type CardForm = {
  card_holder_name: string;
  card_number: string;
  exp_month: string;
  exp_year: string;
  cvc: string;
};

type FieldErrors = Partial<Record<keyof CardForm, string>>;

const EMPTY_CARD: CardForm = {
  card_holder_name: "",
  card_number: "",
  exp_month: "",
  exp_year: "",
  cvc: "",
};

const STEPS: Array<{ id: CheckoutStep; label: string; number: number }> = [
  { id: "payment", label: "Payment", number: 1 },
  { id: "review", label: "Review", number: 2 },
  { id: "done", label: "Done", number: 3 },
];

const CART_HOLD_MS = 10 * 60 * 1000;

function formatHold(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function useCheckoutHold(holdKey: string | null) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    if (!holdKey || typeof window === "undefined") return;
    const storageKey = `hols-checkout-hold:${holdKey}`;
    const stored = Number(window.sessionStorage.getItem(storageKey));
    const expiresAt = Number.isFinite(stored) && stored > Date.now() ? stored : Date.now() + CART_HOLD_MS;
    window.sessionStorage.setItem(storageKey, String(expiresAt));

    const tick = () => setRemainingMs(Math.max(0, expiresAt - Date.now()));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [holdKey]);

  return remainingMs;
}

function parsePlanType(value: string | null): PlanType | null {
  if (!value) return null;
  return PLAN_TYPES.includes(value as PlanType) ? (value as PlanType) : null;
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

const EXPIRY_YEAR_SPAN = 20;

function yearPrefixFits(prefix: string, min: number, max: number) {
  if (!prefix || prefix.length > 4) return false;
  const low = Number(prefix.padEnd(4, "0"));
  const high = Number(prefix.padEnd(4, "9"));
  return high >= min && low <= max;
}

function cardIsExpired(month: number, year: number, now = new Date()) {
  return new Date(year, month, 0) < new Date(now.getFullYear(), now.getMonth(), 1);
}

function sanitizeExpiryMonth(raw: string, yearRaw = "", now = new Date()) {
  const digits = digitsOnly(raw);
  let next = "";
  for (const digit of digits) {
    if (next.length >= 2) break;
    if (next.length === 0) {
      const value = Number(digit);
      if (value >= 2 && value <= 9) {
        if (!(yearRaw.length === 4 && cardIsExpired(value, Number(yearRaw), now))) next = `0${digit}`;
        break;
      }
      if (digit === "0" || digit === "1") next = digit;
      continue;
    }
    const month = Number(next + digit);
    if (month < 1 || month > 12) continue;
    if (yearRaw.length === 4 && cardIsExpired(month, Number(yearRaw), now)) continue;
    next += digit;
  }
  return next;
}

function sanitizeExpiryYear(raw: string, monthRaw = "", now = new Date()) {
  const min = now.getFullYear();
  const max = min + EXPIRY_YEAR_SPAN;
  let next = "";
  for (const digit of digitsOnly(raw)) {
    if (next.length >= 4) break;
    const candidate = next + digit;
    if (!yearPrefixFits(candidate, min, max)) continue;
    if (candidate.length === 4 && monthRaw.length === 2 && cardIsExpired(Number(monthRaw), Number(candidate), now)) {
      continue;
    }
    next = candidate;
  }
  return next;
}

type CardBrand = "visa" | "mastercard" | "apple" | "google";

function detectCardBrand(value: string): CardBrand | null {
  const digits = digitsOnly(value);
  if (!digits) return null;
  if (/^4/.test(digits)) return "visa";
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]\d|720))/.test(digits)) return "mastercard";
  return null;
}

function CardBrandMarks({ active }: { active: CardBrand | null }) {
  const rawId = useId().replace(/:/g, "");
  const brands: Array<{ id: CardBrand; label: string; pinned?: boolean }> = [
    { id: "visa", label: "Visa" },
    { id: "mastercard", label: "Mastercard" },
    { id: "apple", label: "Apple Pay", pinned: true },
    { id: "google", label: "Google Pay", pinned: true },
  ];

  return (
    <div className="flex max-w-full flex-wrap items-center gap-1.5" aria-label="Accepted cards">
      {brands.map((brand) => {
        const selected = active === brand.id;
        const dimmed = Boolean(active) && !selected && !brand.pinned;
        return (
          <span
            key={brand.id}
            title={brand.label}
            className={cn(
              "inline-flex overflow-hidden rounded-[5px] transition",
              selected && "shadow-[0_0_0_2px_#142644]",
              dimmed ? "opacity-40" : "opacity-100",
            )}
          >
            {brand.id === "visa" ? <VisaMark /> : null}
            {brand.id === "mastercard" ? <MastercardMark clipId={`${rawId}-mc`} /> : null}
            {brand.id === "apple" ? <ApplePayMark /> : null}
            {brand.id === "google" ? <GooglePayMark /> : null}
          </span>
        );
      })}
    </div>
  );
}

function VisaMark() {
  return (
    <svg viewBox="0 0 56 36" className="h-7 w-[2.75rem]" aria-hidden>
      <rect width="56" height="36" rx="6" fill="#1A1F71" />
      <text
        x="28"
        y="24"
        textAnchor="middle"
        fill="#fff"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="13"
        fontStyle="italic"
        fontWeight="700"
        letterSpacing="0.6"
      >
        VISA
      </text>
    </svg>
  );
}

function MastercardMark({ clipId }: { clipId: string }) {
  return (
    <svg viewBox="0 0 56 36" className="h-7 w-[2.75rem]" aria-hidden>
      <rect width="56" height="36" rx="6" fill="#1A1A1A" />
      <circle cx="23" cy="18" r="8" fill="#EB001B" />
      <circle cx="33" cy="18" r="8" fill="#F79E1B" />
      <clipPath id={clipId}>
        <circle cx="23" cy="18" r="8" />
      </clipPath>
      <circle cx="33" cy="18" r="8" fill="#FF5F00" clipPath={`url(#${clipId})`} />
    </svg>
  );
}

function ApplePayMark() {
  return (
    <svg viewBox="0 0 72 36" className="h-7 w-[3.55rem]" aria-hidden>
      <rect width="72" height="36" rx="6" fill="#000" />
      <g transform="translate(8 7) scale(0.92)">
        <path
          fill="#fff"
          d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .76-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
        />
      </g>
      <text
        x="48"
        y="23"
        textAnchor="middle"
        fill="#fff"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="12"
        fontWeight="600"
      >
        Pay
      </text>
    </svg>
  );
}

function GooglePayMark() {
  return (
    <svg viewBox="0 0 78 36" className="h-7 w-[3.85rem]" aria-hidden>
      <rect width="78" height="36" rx="6" fill="#000" />
      <g transform="translate(8 9) scale(0.75)">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </g>
      <text
        x="50"
        y="23"
        textAnchor="middle"
        fill="#fff"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="12"
        fontWeight="600"
      >
        Pay
      </text>
    </svg>
  );
}

function SuccessTick() {
  return (
    <span className="checkout-tick mx-auto flex h-16 w-16 items-center justify-center" aria-hidden>
      <svg viewBox="0 0 52 52" className="h-16 w-16">
        <circle className="checkout-tick-circle" cx="26" cy="26" r="24" />
        <path className="checkout-tick-check" fill="none" d="M14.5 27.2l7.2 7.2 15.8-16" />
      </svg>
      <style>{`
        .checkout-tick-circle {
          fill: #142644;
          transform-origin: 26px 26px;
          transform: scale(0.6);
          opacity: 0;
          animation: checkout-tick-pop 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }
        .checkout-tick-check {
          stroke: #ffffff;
          stroke-width: 3.2;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dasharray: 36;
          stroke-dashoffset: 36;
          animation: checkout-tick-draw 0.35s 0.32s ease forwards;
        }
        @keyframes checkout-tick-pop {
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes checkout-tick-draw {
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </span>
  );
}

function formatCardNumber(value: string) {
  const digits = digitsOnly(value).slice(0, 19);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function maskCardNumber(value: string) {
  const digits = digitsOnly(value);
  if (digits.length < 4) return "••••";
  return `•••• •••• •••• ${digits.slice(-4)}`;
}


function validateCard(form: CardForm): FieldErrors {
  const errors: FieldErrors = {};
  const number = digitsOnly(form.card_number);
  const month = Number(form.exp_month);
  const year = Number(form.exp_year);
  const cvc = digitsOnly(form.cvc);

  if (!form.card_holder_name.trim()) errors.card_holder_name = "Enter the name on the card.";
  if (number.length < 12 || number.length > 19) errors.card_number = "Enter a valid card number.";
  if (!Number.isInteger(month) || month < 1 || month > 12) errors.exp_month = "Invalid month.";
  if (!Number.isInteger(year) || year < new Date().getFullYear() || year > 2100) {
    errors.exp_year = "Invalid year.";
  }
  if (cvc.length < 3 || cvc.length > 4) errors.cvc = "Enter a valid CVC.";

  if (!errors.exp_month && !errors.exp_year) {
    const now = new Date();
    const exp = new Date(year, month, 0);
    if (exp < new Date(now.getFullYear(), now.getMonth(), 1)) {
      errors.exp_month = "Card is expired.";
    }
  }

  return errors;
}

function CheckoutField({
  id,
  label,
  value,
  onChange,
  placeholder,
  error,
  inputMode,
  autoComplete,
  maxLength,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  maxLength?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid min-w-0 gap-2", className)}>
      <label htmlFor={id} className="dashboard-field-label">
        {label}
      </label>
      <input
        id={id}
        name={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        maxLength={maxLength}
        className={cn("dashboard-field min-w-0 max-w-full", error && "border-red-400")}
      />
      {error ? <p className="text-brand-caption text-red-600">{error}</p> : null}
    </div>
  );
}

const checkoutHeaderClass =
  "checkout-topbar fixed inset-x-0 top-0 z-30 bg-white px-3 pb-2.5 pt-[max(0.85rem,calc(env(safe-area-inset-top)+0.65rem))] sm:px-4 sm:pb-3.5 md:px-6 lg:static lg:inset-auto lg:z-10 lg:-mx-8 lg:mb-6 lg:px-8";

const checkoutHeaderGridClass =
  "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 sm:gap-y-3";

function CheckoutHeader({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [height, setHeight] = useState(96);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setHeight(Math.ceil(el.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <header ref={ref} className={checkoutHeaderClass}>
        {children}
      </header>
      <div className="mb-5 lg:hidden" style={{ height }} aria-hidden />
    </>
  );
}

function CheckoutFieldSkeleton() {
  return (
    <div className="grid min-w-0 gap-2" aria-hidden>
      <span className="dashboard-skeleton-block h-3 w-24 rounded-md" />
      <span className="dashboard-skeleton-block h-10 w-full rounded-xl" />
    </div>
  );
}

function CheckoutPageSkeleton() {
  return (
    <div aria-hidden>
      <CheckoutHeader>
        <div className={checkoutHeaderGridClass}>
          <div className="col-start-1 row-start-1 justify-self-start">
            <span className="dashboard-skeleton-block h-8 w-[7.25rem] rounded-md sm:h-9" />
          </div>
          <div className="col-span-3 col-start-1 row-start-2 flex items-center justify-center gap-2 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:gap-3">
            {[0, 1, 2].map((index) => (
              <span key={index} className="flex items-center gap-2 sm:gap-3">
                {index > 0 ? (
                  <span className="hidden sm:block">
                    <span className="dashboard-skeleton-block h-px w-6 rounded-full sm:w-10" />
                  </span>
                ) : null}
                <span className="dashboard-skeleton-block h-7 w-7 rounded-full" />
                <span className="dashboard-skeleton-block h-3 w-12 rounded-md sm:w-14" />
              </span>
            ))}
          </div>
          <div className="col-start-3 row-start-1 justify-self-end">
            <span className="dashboard-skeleton-block h-4 w-12 rounded-md" />
          </div>
        </div>
      </CheckoutHeader>

      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-4 flex flex-col items-center gap-2 sm:mb-5">
          <span className="dashboard-skeleton-block h-6 w-48 max-w-full rounded-md sm:h-8 sm:w-56" />
          <span className="dashboard-skeleton-block h-4 w-36 max-w-full rounded-md" />
        </div>
        <div className="grid min-w-0 items-start gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,22rem)]">
          <section className="dashboard-glass-card rounded-2xl p-4 sm:p-5 md:p-6">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="grid min-w-0 flex-1 gap-2">
                <span className="dashboard-skeleton-block h-5 w-44 max-w-full rounded-md" />
                <span className="dashboard-skeleton-block h-4 w-full max-w-md rounded-md" />
                <span className="sm:hidden">
                  <span className="dashboard-skeleton-block h-4 w-4/5 max-w-sm rounded-md" />
                </span>
              </div>
              <span className="dashboard-skeleton-block h-10 w-[7.5rem] rounded-lg" />
            </div>
            <div className="mt-5 grid gap-3 sm:gap-4">
              <CheckoutFieldSkeleton />
              <CheckoutFieldSkeleton />
              <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
                <CheckoutFieldSkeleton />
                <CheckoutFieldSkeleton />
                <CheckoutFieldSkeleton />
              </div>
            </div>
          </section>
          <aside className="dashboard-glass-card min-w-0 rounded-2xl p-4 sm:p-5 md:p-6">
            <div className="flex items-center justify-between gap-2">
              <span className="dashboard-skeleton-block h-5 w-24 rounded-md" />
              <span className="dashboard-skeleton-block h-6 w-28 rounded-full" />
            </div>
            <div className="mt-4 flex gap-3 border-b border-[color:var(--dash-surface-border)] pb-4">
              <span className="dashboard-skeleton-block h-12 w-12 shrink-0 rounded-xl" />
              <div className="grid min-w-0 flex-1 gap-2">
                <span className="dashboard-skeleton-block h-4 w-36 max-w-full rounded-md" />
                <span className="dashboard-skeleton-block h-3.5 w-28 max-w-full rounded-md" />
              </div>
              <span className="dashboard-skeleton-block h-4 w-14 shrink-0 rounded-md" />
            </div>
            <div className="mt-4 grid gap-3">
              <span className="dashboard-skeleton-block h-4 w-full rounded-md" />
              <span className="dashboard-skeleton-block h-4 w-full rounded-md" />
              <span className="dashboard-skeleton-block h-5 w-full rounded-md" />
            </div>
            <span className="dashboard-skeleton-block mt-5 h-10 w-full rounded-full" />
          </aside>
        </div>
      </div>
    </div>
  );
}

function CheckoutStepper({ step }: { step: CheckoutStep }) {
  const activeIndex = STEPS.findIndex((item) => item.id === step);

  return (
    <nav aria-label="Checkout steps" className="flex w-full min-w-0 max-w-full flex-wrap items-center justify-center gap-x-1.5 gap-y-1.5 sm:gap-3">
      {STEPS.map((item, index) => {
        const active = index === activeIndex;
        const complete = index < activeIndex;
        return (
          <div key={item.id} className="flex items-center gap-2 sm:gap-3">
            {index > 0 ? (
              <span
                className={cn(
                  "hidden h-px w-6 sm:block sm:w-10",
                  complete || active
                    ? "bg-[color:var(--dash-navy)]"
                    : "bg-[color:var(--dash-surface-border)]",
                )}
                aria-hidden
              />
            ) : null}
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "font-sans flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                  active || complete
                    ? "bg-[color:var(--dash-navy)] text-white"
                    : "border border-[color:var(--dash-surface-border)] bg-white text-[color:var(--dash-faint)]",
                )}
              >
                {complete ? <SidebarSvgIcon name="check" size={12} strokeWidth={2.6} /> : item.number}
              </span>
              <span
                className={cn(
                  "font-sans max-w-[4.25rem] truncate text-[11px] font-semibold min-[400px]:max-w-none sm:text-sm",
                  active || complete
                    ? "text-[color:var(--dash-text)]"
                    : "text-[color:var(--dash-faint)]",
                )}
              >
                {item.label}
              </span>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

export function StudentPlanCheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planType = parsePlanType(searchParams.get("plan"));
  const webinarId = searchParams.get("webinar");
  const fromLectures = searchParams.get("from") === "lectures";
  const plansHome = fromLectures ? "/student/lectures" : "/student/plans";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [step, setStep] = useState<CheckoutStep>("payment");
  const [card, setCard] = useState<CardForm>(EMPTY_CARD);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [orderId, setOrderId] = useState<string | null>(null);
  const [webinar, setWebinar] = useState<WebinarSummary | null>(null);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const [membershipRes, plansRes] = await Promise.all([
        getCurrentMembership(signal),
        listPlans(signal),
      ]);
      if (signal?.aborted) return;
      setMembership(membershipRes.membership);
      setPlans(plansRes.items);
    } catch (err) {
      if (signal?.aborted) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof ApiRequestError ? err.message : "Failed to load checkout.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (webinarId) return;
    if (!planType) {
      router.replace(plansHome);
      return;
    }

    const controller = new AbortController();
    const cachedMembership = getCachedCurrentMembership();
    const cachedPlans = getCachedPlans();
    if (cachedMembership !== undefined && cachedPlans !== undefined) {
      setMembership(cachedMembership ?? null);
      setPlans(cachedPlans ?? []);
      setLoading(false);
    }

    const timer = window.setTimeout(() => void loadData(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadData, planType, router, webinarId]);

  useEffect(() => {
    if (!webinarId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getWebinar(webinarId)
      .then((data) => {
        if (cancelled) return;
        if (data.webinar.price <= 0 || data.webinar.is_booked) {
          router.replace(`/student/webinars/${encodeURIComponent(webinarId)}`);
          return;
        }
        setWebinar(data.webinar);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiRequestError ? err.message : "Failed to load checkout.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router, webinarId]);

  const plan = useMemo(
    () => plans.find((item) => item.plan_type === planType) ?? null,
    [plans, planType],
  );
  const monthly = useMemo(
    () => plans.find((item) => item.plan_type === "monthly") ?? null,
    [plans],
  );
  const meta = planType ? PLAN_META[planType] : null;
  const current = Boolean(plan && membership?.plan_type === plan.plan_type);
  const switching = Boolean(membership && plan && membership.plan_type !== plan.plan_type);
  const savings = plan ? savingsVersusMonthly(plan, monthly) : null;
  const perMonth = plan ? monthlyEquivalent(plan) : null;
  const priceLabel = webinar
    ? formatMoney(webinar.price, webinar.currency || "USD")
    : plan
      ? formatMoney(plan.price, plan.currency || "USD")
      : "—";
  const checkoutCurrency = webinar?.currency || plan?.currency || "USD";
  const cancelHref = webinarId
    ? `/student/webinars/${encodeURIComponent(webinarId)}`
    : plansHome;
  const holdKey = webinarId ? `webinar:${webinarId}` : planType ? `plan:${planType}` : null;
  const holdRemaining = useCheckoutHold(step === "done" ? null : holdKey);
  const holdExpired = holdRemaining === 0;

  const stepTitle =
    step === "payment"
      ? "Checkout: Payment"
      : step === "review"
        ? "Checkout: Review"
        : "Checkout: Done";

  function goToReview() {
    if (holdExpired) return;
    if (webinar) {
      if (webinar.is_booked || webinar.price <= 0) return;
    } else if (!plan || current) {
      return;
    }
    const nextErrors = validateCard(card);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setError("Check your card details and try again.");
      return;
    }
    setError(null);
    setStep("review");
  }

  async function confirmPurchase() {
    if (purchasing || holdExpired) return;
    if (webinar) {
      if (webinar.is_booked || webinar.price <= 0) return;
      setError(null);
      setPurchasing(true);
      try {
        const result = await bookWebinar(webinar.webinar_id);
        setWebinar(result.webinar);
        setOrderId(result.registration.order_id ?? null);
        setStep("done");
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Purchase failed.");
      } finally {
        setPurchasing(false);
      }
      return;
    }
    if (!plan || current) return;
    setError(null);
    setPurchasing(true);
    try {
      const result = await purchasePlan(plan.plan_type);
      setMembership(result.membership ?? null);
      setOrderId(result.order?.order_id ?? null);
      setStep("done");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Purchase failed.");
    } finally {
      setPurchasing(false);
    }
  }

  return (
    <PortalShell
      role="student"
      title="Checkout"
      showPageHeader={false}
      contentFlush
      brandBackdrop
      hideSidebar
      nav={studentNav}
    >
      <div className="dashboard-screen lectures-page payment-page checkout-page min-h-[calc(100svh-1rem)] min-w-0 text-[color:var(--dash-text)]">
        {loading && !plan && !webinar ? (
          <CheckoutPageSkeleton />
        ) : (
        <>
        <CheckoutHeader>
          <div className={checkoutHeaderGridClass}>
            <div className="col-start-1 row-start-1 justify-self-start">
              <HeroLogo variant="dark" linked={false} className="h-8 sm:h-9" />
            </div>
            <div className="col-span-3 col-start-1 row-start-2 justify-self-center sm:col-span-1 sm:col-start-2 sm:row-start-1">
              <CheckoutStepper step={step} />
            </div>
            <div className="col-start-3 row-start-1 justify-self-end">
              {step === "done" ? (
                <Link
                  href="/student"
                  className="font-sans text-sm font-semibold text-[color:var(--dash-muted)] transition hover:text-[color:var(--dash-text)]"
                >
                  Close
                </Link>
              ) : (
                <Link
                  href={cancelHref}
                  className="font-sans text-sm font-semibold text-[color:var(--dash-muted)] transition hover:text-[color:var(--dash-text)]"
                >
                  Cancel
                </Link>
              )}
            </div>
          </div>
        </CheckoutHeader>

        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-4 text-center sm:mb-5">
            <h1 className="font-sans text-lg font-bold tracking-[0.01em] text-[color:var(--dash-text)] sm:text-2xl">
              {stepTitle}
            </h1>
            <p className="text-brand-body mt-1 text-sm text-[color:var(--dash-muted)]">
              {webinar
                ? webinar.title
                : planType
                  ? `${planLabels[planType]} membership`
                  : "Membership checkout"}
            </p>
          </div>

        {error ? (
          <div className="mb-4">
            <AuthAlert variant="error">{error}</AuthAlert>
          </div>
        ) : null}

        {webinarId && !webinar ? (
          <div className="dashboard-glass-card rounded-2xl px-5 py-16 text-center">
            <p className="font-sans text-base font-semibold text-[color:var(--dash-text)]">
              Webinar not found
            </p>
            <Link
              href="/student/webinars"
              className="text-brand-caption mt-3 inline-flex font-semibold text-[color:var(--dash-navy)]"
            >
              Back to webinars
            </Link>
          </div>
        ) : !webinar && (!plan || !meta) ? (
          <div className="dashboard-glass-card rounded-2xl px-5 py-16 text-center">
            <p className="font-sans text-base font-semibold text-[color:var(--dash-text)]">
              Plan not found
            </p>
            <Link
              href={plansHome}
              className="text-brand-caption mt-3 inline-flex font-semibold text-[color:var(--dash-navy)]"
            >
              {fromLectures ? "Back to lectures" : "Back to plans"}
            </Link>
          </div>
        ) : step === "done" ? (
          <div className="dashboard-glass-card mx-auto max-w-xl rounded-2xl px-5 py-10 text-center sm:px-8">
            <SuccessTick />
            <h2 className="font-sans mt-5 text-base font-semibold tracking-[0.005em] text-[color:var(--dash-text)] sm:text-lg">
              Payment successful
            </h2>
            <p className="text-brand-body mt-2 break-words text-sm leading-6 text-[color:var(--dash-muted)]">
              {webinar
                ? `Your seat for ${webinar.title} is booked`
                : plan
                  ? `Your ${planLabels[plan.plan_type]} membership is active`
                  : "Your purchase is complete"}
              {orderId ? ` · Order ${orderId.slice(0, 8)}` : ""}.
            </p>
            {webinar ? (
              <p className="font-sans mt-4 text-sm font-semibold text-[color:var(--dash-text)]">
                Where would you like to go?
              </p>
            ) : null}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
              {webinar ? (
                <Button
                  href={`/student/webinars/${encodeURIComponent(webinar.webinar_id)}`}
                  className="lecture-page-action h-10 min-h-10 w-full py-0 text-sm sm:w-auto"
                >
                  View this webinar
                </Button>
              ) : (
                <Button
                  href="/student/lectures"
                  className="lecture-page-action h-10 min-h-10 w-full py-0 text-sm sm:w-auto"
                >
                  Open lectures
                </Button>
              )}
              <Link
                href="/student"
                className="checkout-navy-static lecture-page-action dashboard-navy-btn font-sans inline-flex h-10 min-h-10 w-full items-center justify-center rounded-full px-5 text-sm font-medium tracking-[0.01em] text-white sm:w-auto"
              >
                Go to dashboard
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid min-w-0 items-start gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,22rem)]">
            <section className="dashboard-glass-card rounded-2xl p-4 sm:p-5 md:p-6">
              {step === "payment" ? (
                <>
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h2 className="font-sans text-base font-semibold tracking-[0.005em] text-[color:var(--dash-text)] sm:text-lg">
                        Payment information
                      </h2>
                      <p className="text-brand-body mt-1 text-sm leading-6 text-[color:var(--dash-muted)]">
                        Enter your card details. They are used for this purchase only and are not saved.
                      </p>
                    </div>
                    <CardBrandMarks active={detectCardBrand(card.card_number)} />
                  </div>

                  <div className="mt-5 grid gap-3 sm:gap-4">
                    <CheckoutField
                      id="card_holder_name"
                      label="Name on card"
                      value={card.card_holder_name}
                      onChange={(value) => {
                        setCard((prev) => ({ ...prev, card_holder_name: value }));
                        setFieldErrors((prev) => ({ ...prev, card_holder_name: undefined }));
                      }}
                      placeholder="Full name"
                      autoComplete="cc-name"
                      error={fieldErrors.card_holder_name}
                    />
                    <CheckoutField
                      id="card_number"
                      label="Card number"
                      value={card.card_number}
                      onChange={(value) => {
                        setCard((prev) => ({ ...prev, card_number: formatCardNumber(value) }));
                        setFieldErrors((prev) => ({ ...prev, card_number: undefined }));
                      }}
                      placeholder="ACCT-000003"
                      inputMode="numeric"
                      autoComplete="cc-number"
                      maxLength={23}
                      error={fieldErrors.card_number}
                    />
                    <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
                      <CheckoutField
                        id="exp_month"
                        label="Month"
                        value={card.exp_month}
                        onChange={(value) => {
                          setCard((prev) => ({
                            ...prev,
                            exp_month: sanitizeExpiryMonth(value, prev.exp_year),
                          }));
                          setFieldErrors((prev) => ({ ...prev, exp_month: undefined }));
                        }}
                        placeholder="MM"
                        inputMode="numeric"
                        autoComplete="cc-exp-month"
                        maxLength={2}
                        error={fieldErrors.exp_month}
                      />
                      <CheckoutField
                        id="exp_year"
                        label="Year"
                        value={card.exp_year}
                        onChange={(value) => {
                          setCard((prev) => ({
                            ...prev,
                            exp_year: sanitizeExpiryYear(value, prev.exp_month),
                          }));
                          setFieldErrors((prev) => ({ ...prev, exp_year: undefined }));
                        }}
                        placeholder="YYYY"
                        inputMode="numeric"
                        autoComplete="cc-exp-year"
                        maxLength={4}
                        error={fieldErrors.exp_year}
                      />
                      <CheckoutField
                        id="cvc"
                        label="CVC"
                        value={card.cvc}
                        onChange={(value) => {
                          setCard((prev) => ({ ...prev, cvc: digitsOnly(value).slice(0, 4) }));
                          setFieldErrors((prev) => ({ ...prev, cvc: undefined }));
                        }}
                        placeholder="123"
                        inputMode="numeric"
                        autoComplete="cc-csc"
                        maxLength={4}
                        error={fieldErrors.cvc}
                      />
                    </div>
                  </div>
                </>
              ) : null}

              {step === "review" ? (
                <>
                  <h2 className="font-sans text-base font-semibold tracking-[0.005em] text-[color:var(--dash-text)] sm:text-lg">
                    Review order
                  </h2>
                  <p className="text-brand-body mt-1 text-sm leading-6 text-[color:var(--dash-muted)]">
                    {webinar
                      ? "Confirm this webinar and your payment details before booking."
                      : "Confirm your plan and payment details before completing purchase."}
                  </p>

                  <div className="mt-5 grid gap-2.5">
                    {webinar ? (
                      <ReviewBlock
                        label="Webinar"
                        value={webinar.title}
                        detail={formatWebinarWhen(webinar.starts_at)}
                      />
                    ) : plan && meta ? (
                      <ReviewBlock
                        label="Membership"
                        value={planLabels[plan.plan_type]}
                        detail={
                          plan.duration_days
                            ? `${plan.duration_days} days · ${meta.period}`
                            : meta.period
                        }
                      />
                    ) : null}
                    <ReviewBlock
                      label="Payment method"
                      value={maskCardNumber(card.card_number)}
                      detail={
                        card.card_holder_name.trim() ||
                        `Expires ${card.exp_month}/${card.exp_year}`
                      }
                    />
                    {switching && membership && plan ? (
                      <ReviewBlock
                        label="Plan change"
                        value={`Switch from ${planLabels[membership.plan_type]}`}
                        detail={`To ${planLabels[plan.plan_type]}`}
                      />
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => setStep("payment")}
                    className="mt-4 inline-flex text-sm font-semibold text-[color:var(--dash-navy)] hover:underline"
                  >
                    Edit payment details
                  </button>
                </>
              ) : null}
            </section>

            <aside className="dashboard-glass-card min-w-0 rounded-2xl p-4 sm:p-5 md:p-6">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <h2 className="font-sans text-base font-semibold tracking-[0.005em] text-[color:var(--dash-text)] sm:text-lg">
                  Summary
                </h2>
                {holdRemaining != null ? (
                  <p
                    className={cn(
                      "font-sans inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
                      holdExpired
                        ? "bg-red-50 text-red-700"
                        : "bg-[color:var(--dash-soft)] text-[color:var(--dash-text)]",
                    )}
                  >
                    {holdExpired ? "Hold ended" : `Cart hold ${formatHold(holdRemaining)}`}
                  </p>
                ) : null}
              </div>

              <div className="mt-4 flex min-w-0 gap-3 border-b border-[color:var(--dash-surface-border)] pb-4">
                <span className="dashboard-tool-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-xl">
                  <SidebarSvgIcon name={webinar ? "webinars" : meta?.icon ?? "plans"} size={20} strokeWidth={1.85} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-col gap-1 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between min-[420px]:gap-3">
                    <p className="font-sans min-w-0 break-words text-sm font-semibold leading-snug text-[color:var(--dash-text)]">
                      {webinar ? webinar.title : plan ? `${planLabels[plan.plan_type]} membership` : "Checkout"}
                    </p>
                    <p className="font-sans shrink-0 text-sm font-semibold tabular-nums text-[color:var(--dash-text)]">
                      {priceLabel}
                    </p>
                  </div>
                  <p className="mt-1 break-words font-sans text-sm font-normal leading-5 text-[color:var(--dash-muted)]">
                    {webinar
                      ? formatWebinarWhen(webinar.starts_at)
                      : plan
                        ? `${plan.duration_days ? `${plan.duration_days} days` : meta?.period ?? ""}${
                            perMonth ? ` · ${formatMoney(perMonth, plan.currency || "USD")}/mo` : ""
                          }`
                        : ""}
                  </p>
                </div>
              </div>

              <dl className="mt-4 space-y-2.5 text-sm">
                <SummaryLine label="Order subtotal" value={priceLabel} />
                {savings ? (
                  <SummaryLine label="Savings vs monthly" value={`${savings.percent}%`} muted />
                ) : null}
                <SummaryLine label="Tax" value={formatMoney(0, checkoutCurrency)} muted />
              </dl>

              <div className="mt-4 flex items-center justify-between border-t border-[color:var(--dash-surface-border)] pt-4">
                <p className="font-sans text-sm font-semibold text-[color:var(--dash-text)] sm:text-base">
                  Order total
                </p>
                <p className="font-sans text-base font-bold tabular-nums tracking-[0.01em] text-[color:var(--dash-text)] sm:text-lg">
                  {priceLabel}
                </p>
              </div>

              {holdExpired ? (
                <p className="text-brand-caption mt-4 text-center text-red-700">
                  This cart hold has ended. Go back and start checkout again.
                </p>
              ) : null}

              {step === "payment" ? (
                current ? (
                  <p className="lecture-page-action dashboard-pill-soft mt-5 inline-flex h-10 min-h-10 w-full items-center justify-center rounded-full px-4 text-center text-sm font-medium text-[color:var(--dash-muted)]">
                    This is your current plan
                  </p>
                ) : (
                  <Button
                    type="button"
                    className="lecture-page-action mt-5 h-10 min-h-10 w-full py-0 text-sm"
                    disabled={holdExpired}
                    onClick={goToReview}
                  >
                    Next: Review order
                  </Button>
                )
              ) : null}

              {step === "review" ? (
                <Button
                  type="button"
                  className="lecture-page-action mt-5 h-10 min-h-10 w-full py-0 text-sm"
                  disabled={purchasing || holdExpired}
                  onClick={() => void confirmPurchase()}
                >
                  {purchasing ? "Processing…" : `Pay ${priceLabel}`}
                </Button>
              ) : null}

              <p className="text-brand-caption mt-3 flex items-center justify-center gap-1.5 font-medium text-[color:var(--dash-faint)]">
                <SidebarSvgIcon name="lock" size={12} strokeWidth={2} />
                Secure checkout
              </p>
            </aside>
          </div>
        )}
        </div>
        </>
        )}
      </div>
    </PortalShell>
  );
}

function ReviewBlock({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--dash-surface-border)] bg-[color:var(--dash-soft)] px-3.5 py-2.5">
      <p className="font-sans text-sm font-normal leading-5 text-[color:var(--dash-muted)]">{label}</p>
      <p className="font-sans mt-0.5 truncate text-sm font-semibold leading-5 text-[color:var(--dash-text)]">
        {value}
      </p>
      {detail ? (
        <p className="mt-0.5 font-sans text-sm font-normal leading-5 text-[color:var(--dash-faint)]">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

function SummaryLine({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt
        className={cn(
          "font-sans text-sm font-normal leading-5 text-[color:var(--dash-muted)]",
          muted && "text-[color:var(--dash-faint)]",
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          "font-sans text-sm font-semibold tabular-nums leading-5 text-[color:var(--dash-text)]",
          muted && "text-[color:var(--dash-faint)]",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
