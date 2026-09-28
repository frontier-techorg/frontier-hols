"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon, Eye, EyeOff } from "@/components/icons";
import { AuthAlert } from "@/components/platform/auth/AuthAlert";
import { AuthButton } from "@/components/platform/auth/AuthButton";
import { AuthField } from "@/components/platform/auth/AuthField";
import {
  authFieldClass,
  authFooterTextClass,
  authHelperTextClass,
  authIconButtonClass,
  authLabelClass,
  authLinkClass,
} from "@/components/platform/auth/auth-styles";
import { ApiRequestError } from "@/lib/integrate/client";
import {
  isOtpRequired,
  login,
  resendOtp,
  verifyOtp,
  type UserRole,
} from "@/lib/integrate/auth";
import { getPortalPath } from "@/lib/integrate/auth/routes";
import { enterPortal } from "@/lib/integrate/auth/session";
import { cn } from "@/lib/utils";

const RESEND_COOLDOWN_SEC = 30;
const OTP_LENGTH = 6;

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

type LoginFormProps = {
  className?: string;
  role?: UserRole;
  initialMessage?: string;
  onOtpStepChange?: (active: boolean) => void;
};

export function LoginForm({
  className,
  role = "student",
  initialMessage,
  onOtpStepChange,
}: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(initialMessage ?? null);
  const [loading, setLoading] = useState(false);

  const [otpStep, setOtpStep] = useState(false);
  const [otpToken, setOtpToken] = useState("");
  const [otpDigits, setOtpDigits] = useState<string[]>(() => Array.from({ length: OTP_LENGTH }, () => ""));
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const otpCode = otpDigits.join("");
  const otpComplete = otpDigits.every((digit) => digit.length === 1);
  const [resendLoading, setResendLoading] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);

  function focusOtpBox(index: number) {
    const box = otpRefs.current[index];
    box?.focus();
    box?.select();
  }

  function enterOtpStep(token: string, _message: string, expiresIn: number) {
    setOtpToken(token);
    setOtpDigits(Array.from({ length: OTP_LENGTH }, () => ""));
    setOtpStep(true);
    onOtpStepChange?.(true);
    const safeExpires = Math.max(1, expiresIn || 300);
    setExpiresAt(Date.now() + safeExpires * 1000);
    setSecondsLeft(safeExpires);
    setResendCooldown(Math.min(RESEND_COOLDOWN_SEC, safeExpires));
  }

  function leaveOtpStep() {
    setOtpStep(false);
    setOtpDigits(Array.from({ length: OTP_LENGTH }, () => ""));
    setError(null);
    setInfo(null);
    setExpiresAt(null);
    setSecondsLeft(0);
    setResendCooldown(0);
    onOtpStepChange?.(false);
  }

  useEffect(() => {
    if (!otpStep || expiresAt == null) return;
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [otpStep, expiresAt]);

  useEffect(() => {
    if (!otpStep) return;
    const id = window.setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [otpStep]);

  const passwordToggle = (
    <button
      type="button"
      onClick={() => setShowPassword((open) => !open)}
      className={authIconButtonClass}
      aria-label={showPassword ? "Hide password" : "Show password"}
    >
      {showPassword ? (
        <Icon icon={EyeOff} size={16} />
      ) : (
        <Icon icon={Eye} size={16} />
      )}
    </button>
  );

  async function completeLogin(result: {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    user_id: string;
    role: UserRole;
    profile: Record<string, unknown>;
  }) {
    enterPortal(result);
    router.replace(getPortalPath(result.role));
    router.refresh();
  }

  async function handleLoginSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      const result = await login({ email, password, role });

      if (isOtpRequired(result)) {
        enterOtpStep(result.otp_token, result.message, result.expires_in);
        return;
      }

      await completeLogin(result);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Unable to log in. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleOtpSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await verifyOtp(otpToken, otpCode);
      await completeLogin(result);
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Invalid verification code. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    if (resendCooldown > 0) return;
    setError(null);
    setResendLoading(true);

    try {
      const result = await resendOtp(otpToken);
      setOtpToken(result.otp_token);
      setOtpDigits(Array.from({ length: OTP_LENGTH }, () => ""));
      setInfo("A new code was sent to your email.");
      window.setTimeout(() => focusOtpBox(0), 0);
      const safeExpires = Math.max(1, result.expires_in || 300);
      setExpiresAt(Date.now() + safeExpires * 1000);
      setSecondsLeft(safeExpires);
      setResendCooldown(Math.min(RESEND_COOLDOWN_SEC, safeExpires));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not resend code.");
    } finally {
      setResendLoading(false);
    }
  }

  function applyOtpDigits(index: number, raw: string) {
    const clean = raw.replace(/\D/g, "");
    if (!clean) return;

    setOtpDigits((current) => {
      const next = [...current];
      for (let offset = 0; offset < clean.length && index + offset < OTP_LENGTH; offset += 1) {
        next[index + offset] = clean[offset];
      }
      return next;
    });
    focusOtpBox(Math.min(index + clean.length, OTP_LENGTH - 1));
  }

  function clearOtpDigit(index: number) {
    setOtpDigits((current) => {
      const next = [...current];
      next[index] = "";
      return next;
    });
  }

  function handleOtpKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      if (otpDigits[index]) {
        clearOtpDigit(index);
        return;
      }
      if (event.key === "Backspace" && index > 0) {
        clearOtpDigit(index - 1);
        focusOtpBox(index - 1);
      }
      return;
    }

    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      focusOtpBox(index - 1);
    }

    if (event.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      event.preventDefault();
      focusOtpBox(index + 1);
    }
  }

  if (otpStep) {
    const expired = secondsLeft <= 0;

    return (
      <form className={cn("w-full", className)} onSubmit={handleOtpSubmit}>
        <div className="grid gap-5">
          {info ? <AuthAlert variant="info">{info}</AuthAlert> : null}
          {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}
          {expired ? (
            <AuthAlert variant="error">This code has expired. Please resend a new one.</AuthAlert>
          ) : (
            <p className={cn(authHelperTextClass, "text-center text-sm tabular-nums text-primary/60")}>
              Code expires in {formatCountdown(secondsLeft)}
            </p>
          )}

          <div className="grid gap-2">
            <span id="otp-label" className={authLabelClass}>
              Verification code
            </span>
            <div
              className="grid grid-cols-6 gap-2 sm:gap-2.5"
              role="group"
              aria-labelledby="otp-label"
            >
              {Array.from({ length: OTP_LENGTH }, (_, index) => (
                <input
                  key={index}
                  ref={(node) => {
                    otpRefs.current[index] = node;
                  }}
                  id={index === 0 ? "otp" : undefined}
                  name={index === 0 ? "otp" : undefined}
                  type="text"
                  inputMode="numeric"
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  autoFocus={index === 0}
                  aria-label={`Digit ${index + 1}`}
                  maxLength={OTP_LENGTH}
                  value={otpDigits[index] ?? ""}
                  onChange={(event) => applyOtpDigits(index, event.target.value)}
                  onKeyDown={(event) => handleOtpKeyDown(index, event)}
                  onFocus={(event) => event.currentTarget.select()}
                  onPaste={(event) => {
                    event.preventDefault();
                    applyOtpDigits(index, event.clipboardData.getData("text"));
                  }}
                  className={cn(authFieldClass, "auth-otp-box")}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-7 grid gap-3">
          <AuthButton type="submit" disabled={loading || !otpComplete || expired}>
            {loading ? "Verifying…" : "Verify"}
          </AuthButton>
          <div className={cn("flex items-center justify-between gap-3", authHelperTextClass)}>
            <button
              type="button"
              onClick={leaveOtpStep}
              className="font-sans font-medium text-primary/70 transition hover:text-primary"
            >
              Back
            </button>
            <button
              type="button"
              disabled={resendLoading || resendCooldown > 0}
              onClick={handleResendOtp}
              className={cn(authLinkClass, "disabled:no-underline disabled:opacity-60")}
            >
              {resendLoading
                ? "Sending…"
                : resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : "Resend code"}
            </button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <form className={cn("w-full", className)} onSubmit={handleLoginSubmit}>
      <div className="grid gap-5">
        {info ? <AuthAlert variant="success">{info}</AuthAlert> : null}
        {error ? <AuthAlert variant="error">{error}</AuthAlert> : null}

        <AuthField
          id="login-email"
          label="Email address"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          autoComplete="email"
          icon="email"
          required
        />

        <AuthField
          id="login-password"
          label="Password"
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={setPassword}
          placeholder="Enter your password"
          autoComplete="current-password"
          icon="password"
          required
          trailing={passwordToggle}
        />
      </div>

      <AuthButton type="submit" disabled={loading} className="mt-7">
        {loading ? "Signing in…" : "Log in"}
      </AuthButton>

      {role === "student" ? (
        <p className={cn("mt-6", authFooterTextClass)}>
          No account?{" "}
          <Link href="/register" className={authLinkClass}>
            Sign up
          </Link>
        </p>
      ) : null}
    </form>
  );
}
