"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useGSAP } from "@gsap/react";
import { gsap, registerGsap, ScrollTrigger } from "@/lib/gsap";
import { landingContent } from "@/content/landing";
import { heroLayout } from "@/lib/hero-styles";
import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

const WHO_IT_FOR_VIDEO = "https://frontiercms.s3.us-east-1.amazonaws.com/background_35fd479bc8.mp4";
const WHO_IT_FOR_POSTER = "https://frontiercms.s3.us-east-1.amazonaws.com/background_f65a048b54.png";

type WhoItsForSlide = (typeof landingContent.whoItsFor.slides)[number];

const WIF_RAW_TEXT =
  "font-body w-full min-w-0 max-w-full text-[1.25rem] font-light leading-[1.45] tracking-[0.01em] text-pretty text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.4)] sm:text-[1.625rem] sm:leading-[1.5] md:text-[2.125rem] lg:text-[2.35rem] lg:leading-[1.45] lg:tracking-[0.02em]";
const WIF_BULLET_LABEL =
  "font-body min-w-0 max-w-full text-center text-[1.125rem] font-light tracking-[0.01em] text-pretty text-white/95 drop-shadow-[0_2px_12px_rgba(0,0,0,0.35)] sm:text-[1.375rem] md:text-[1.75rem] lg:text-[2rem] lg:tracking-[0.02em]";

function StepCapsule({ step }: { step: number }) {
  return (
    <div
      aria-hidden
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/75 sm:h-10 sm:w-10 md:h-11 md:w-11"
    >
      <span className="font-sans text-sm font-normal text-white sm:text-base md:text-lg">
        {step}
      </span>
    </div>
  );
}

function ScrollProgressLine({
  fillRef,
  className,
}: {
  fillRef: RefObject<HTMLDivElement | null>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "h-px w-28 overflow-hidden bg-white/25 sm:w-40 md:w-56",
        className,
      )}
      aria-hidden
    >
      {/* Width driven by ScrollTrigger onUpdate — no CSS transition / React thrash */}
      <div ref={fillRef} className="h-full w-[8%] bg-white/70" />
    </div>
  );
}

function RawTextSlide({ lines }: { lines: readonly string[] }) {
  return (
    <div className="mx-auto w-full min-w-0 max-w-4xl px-1 text-center sm:px-2">
      {lines.map((line) => (
        <p key={line} className={WIF_RAW_TEXT}>
          {line}
        </p>
      ))}
    </div>
  );
}

function BulletSlide({ items }: { items: readonly string[] }) {
  return (
    <ul className="mx-auto flex w-full min-w-0 max-w-4xl flex-col items-center gap-6 px-1 sm:flex-row sm:flex-wrap sm:items-start sm:justify-center sm:gap-x-10 sm:gap-y-10 sm:px-2 md:gap-x-14 lg:gap-x-16">
      {items.map((item) => (
        <li
          key={item}
          className="flex min-w-0 flex-col items-center gap-3 sm:gap-4 md:gap-5"
        >
          <span data-wif-bullet className={WIF_BULLET_LABEL}>
            {item}
          </span>
          <span
            data-wif-dot
            className="h-2 w-2 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.45)] sm:h-2.5 sm:w-2.5"
            aria-hidden
          />
        </li>
      ))}
    </ul>
  );
}

function WhoItsForSlideContent({ slide }: { slide: WhoItsForSlide }) {
  return (
    <div className="w-full min-w-0 max-w-full">
      {slide.type === "text" ? (
        <RawTextSlide lines={slide.lines} />
      ) : (
        <BulletSlide items={slide.items} />
      )}
    </div>
  );
}

/**
 * Dual-buffer loop: one video stays visible while the other is pre-seeked to
 * frame 0, then we hard-swap at the seam. Avoids the HTML5 single-element
 * hitch when `loop` seeks back to the start.
 */
function WhoItsForBackgroundVideo() {
  const primaryRef = useRef<HTMLVideoElement>(null);
  const secondaryRef = useRef<HTMLVideoElement>(null);
  const activeIndexRef = useRef<0 | 1>(0);
  const preparingRef = useRef(false);
  const swappingRef = useRef(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    setReduceMotion(prefersReducedMotion());
  }, []);

  useEffect(() => {
    if (reduceMotion || videoFailed) return;

    const videos = [primaryRef.current, secondaryRef.current] as const;
    if (!videos[0] || !videos[1]) return;

    /** Start the standby buffer this far before the seam (seconds). */
    const PREP_LEAD = 0.28;
    /** Hard-swap when this little time remains (≈2 frames @ 24fps). */
    const SWAP_LEAD = 0.08;

    const configure = (video: HTMLVideoElement) => {
      video.loop = false;
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("muted", "");
    };

    configure(videos[0]);
    configure(videos[1]);
    videos[0].style.opacity = "1";
    videos[1].style.opacity = "0";
    activeIndexRef.current = 0;
    preparingRef.current = false;
    swappingRef.current = false;

    const playVideo = (video: HTMLVideoElement) => {
      const attempt = video.play();
      if (attempt !== undefined) {
        attempt.catch(() => {});
      }
    };

    const resetStandby = (video: HTMLVideoElement) => {
      video.pause();
      try {
        video.currentTime = 0;
      } catch {
        /* ignore seek abort during teardown */
      }
    };

    const handleError = () => setVideoFailed(true);

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const active = videos[activeIndexRef.current];
      if (active?.paused) playVideo(active);
    };

    const hardSwap = () => {
      if (swappingRef.current) return;

      const activeIndex = activeIndexRef.current;
      const current = videos[activeIndex];
      const nextIndex = (1 - activeIndex) as 0 | 1;
      const next = videos[nextIndex];
      if (!current || !next) return;

      swappingRef.current = true;
      playVideo(next);
      next.style.opacity = "1";
      current.style.opacity = "0";
      activeIndexRef.current = nextIndex;
      preparingRef.current = false;

      window.setTimeout(() => {
        resetStandby(current);
        swappingRef.current = false;
      }, 120);
    };

    const handleEnded = (index: 0 | 1) => () => {
      if (activeIndexRef.current !== index) return;
      hardSwap();
    };

    videos[0].addEventListener("error", handleError);
    videos[1].addEventListener("error", handleError);
    videos[0].addEventListener("ended", handleEnded(0));
    videos[1].addEventListener("ended", handleEnded(1));
    document.addEventListener("visibilitychange", handleVisibility);

    playVideo(videos[0]);

    let rafId = 0;

    const tick = () => {
      const activeIndex = activeIndexRef.current;
      const current = videos[activeIndex];
      const nextIndex = (1 - activeIndex) as 0 | 1;
      const next = videos[nextIndex];

      if (
        current &&
        next &&
        !swappingRef.current &&
        Number.isFinite(current.duration) &&
        current.duration > 0
      ) {
        const remaining = current.duration - current.currentTime;

        if (remaining <= PREP_LEAD && !preparingRef.current) {
          preparingRef.current = true;
          // Park standby on frame 0 under the visible layer.
          resetStandby(next);
        }

        // Start playback a couple frames early while still hidden, so the
        // first painted frame is ready before we hard-cut at the seam.
        if (
          remaining <= SWAP_LEAD &&
          preparingRef.current &&
          next.paused &&
          next.readyState >= 2
        ) {
          playVideo(next);
        }

        if (
          preparingRef.current &&
          !next.paused &&
          remaining <= 1 / 24
        ) {
          hardSwap();
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      videos[0]?.removeEventListener("error", handleError);
      videos[1]?.removeEventListener("error", handleError);
      videos[0]?.removeEventListener("ended", handleEnded(0));
      videos[1]?.removeEventListener("ended", handleEnded(1));
      document.removeEventListener("visibilitychange", handleVisibility);
      videos[0]?.pause();
      videos[1]?.pause();
    };
  }, [reduceMotion, videoFailed]);

  const videoClassName =
    "absolute inset-0 h-full w-full object-cover object-center";

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      {reduceMotion || videoFailed ? (
        <Image
          src={WHO_IT_FOR_POSTER}
          alt=""
          fill
          sizes="100vw"
          className="object-cover object-center"
        />
      ) : (
        <>
          <video
            ref={primaryRef}
            autoPlay
            muted
            playsInline
            preload="auto"
            disablePictureInPicture
            poster={WHO_IT_FOR_POSTER}
            className={videoClassName}
          >
            <source src={WHO_IT_FOR_VIDEO} type="video/mp4" />
          </video>
          <video
            ref={secondaryRef}
            muted
            playsInline
            preload="auto"
            disablePictureInPicture
            className={videoClassName}
            aria-hidden
          >
            <source src={WHO_IT_FOR_VIDEO} type="video/mp4" />
          </video>
        </>
      )}
    </div>
  );
}

function WhoItsForScrim() {
  return (
    <div
      className="absolute inset-0 bg-[linear-gradient(180deg,rgba(21,39,68,0.28)_0%,rgba(21,39,68,0.12)_45%,rgba(21,39,68,0.32)_100%)]"
      aria-hidden
    />
  );
}

function WhoItsForBackground() {
  return (
    <div className="absolute inset-0 -z-10">
      <WhoItsForBackgroundVideo />
      <WhoItsForScrim />
    </div>
  );
}

function WhoItsForStatic() {
  const { whoItsFor } = landingContent;

  return (
    <section id="who-its-for" className="relative isolate overflow-hidden">
      <WhoItsForBackground />

      <div
        className={cn(
          "relative mx-auto flex w-full max-w-4xl flex-col items-center gap-12 py-14 sm:gap-14 sm:py-16 md:gap-16 md:py-28",
          heroLayout.gutterX,
        )}
      >
        {whoItsFor.slides.map((slide, index) => (
          <div
            key={slide.id}
            className="flex w-full flex-col items-center gap-6 sm:gap-8 md:gap-10"
          >
            <StepCapsule step={index + 1} />
            <WhoItsForSlideContent slide={slide} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function WhoItsForSection() {
  const { whoItsFor } = landingContent;
  const [reduceMotion, setReduceMotion] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const sectionRef = useRef<HTMLElement>(null);
  const pinWrapRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);

  const slideCount = whoItsFor.slides.length;

  useEffect(() => {
    setReduceMotion(prefersReducedMotion());
  }, []);

  useGSAP(
    () => {
      if (reduceMotion) return;

      registerGsap();

      const pinWrap = pinWrapRef.current;
      if (!pinWrap) return;

      // Prevent duplicate pins if this effect re-runs (Strict Mode / refresh).
      ScrollTrigger.getById("who-its-for-timeline")?.kill();

      const slides = gsap.utils.toArray<HTMLElement>(
        pinWrap.querySelectorAll("[data-wif-slide]"),
      );

      if (slides.length === 0) return;

      // Extra scroll room so each crossfade can breathe (matches Hook feel).
      const scrollDistance = () =>
        window.innerHeight * Math.max(slides.length, 1) * 1.55;

      // Own visibility on slide wrappers so React re-renders
      // (step capsule / progress) cannot fight the timeline.
      gsap.set(slides, { autoAlpha: 0, y: 14 });
      gsap.set(slides[0], { autoAlpha: 1, y: 0 });

      slides.forEach((slide) => {
        const bullets = gsap.utils.toArray<HTMLElement>(
          slide.querySelectorAll("[data-wif-bullet]"),
        );
        const dots = gsap.utils.toArray<HTMLElement>(
          slide.querySelectorAll("[data-wif-dot]"),
        );
        if (bullets.length > 0) gsap.set(bullets, { autoAlpha: 0, y: 10 });
        if (dots.length > 0) gsap.set(dots, { autoAlpha: 0, scale: 0.55 });
      });

      let lastIndex = 0;
      setActiveIndex(0);
      if (progressFillRef.current) {
        progressFillRef.current.style.width = "8%";
      }

      const timeline = gsap.timeline({
        scrollTrigger: {
          id: "who-its-for-timeline",
          trigger: pinWrap,
          start: "top top",
          end: () => `+=${scrollDistance()}`,
          pin: pinWrap,
          pinSpacing: true,
          // Same scrub lag as Hook / What You Get — eases toward scroll, no snap.
          scrub: 1.8,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            const fill = progressFillRef.current;
            if (fill) {
              fill.style.width = `${Math.max(8, self.progress * 100)}%`;
            }

            const index = Math.min(
              slides.length - 1,
              Math.round(self.progress * (slides.length - 1)),
            );
            if (index === lastIndex) return;
            lastIndex = index;
            setActiveIndex(index);
          },
        },
      });

      // Long overlapping beats so slide changes feel continuous, not stepped.
      const beat = 1.35;

      slides.forEach((slide, index) => {
        const t = index * beat;
        const bullets = gsap.utils.toArray<HTMLElement>(
          slide.querySelectorAll("[data-wif-bullet]"),
        );
        const dots = gsap.utils.toArray<HTMLElement>(
          slide.querySelectorAll("[data-wif-dot]"),
        );

        if (index === 0) {
          timeline.to(
            slide,
            { autoAlpha: 1, y: 0, duration: 0.85, ease: "power1.out" },
            0,
          );
        } else {
          // Start incoming early so it crossfades with the outgoing slide.
          timeline.fromTo(
            slide,
            { autoAlpha: 0, y: 14 },
            {
              autoAlpha: 1,
              y: 0,
              duration: 1.05,
              ease: "power1.out",
            },
            t - 0.4,
          );
        }

        if (bullets.length > 0) {
          const bulletAt = index === 0 ? 0.12 : t - 0.22;
          timeline.fromTo(
            bullets,
            { autoAlpha: 0, y: 10 },
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.7,
              stagger: 0.12,
              ease: "power1.out",
            },
            bulletAt,
          );
          timeline.fromTo(
            dots,
            { autoAlpha: 0, scale: 0.55 },
            {
              autoAlpha: 1,
              scale: 1,
              duration: 0.65,
              stagger: 0.12,
              ease: "power1.out",
            },
            bulletAt + 0.08,
          );
        }

        if (index < slides.length - 1) {
          timeline.to(
            slide,
            {
              autoAlpha: 0,
              y: -10,
              duration: 1.05,
              ease: "power1.inOut",
            },
            t + 0.55,
          );

          if (bullets.length > 0) {
            timeline.to(
              bullets,
              {
                autoAlpha: 0,
                y: -8,
                duration: 0.7,
                stagger: 0.06,
                ease: "power1.in",
              },
              t + 0.55,
            );
            timeline.to(
              dots,
              {
                autoAlpha: 0,
                scale: 0.55,
                duration: 0.55,
                stagger: 0.06,
                ease: "power1.in",
              },
              t + 0.55,
            );
          }
        }
      });

      // End hold so the last slide doesn't vanish the instant pin ends.
      timeline.to({}, { duration: 0.9 });

      requestAnimationFrame(() => ScrollTrigger.refresh());

      return () => {
        timeline.scrollTrigger?.kill();
        timeline.kill();
        ScrollTrigger.getById("who-its-for-timeline")?.kill();
      };
    },
    { scope: sectionRef, dependencies: [reduceMotion, slideCount] },
  );

  if (reduceMotion) {
    return <WhoItsForStatic />;
  }

  return (
    <section ref={sectionRef} id="who-its-for" className="relative isolate">
      <div
        ref={pinWrapRef}
        className="relative flex h-[100dvh] flex-col overflow-hidden"
      >
        <WhoItsForBackground />

        <div
          className={cn(
            "relative mx-auto flex h-full min-h-0 w-full min-w-0 max-w-5xl flex-col items-center",
            heroLayout.gutterX,
          )}
        >
          <div className="flex shrink-0 justify-center pt-6 sm:pt-8 md:pt-12">
            <StepCapsule step={activeIndex + 1} />
          </div>

          <div className="relative flex min-h-0 w-full min-w-0 flex-1 items-center justify-center overflow-hidden py-4 sm:py-8 md:py-12">
            <div className="relative w-full min-w-0 max-h-full">
              {whoItsFor.slides.map((slide) => (
                <div
                  key={slide.id}
                  data-wif-slide
                  className="absolute inset-0 flex min-w-0 items-center justify-center will-change-transform"
                >
                  <WhoItsForSlideContent slide={slide} />
                </div>
              ))}

              {/* Height sizer: grid stacks every slide so layout uses the tallest.
                  Must stay invisible — it is the same copy as the live slides. */}
              <div
                className="pointer-events-none invisible grid opacity-0"
                aria-hidden
              >
                {whoItsFor.slides.map((slide) => (
                  <div key={slide.id} className="col-start-1 row-start-1">
                    <WhoItsForSlideContent slide={slide} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-center gap-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:gap-6 sm:pb-10 md:pb-12">
            <ScrollProgressLine fillRef={progressFillRef} />
          </div>
        </div>
      </div>
    </section>
  );
}
