"use client";

import Image from "next/image";
import { HeroLogo } from "@/components/hero/HeroLogo";

export function AuthCreativeAside() {
  return (
    <aside className="relative hidden min-h-0 overflow-hidden lg:block lg:h-full">
      <Image
        src="https://frontiercms.s3.us-east-1.amazonaws.com/01_clinic_owners_8b7b6e2d0d.png"
        alt=""
        fill
        priority
        sizes="50vw"
        className="object-cover object-center"
      />

      <div className="relative z-10 px-10 py-10 xl:px-14 xl:py-12">
        <a href="/" className="inline-flex w-fit transition-opacity hover:opacity-90">
          <HeroLogo variant="light" className="h-10" linked={false} />
        </a>
      </div>
    </aside>
  );
}
