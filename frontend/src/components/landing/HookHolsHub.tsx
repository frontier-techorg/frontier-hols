import Image from "next/image";
import { landingContent } from "@/content/landing";

export function HookHolsHub() {
  const { hook } = landingContent;

  return (
    <div
      data-hook-hub
      className="relative z-10 flex shrink-0 flex-col items-center justify-center bg-white px-2 sm:px-3 md:px-4"
      aria-hidden
    >
      <div
        data-hook-hub-logo
        className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary sm:h-[4.5rem] sm:w-[4.5rem] md:h-20 md:w-20"
      >
        <Image
          src="https://frontiercms.s3.us-east-1.amazonaws.com/hols_logo_mark_light_cc15f5809e.png"
          alt=""
          width={56}
          height={56}
          className="h-9 w-9 object-contain sm:h-10 sm:w-10 md:h-11 md:w-11"
        />
      </div>

      <p className="mt-3 font-sans text-base font-bold tracking-[0.04em] text-primary sm:text-lg md:text-xl">
        HOLS
      </p>
      <p
        data-hook-after-label
        className="mt-0.5 max-w-[9rem] text-center font-sans text-xs font-medium italic leading-snug text-primary/55 sm:text-sm md:max-w-none"
      >
        {hook.afterLabel}
      </p>
    </div>
  );
}
