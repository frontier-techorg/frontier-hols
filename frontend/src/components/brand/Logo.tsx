import Link from "next/link";
import { cn } from "@/lib/utils";

const logos = {
  dark: "https://frontiercms.s3.us-east-1.amazonaws.com/hols_logo_5c5a89997a.png",
  light: "https://frontiercms.s3.us-east-1.amazonaws.com/hols_logo_light_6bbeb3f758.png",
  mark: "https://frontiercms.s3.us-east-1.amazonaws.com/hols_logo_mark_ea0064edd1.png",
  markLight: "https://frontiercms.s3.us-east-1.amazonaws.com/hols_logo_mark_light_cc15f5809e.png",
} as const;

type LogoProps = {
  variant?: "dark" | "light" | "mark";
  href?: string;
  className?: string;
  compact?: boolean;
};

export function Logo({
  variant = "dark",
  href = "/",
  className,
  compact = false,
}: LogoProps) {
  const src = compact
    ? variant === "light"
      ? logos.markLight
      : logos.mark
    : logos[variant];

  const image = (
    <img
      src={src}
      alt="HOLS house of life science"
      width={compact ? 40 : 210}
      height={compact ? 40 : 39}
      className={cn(
        compact ? "h-8 w-8 object-contain" : "h-8 w-auto object-contain md:h-9",
        className,
      )}
    />
  );

  if (!href) return image;

  return (
    <Link
      href={href}
      aria-label="House of Life Sciences home"
      className="group inline-flex items-center p-0 transition-opacity hover:opacity-90"
    >
      {image}
    </Link>
  );
}
