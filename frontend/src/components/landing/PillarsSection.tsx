"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type TouchEvent,
} from "react";
import { useGSAP } from "@gsap/react";
import { landingContent } from "@/content/landing";
import { brand } from "@/config/brand";
import { heroLayout } from "@/lib/hero-styles";
import { gsap, registerGsap } from "@/lib/gsap";
import { ChevronLeft, ChevronRight, Icon } from "@/components/icons";
import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

type PillarItem = (typeof landingContent.pillars.items)[number];

const AUTO_PLAY_HOLD_MS = 2000;
/** Soft glide between cards — matched to card face CSS transitions below */
const SLIDE_DURATION_S = 1.15;
const SLIDE_DURATION_MS = Math.round(SLIDE_DURATION_S * 1000);
/** Desktop (lg+) — keep identical to current desktop carousel */
const DESKTOP_VISIBLE_CARDS = 4;
const TABLET_VISIBLE_CARDS = 2;
const MOBILE_VISIBLE_CARDS = 1;
const WORD_ROTATE_MS = 1800;
/** Match HookSection title "becomes" (duskBlue / HOOK_LINE) */
const PILLARS_WORD_COLOR = brand.colors.primary.duskBlue;

function PillarsHeadline({
  prefix,
  suffix,
  words,
  isActive,
  reduceMotion,
}: {
  prefix: string;
  suffix: string;
  words: readonly string[];
  isActive: boolean;
  reduceMotion: boolean;
}) {
  const wordRef = useRef<HTMLSpanElement>(null);
  const animatedIndexRef = useRef<number | null>(null);
  const [wordIndex, setWordIndex] = useState(0);
  const [displayWord, setDisplayWord] = useState(words[0] ?? "");

  useEffect(() => {
    if (!isActive || reduceMotion || words.length <= 1) return;

    const id = window.setInterval(() => {
      setWordIndex((current) => (current + 1) % words.length);
    }, WORD_ROTATE_MS);

    return () => window.clearInterval(id);
  }, [isActive, reduceMotion, words.length]);

  useGSAP(
    () => {
      registerGsap();
      const el = wordRef.current;
      if (!el) return;

      const nextWord = words[wordIndex] ?? words[0] ?? "";

      if (reduceMotion) {
        setDisplayWord(nextWord);
        gsap.set(el, { yPercent: 0, autoAlpha: 1, scale: 1, rotateX: 0 });
        return;
      }

      if (animatedIndexRef.current === wordIndex) return;

      const isFirstReveal = animatedIndexRef.current === null;
      animatedIndexRef.current = wordIndex;

      if (isFirstReveal) {
        setDisplayWord(nextWord);
        gsap.fromTo(
          el,
          { yPercent: 90, autoAlpha: 0, scale: 0.68, rotateX: 38 },
          {
            yPercent: 0,
            autoAlpha: 1,
            scale: 1,
            rotateX: 0,
            duration: 0.72,
            ease: "power4.out",
          },
        );
        return;
      }

      gsap
        .timeline()
        .to(el, {
          yPercent: -135,
          autoAlpha: 0,
          scale: 0.65,
          rotateX: -48,
          duration: 0.48,
          ease: "power3.in",
        })
        .call(() => {
          setDisplayWord(nextWord);
        })
        .set(el, { yPercent: 135, autoAlpha: 0, scale: 0.65, rotateX: 48 })
        .to(el, {
          yPercent: 0,
          autoAlpha: 1,
          scale: 1,
          rotateX: 0,
          duration: 0.72,
          ease: "power4.out",
        });
    },
    { dependencies: [wordIndex, reduceMotion, words] },
  );

  return (
    <h2 className="font-sans text-[1.5rem] font-normal leading-[1.15] tracking-tight text-primary sm:text-[2rem] sm:leading-[1.1] md:text-[2.75rem] md:leading-[1.08] lg:text-[3.75rem] lg:leading-[1.05]">
      {/* lg+: prefix and rotating word share one line (2-line headline).
          Below lg: the word drops to its own line (3-line headline). */}
      <span className="block lg:whitespace-nowrap">
        <span className="block lg:inline">{prefix}</span>{" "}
        <span className="relative grid w-fit align-bottom [perspective:900px] lg:inline-grid lg:w-auto">
          <span aria-hidden className="invisible col-start-1 row-start-1 grid">
            {words.map((word, index) => (
              <span
                key={`${word}-${index}`}
                className="col-start-1 row-start-1 whitespace-nowrap"
              >
                {word}
              </span>
            ))}
          </span>
          <span className="col-start-1 row-start-1 flex h-[1.08em] items-end overflow-hidden">
            <span
              ref={wordRef}
              className="inline-block origin-bottom whitespace-nowrap will-change-transform"
              style={{ color: PILLARS_WORD_COLOR }}
            >
              {displayWord}
            </span>
          </span>
        </span>
      </span>
      <span className="mt-1 block sm:mt-0">{suffix}</span>
    </h2>
  );
}

function buildExtendedItems(items: readonly PillarItem[]) {
  return [...items, ...items, ...items];
}

function PillarImage({
  src,
  alt,
  blurred,
}: {
  src: string;
  alt: string;
  blurred: boolean;
}) {
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-xl">
      <Image
        src={src}
        alt={alt}
        fill
        unoptimized
        className={cn(
          "object-cover transition-[filter,transform] ease-in-out",
          blurred && "scale-105 blur-[2px]",
        )}
        style={{ transitionDuration: `${SLIDE_DURATION_MS}ms` }}
        sizes="(max-width: 639px) 92vw, (max-width: 1023px) 48vw, 25vw"
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-white/35 transition-opacity ease-in-out",
          blurred ? "opacity-100" : "opacity-0",
        )}
        style={{ transitionDuration: `${SLIDE_DURATION_MS}ms` }}
        aria-hidden
      />
    </div>
  );
}

function PillarCardFace({
  item,
  isActive,
  heightTitle,
  onSelect,
}: {
  item: PillarItem;
  isActive: boolean;
  /** Longest pillar title — keeps every card the same height (no row resize). */
  heightTitle: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={isActive ? "true" : undefined}
      aria-label={item.title}
      className={cn(
        "h-full w-full rounded-2xl bg-white p-3 sm:p-3.5 md:p-4 lg:p-5 text-left select-none",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/40",
        isActive ? "cursor-default" : "cursor-pointer",
      )}
      style={{ transitionDuration: `${SLIDE_DURATION_MS}ms` }}
    >
      <PillarImage src={item.image} alt="" blurred={!isActive} />
      {/*
        Always the full title. Swapping to shortTitle on inactive cards
        (esp. Community / Assistant) resized the flex row mid-slide = snap.
        Invisible tallest title locks every card to one shared height.
      */}
      <h3
        className={cn(
          "relative mt-2.5 font-sans text-[0.9375rem] font-bold leading-[1.2] tracking-[0.005em] sm:mt-3 sm:text-base md:mt-4 md:text-lg lg:text-[1.375rem]",
          "transition-colors ease-in-out",
          isActive ? "text-primary" : "text-primary/45",
        )}
        style={{ transitionDuration: `${SLIDE_DURATION_MS}ms` }}
      >
        <span className="invisible block" aria-hidden>
          {heightTitle}
        </span>
        <span className="absolute inset-x-0 top-0">{item.title}</span>
      </h3>
    </button>
  );
}

function PillarDetailPanel({
  item,
  className,
}: {
  item: PillarItem;
  className?: string;
}) {
  return (
    <div className={cn("glass-panel rounded-2xl p-4 sm:p-5 lg:p-6", className)}>
      <span className="glass-capsule-accent inline-flex items-center rounded-full px-3.5 py-1.5 text-brand-caption font-semibold uppercase tracking-[0.08em] text-primary sm:px-4">
        {item.overviewLabel}
      </span>
      <p className="text-brand-body mt-3 text-sm text-primary/75 sm:text-[1.125rem]">
        {item.description}
      </p>
    </div>
  );
}

function resolveVisibleCards() {
  if (typeof window === "undefined") return DESKTOP_VISIBLE_CARDS;
  if (window.matchMedia("(min-width: 1024px)").matches) return DESKTOP_VISIBLE_CARDS;
  if (window.matchMedia("(min-width: 640px)").matches) return TABLET_VISIBLE_CARDS;
  return MOBILE_VISIBLE_CARDS;
}

function PillarsCarousel({
  items,
  pauseAutoplay = false,
}: {
  items: readonly PillarItem[];
  pauseAutoplay?: boolean;
}) {
  const itemCount = items.length;
  const extendedItems = useMemo(() => buildExtendedItems(items), [items]);
  const heightTitle = useMemo(
    () =>
      items.reduce(
        (longest, item) =>
          item.title.length > longest.length ? item.title : longest,
        "",
      ),
    [items],
  );
  const centerIndex = Math.floor((itemCount - 1) / 2);
  /** Always start in the middle copy so we can loop both directions forever. */
  const startIndex = itemCount + centerIndex;

  const [trackIndex, setTrackIndex] = useState(startIndex);
  const [slotWidth, setSlotWidth] = useState(0);
  const [visibleCards, setVisibleCards] = useState(MOBILE_VISIBLE_CARDS);

  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const trackIndexRef = useRef(startIndex);
  const autoplayTimerRef = useRef<number | null>(null);
  const slideTweenRef = useRef<gsap.core.Tween | null>(null);
  const isAnimatingRef = useRef(false);
  /** Hard pause — section out of view / reduce motion */
  const pauseAutoplayRef = useRef(pauseAutoplay);
  /** Soft pause — hover only blocks the timer, never manual nav */
  const hoverPauseRef = useRef(false);
  const touchStartXRef = useRef<number | null>(null);
  const touchDeltaXRef = useRef(0);
  /** Ignore the click that follows a swipe on touch devices. */
  const suppressCardClickRef = useRef(false);
  const getTranslateXRef = useRef<(index: number) => number>(() => 0);
  const scheduleAutoplayRef = useRef<(delay?: number) => void>(() => {});
  const applyTransformRef = useRef<(index: number, animate: boolean) => void>(() => {});
  const advanceRef = useRef<() => void>(() => {});

  useEffect(() => {
    pauseAutoplayRef.current = pauseAutoplay;
  }, [pauseAutoplay]);

  const activeItem = items[trackIndex % itemCount] ?? items[centerIndex];

  const getVisibleCards = useCallback(() => resolveVisibleCards(), []);

  const getTranslateX = useCallback(
    (index: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return 0;

      const nextVisibleCards = getVisibleCards();
      const width = viewport.clientWidth;
      const cardSlot = width / nextVisibleCards;

      return width / 2 - cardSlot / 2 - index * cardSlot;
    },
    [getVisibleCards],
  );
  getTranslateXRef.current = getTranslateX;

  const clearAutoplay = useCallback(() => {
    if (autoplayTimerRef.current !== null) {
      window.clearTimeout(autoplayTimerRef.current);
      autoplayTimerRef.current = null;
    }
  }, []);

  const scheduleAutoplay = useCallback(
    (delay = AUTO_PLAY_HOLD_MS) => {
      clearAutoplay();
      if (pauseAutoplayRef.current || hoverPauseRef.current) return;

      autoplayTimerRef.current = window.setTimeout(() => {
        autoplayTimerRef.current = null;
        if (pauseAutoplayRef.current || hoverPauseRef.current) return;
        advanceRef.current();
      }, delay);
    },
    [clearAutoplay],
  );
  scheduleAutoplayRef.current = scheduleAutoplay;

  /**
   * Before animating past the middle copy, silently jump by ±itemCount.
   * Ref-only (no setState) so React doesn't flash active styles mid-loop.
   */
  const prepareInfiniteIndex = useCallback(
    (direction: 1 | -1) => {
      const current = trackIndexRef.current;
      const track = trackRef.current;
      if (!track || itemCount <= 0) return current;

      const wouldLeaveMiddle =
        (direction > 0 && current >= itemCount * 2 - 1) ||
        (direction < 0 && current <= itemCount);

      if (!wouldLeaveMiddle) return current;

      const relocated = current + (direction > 0 ? -itemCount : itemCount);
      trackIndexRef.current = relocated;
      gsap.set(track, {
        x: getTranslateXRef.current(relocated),
        force3D: true,
      });
      return relocated;
    },
    [itemCount],
  );

  const applyTransform = useCallback(
    (index: number, animate: boolean) => {
      const viewport = viewportRef.current;
      const track = trackRef.current;
      if (!viewport || !track) return;

      registerGsap();

      const nextVisibleCards = getVisibleCards();
      const cardSlot = viewport.clientWidth / nextVisibleCards;
      const x = getTranslateX(index);

      // Layout state only — avoid redundant setState during every slide.
      setVisibleCards((prev) =>
        prev === nextVisibleCards ? prev : nextVisibleCards,
      );
      setSlotWidth((prev) =>
        Math.abs(prev - cardSlot) < 0.5 ? prev : cardSlot,
      );

      slideTweenRef.current?.kill();

      if (!animate) {
        gsap.set(track, { x, force3D: true });
        isAnimatingRef.current = false;
        return;
      }

      isAnimatingRef.current = true;
      slideTweenRef.current = gsap.to(track, {
        x,
        duration: SLIDE_DURATION_S,
        ease: "power1.inOut",
        overwrite: true,
        force3D: true,
        onComplete: () => {
          isAnimatingRef.current = false;
          scheduleAutoplayRef.current();
        },
      });
    },
    [getTranslateX, getVisibleCards],
  );
  applyTransformRef.current = applyTransform;

  const advance = useCallback(() => {
    if (isAnimatingRef.current) return;

    const prepared = prepareInfiniteIndex(1);
    const nextIndex = prepared + 1;
    trackIndexRef.current = nextIndex;
    setTrackIndex(nextIndex);
    applyTransformRef.current(nextIndex, true);
  }, [prepareInfiniteIndex]);

  const retreat = useCallback(() => {
    if (isAnimatingRef.current) return;

    const prepared = prepareInfiniteIndex(-1);
    const nextIndex = prepared - 1;
    trackIndexRef.current = nextIndex;
    setTrackIndex(nextIndex);
    applyTransformRef.current(nextIndex, true);
  }, [prepareInfiniteIndex]);

  /** Mouse / tap a visible card to center it (desktop + responsive). */
  const goToIndex = useCallback((absoluteIndex: number) => {
    if (suppressCardClickRef.current) {
      suppressCardClickRef.current = false;
      return;
    }
    if (isAnimatingRef.current) return;
    if (absoluteIndex === trackIndexRef.current) return;

    clearAutoplay();
    trackIndexRef.current = absoluteIndex;
    setTrackIndex(absoluteIndex);
    applyTransformRef.current(absoluteIndex, true);
  }, [clearAutoplay]);

  advanceRef.current = advance;

  useEffect(() => {
    if (pauseAutoplay) {
      clearAutoplay();
      slideTweenRef.current?.kill();
      isAnimatingRef.current = false;
      return;
    }

    if (!isAnimatingRef.current) {
      scheduleAutoplay();
    }
  }, [pauseAutoplay, clearAutoplay, scheduleAutoplay]);

  // Mount / item-count only — do NOT reset when transform helpers change identity,
  // or the carousel will jump back to the start mid-loop.
  useEffect(() => {
    registerGsap();
    trackIndexRef.current = startIndex;
    setTrackIndex(startIndex);
    applyTransformRef.current(startIndex, false);
    scheduleAutoplayRef.current();

    const viewport = viewportRef.current;
    if (!viewport) return;

    const observer = new ResizeObserver(() => {
      slideTweenRef.current?.kill();
      isAnimatingRef.current = false;
      applyTransformRef.current(trackIndexRef.current, false);
    });
    observer.observe(viewport);

    const onResize = () => {
      slideTweenRef.current?.kill();
      isAnimatingRef.current = false;
      applyTransformRef.current(trackIndexRef.current, false);
    };
    window.addEventListener("resize", onResize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      clearAutoplay();
      slideTweenRef.current?.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only remount on loop structure change
  }, [startIndex, itemCount, clearAutoplay]);

  const onMouseEnter = () => {
    hoverPauseRef.current = true;
    clearAutoplay();
  };

  const onMouseLeave = () => {
    hoverPauseRef.current = false;
    if (!pauseAutoplayRef.current && !isAnimatingRef.current) {
      scheduleAutoplay();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      clearAutoplay();
      retreat();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      clearAutoplay();
      advance();
    }
  };

  const onPrevClick = () => {
    clearAutoplay();
    retreat();
  };

  const onNextClick = () => {
    clearAutoplay();
    advance();
  };

  const onTouchStart = (event: TouchEvent) => {
    touchStartXRef.current = event.touches[0]?.clientX ?? null;
    touchDeltaXRef.current = 0;
    clearAutoplay();
  };

  const onTouchMove = (event: TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const x = event.touches[0]?.clientX ?? touchStartXRef.current;
    touchDeltaXRef.current = x - touchStartXRef.current;
  };

  const onTouchEnd = () => {
    const delta = touchDeltaXRef.current;
    touchStartXRef.current = null;
    touchDeltaXRef.current = 0;

    if (Math.abs(delta) < 48) {
      scheduleAutoplay();
      return;
    }

    // Swipe steers the carousel — don't also fire the card's click.
    suppressCardClickRef.current = true;
    if (delta < 0) {
      advance();
    } else {
      retreat();
    }
  };

  const arrowButtonClass = cn(
    "inline-flex h-11 w-12 items-center justify-center text-primary/70",
    "transition-colors duration-200 hover:bg-white/50 hover:text-primary",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/40",
  );

  return (
    <div className="mt-5 sm:mt-6 md:mt-8">
      <div
        ref={viewportRef}
        tabIndex={0}
        role="region"
        aria-label="Six pillars carousel"
        aria-roledescription="carousel"
        className="w-full select-none outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2 focus-visible:ring-offset-[#E5E5E5]"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onKeyDown={onKeyDown}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div className="overflow-hidden">
          <div ref={trackRef} className="flex will-change-transform">
            {extendedItems.map((item, index) => (
              <div
                key={`${item.id}-${index}`}
                className="shrink-0 px-1 sm:px-1.5 md:px-2 lg:px-2.5"
                style={{
                  width: slotWidth || `${100 / visibleCards}%`,
                }}
              >
                <PillarCardFace
                  item={item}
                  isActive={index % itemCount === trackIndex % itemCount}
                  heightTitle={heightTitle}
                  onSelect={() => goToIndex(index)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Detail: full width below lg; desktop keeps one-card slot width */}
        <div className="mt-3 flex justify-center sm:mt-4">
          <div
            className={cn(
              "px-0 sm:px-1.5 md:px-2 lg:px-2.5",
              visibleCards < DESKTOP_VISIBLE_CARDS ? "w-full max-w-2xl" : undefined,
            )}
            style={
              visibleCards >= DESKTOP_VISIBLE_CARDS
                ? { width: slotWidth || `${100 / visibleCards}%` }
                : undefined
            }
          >
            <PillarDetailPanel item={activeItem} />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center sm:mt-5 lg:mt-6">
          <div
            className="glass-capsule inline-flex overflow-hidden rounded-full"
            role="group"
            aria-label="Pillar navigation"
          >
            <button
              type="button"
              aria-label="Previous pillar"
              className={cn(arrowButtonClass, "rounded-l-full")}
              onClick={onPrevClick}
            >
              <Icon icon={ChevronLeft} size={16} strokeWidth={2.2} />
            </button>
            <button
              type="button"
              aria-label="Next pillar"
              className={cn(
                arrowButtonClass,
                "rounded-r-full border-l border-primary/10",
              )}
              onClick={onNextClick}
            >
              <Icon icon={ChevronRight} size={16} strokeWidth={2.2} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PillarsSection() {
  const { pillars } = landingContent;
  const sectionRef = useRef<HTMLElement>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [sectionInView, setSectionInView] = useState(false);
  const rotatingWords = useMemo(
    () => pillars.items.map((item) => item.shortTitle),
    [pillars.items],
  );

  useEffect(() => {
    setReduceMotion(prefersReducedMotion());
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => setSectionInView(entry.isIntersecting),
      { threshold: 0.2 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="everything-inside"
      className="relative z-0 flex w-full flex-col justify-center bg-[#E5E5E5] py-10 sm:py-12 md:py-14 lg:py-16"
    >
      <div className={cn("flex w-full flex-col", heroLayout.gutterX)}>
        <div className="w-full max-w-3xl text-left lg:max-w-4xl">
          <PillarsHeadline
            prefix={pillars.headlinePrefix}
            suffix={pillars.headlineSuffix}
            words={rotatingWords}
            isActive={sectionInView}
            reduceMotion={reduceMotion}
          />
        </div>

        <PillarsCarousel items={pillars.items} pauseAutoplay={!sectionInView} />
      </div>
    </section>
  );
}
