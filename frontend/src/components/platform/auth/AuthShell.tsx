import { AuthCreativeAside } from "@/components/platform/auth/AuthCreativeAside";
import { authEyebrowClass, authSubtitleClass, authTitleClass } from "@/components/platform/auth/auth-styles";
import { HeroLogo } from "@/components/hero/HeroLogo";
import { heroLayout } from "@/lib/hero-styles";
import { cn } from "@/lib/utils";

type AuthShellProps = {
  children: React.ReactNode;
  eyebrow: string;
  title: string;
  subtitle?: string;
  contentWidth?: "md" | "lg";
  className?: string;
};

export function AuthShell({
  children,
  eyebrow,
  title,
  subtitle,
  contentWidth = "md",
  className,
}: AuthShellProps) {
  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-1 flex-col bg-transparent lg:grid lg:grid-cols-2",
        className,
      )}
    >
      <AuthCreativeAside />

      <section className="relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div
          className={cn(
            "flex min-h-full flex-col py-8 sm:py-10",
            heroLayout.gutterX,
            "lg:px-10 xl:px-16",
          )}
        >
          <div className="my-auto w-full">
            <header className="mb-6 lg:hidden">
              <a href="/" className="inline-flex">
                <HeroLogo variant="dark" className="h-8" linked={false} />
              </a>
            </header>

            <div
              className={cn(
                "auth-panel mx-auto w-full overflow-hidden rounded-2xl p-4 sm:p-6 md:p-8",
                contentWidth === "lg" ? "max-w-xl" : "max-w-md",
              )}
            >
              <div className="mb-6 sm:mb-8">
                <p className={authEyebrowClass}>{eyebrow}</p>
                <h1 className={cn("mt-2 sm:mt-3", authTitleClass)}>{title}</h1>
                {subtitle ? <p className={authSubtitleClass}>{subtitle}</p> : null}
              </div>
              {children}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
