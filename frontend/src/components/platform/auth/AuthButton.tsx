"use client";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type AuthButtonProps = {
  children: React.ReactNode;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
};

/** Same yellow → navy spread hover as navbar / landing primary CTAs. */
export function AuthButton({
  children,
  type = "button",
  disabled = false,
  className,
  onClick,
  variant = "primary",
}: AuthButtonProps) {
  return (
    <Button
      type={type}
      disabled={disabled}
      onClick={onClick}
      variant={variant === "secondary" ? "secondary" : "primary"}
      className={cn("auth-submit w-full", className)}
    >
      {children}
    </Button>
  );
}
