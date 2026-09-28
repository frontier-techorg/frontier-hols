"use client";

import type { ReactNode } from "react";
import { Icon, Lock, Mail, User } from "@/components/icons";
import { authFieldClass, authLabelClass } from "@/components/platform/auth/auth-styles";
import { cn } from "@/lib/utils";

type AuthFieldIcon = "user" | "email" | "password";

type AuthFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
  icon?: AuthFieldIcon;
  required?: boolean;
  trailing?: ReactNode;
};

function FieldIcon({ icon }: { icon: AuthFieldIcon }) {
  if (icon === "email") return <Icon icon={Mail} size={16} />;
  if (icon === "password") return <Icon icon={Lock} size={16} />;
  return <Icon icon={User} size={16} />;
}

export function AuthField({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
  icon,
  required = false,
  trailing,
}: AuthFieldProps) {
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className={authLabelClass}>
        {label}
      </label>

      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-primary/35">
            <FieldIcon icon={icon} />
          </span>
        ) : null}

        <input
          id={id}
          name={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className={cn(
            authFieldClass,
            icon ? "auth-field--icon" : undefined,
            trailing ? "auth-field--trailing" : undefined,
          )}
        />

        {trailing}
      </div>
    </div>
  );
}
