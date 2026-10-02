"use client";

import { type CSSProperties, memo, useEffect, useId } from "react";
import { preloadLectureCoverSrcs } from "@/components/platform/provider/student/lectures/lectureCoverCache";
import { cn } from "@/lib/utils";

const MODE_LIGHT = "https://frontiercms.s3.us-east-1.amazonaws.com/light_c9ccd4a99c.png";
const MODE_DARK = "https://frontiercms.s3.us-east-1.amazonaws.com/dark_6d8ea7295f.png";

type CourseCoverProductVialProps = {
  /** Transparent product vial PNG (same art for light + dark). */
  vialSrc: string;
  /** Degrees of editorial tilt (positive = clockwise / lean right). */
  rotate?: number;
  /** Extra product scale for close framing. */
  scale?: number;
  /** CSS object-position for the vial within its stage. */
  objectPosition?: string;
  className?: string;
};

/**
 * Theme mode background (light/dark) + full-quality transparent vial overlay.
 * Vial is staged with a gentle rightward product tilt for an editorial look.
 */
function CourseCoverProductVialInner({
  vialSrc,
  rotate = 10,
  scale = 1.16,
  objectPosition = "62% 56%",
  className,
}: CourseCoverProductVialProps) {
  const reactId = useId().replace(/:/g, "");
  const defringeId = `lecture-vial-defringe-${reactId}`;
  const vialStyle = {
    "--product-vial-rotate": `${rotate}deg`,
    "--product-vial-scale": String(scale),
    "--product-vial-x": "11%",
    "--product-vial-y": "6%",
    objectPosition,
    filter: `url(#${defringeId})`,
  } as CSSProperties;

  useEffect(() => {
    preloadLectureCoverSrcs([MODE_LIGHT, MODE_DARK, vialSrc]);
  }, [vialSrc]);

  return (
    <div
      className={cn("lecture-cover-product-vial relative h-full w-full overflow-hidden", className)}
      data-vial-src={vialSrc}
    >
      <svg className="pointer-events-none absolute h-0 w-0 overflow-hidden" aria-hidden>
        <defs>
          <filter
            id={defringeId}
            x="-5%"
            y="-5%"
            width="110%"
            height="110%"
            colorInterpolationFilters="sRGB"
          >
            <feMorphology in="SourceAlpha" operator="erode" radius="1.6" result="choke" />
            <feGaussianBlur in="choke" stdDeviation="0.45" result="soft" />
            <feComposite in="SourceGraphic" in2="soft" operator="in" />
          </filter>
        </defs>
      </svg>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={MODE_LIGHT}
        alt=""
        draggable={false}
        decoding="async"
        loading="eager"
        className="lecture-cover-product-mode lecture-cover-product-mode--light absolute inset-0 h-full w-full object-cover object-center"
        aria-hidden
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={MODE_DARK}
        alt=""
        draggable={false}
        decoding="async"
        loading="eager"
        className="lecture-cover-product-mode lecture-cover-product-mode--dark absolute inset-0 h-full w-full object-cover object-center"
        aria-hidden
      />

      <div className="lecture-cover-product-vial-stage absolute inset-0 z-[1]" aria-hidden>
        <span className="lecture-cover-product-vial-shadow" aria-hidden />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={vialSrc}
          alt=""
          draggable={false}
          decoding="async"
          loading="eager"
          className="lecture-cover-product-vial-img"
          style={vialStyle}
          aria-hidden
        />
      </div>
    </div>
  );
}

export const CourseCoverProductVial = memo(CourseCoverProductVialInner);
