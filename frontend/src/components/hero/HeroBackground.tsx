"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import { gsap, registerGsap } from "@/lib/gsap";
import { HeroSceneCanvas } from "@/components/three/HeroSceneCanvas";
import { prefersReducedMotion } from "@/lib/motion";

const HERO_VIDEO_MP4 = "https://frontiercms.s3.us-east-1.amazonaws.com/herosection_e909ac0823.mp4";
const HERO_POSTER = "https://frontiercms.s3.us-east-1.amazonaws.com/herosection_poster_90831b4d04.jpg";

type HeroBackgroundProps = {
  variant?: "sky" | "photo";
};

function CloudSvg({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <ellipse cx="120" cy="70" rx="90" ry="42" fill="currentColor" />
      <ellipse cx="210" cy="62" rx="110" ry="48" fill="currentColor" />
      <ellipse cx="300" cy="72" rx="85" ry="38" fill="currentColor" />
      <ellipse cx="170" cy="48" rx="70" ry="32" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

function FloatingParticles() {
  const particles = [
    { left: "12%", top: "22%", size: 6, delay: 0 },
    { left: "78%", top: "18%", size: 4, delay: 1.2 },
    { left: "64%", top: "34%", size: 5, delay: 0.6 },
    { left: "28%", top: "42%", size: 3, delay: 2.1 },
    { left: "88%", top: "38%", size: 4, delay: 1.8 },
    { left: "46%", top: "28%", size: 3, delay: 0.9 },
  ];

  return (
    <>
      {particles.map((particle, index) => (
        <span
          key={`particle-${index}`}
          data-float-particle
          className="absolute rounded-full bg-white/50 shadow-[0_0_12px_rgba(141,195,225,0.45)]"
          style={{
            left: particle.left,
            top: particle.top,
            width: particle.size,
            height: particle.size,
            animationDelay: `${particle.delay}s`,
          }}
        />
      ))}
    </>
  );
}

function PhotoBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    setReduceMotion(prefersReducedMotion());
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || reduceMotion || videoFailed) return;

    video.loop = true;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("muted", "");

    let cancelled = false;
    let retryTimer = 0;

    const playVideo = () => {
      if (cancelled) return;
      const attempt = video.play();
      if (attempt !== undefined) {
        attempt.catch(() => {
          if (cancelled) return;
          // Retry shortly — Brave/Chrome can reject the first autoplay race.
          window.clearTimeout(retryTimer);
          retryTimer = window.setTimeout(playVideo, 250);
        });
      }
    };

    const handleEnded = () => {
      video.currentTime = 0;
      playVideo();
    };

    const handleError = () => setVideoFailed(true);

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && video.paused) {
        playVideo();
      }
    };

    video.addEventListener("ended", handleEnded);
    video.addEventListener("error", handleError);
    video.addEventListener("loadeddata", playVideo);
    video.addEventListener("canplay", playVideo);
    document.addEventListener("visibilitychange", handleVisibility);

    playVideo();

    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("error", handleError);
      video.removeEventListener("loadeddata", playVideo);
      video.removeEventListener("canplay", playVideo);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [reduceMotion, videoFailed]);

  return (
    <div
      className="pointer-events-none absolute inset-0 size-full overflow-hidden bg-black"
      aria-hidden
    >
      {reduceMotion || videoFailed ? (
        <Image
          src={HERO_POSTER}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
      ) : (
        <video
          ref={videoRef}
          src={HERO_VIDEO_MP4}
          poster={HERO_POSTER}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          className="absolute inset-0 h-full w-full min-h-full min-w-full object-cover object-center"
        />
      )}
    </div>
  );
}

function SkyBackground() {
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      registerGsap();
      if (prefersReducedMotion() || !rootRef.current) return;

      const layers = rootRef.current.querySelectorAll("[data-cloud-layer]");
      layers.forEach((layer, index) => {
        const direction = index % 2 === 0 ? 1 : -1;
        const distance = 70 + index * 24;

        gsap.to(layer, {
          x: direction * distance,
          duration: 20 + index * 4,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        });

        gsap.to(layer, {
          y: index % 2 === 0 ? -14 : 14,
          duration: 11 + index * 2,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        });
      });

      gsap.to(rootRef.current.querySelector("[data-sky-glow]"), {
        scale: 1.1,
        opacity: 0.92,
        duration: 9,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });

      gsap.to(rootRef.current.querySelector("[data-education-glow]"), {
        x: 24,
        y: -16,
        duration: 14,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });

      const particles = rootRef.current.querySelectorAll("[data-float-particle]");
      particles.forEach((particle, index) => {
        gsap.to(particle, {
          y: index % 2 === 0 ? -18 : 18,
          x: index % 2 === 0 ? 10 : -10,
          opacity: 0.35,
          duration: 5 + index * 0.7,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        });
      });
    },
    { scope: rootRef },
  );

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#8DC3E1_0%,#B8D9EE_38%,#D9EBF7_68%,#FFFFFF_100%)]" />

      <div className="absolute inset-0 opacity-55 mix-blend-soft-light md:opacity-70">
        <div className="h-full w-full">
          <HeroSceneCanvas />
        </div>
      </div>

      <div
        data-sky-glow
        className="absolute left-1/2 top-[-12%] h-[58%] w-[82%] -translate-x-1/2 rounded-full bg-white/40 blur-3xl"
      />

      <div
        data-education-glow
        className="absolute right-[-8%] top-[8%] h-[42%] w-[38%] rounded-full bg-[#DDE466]/18 blur-3xl"
      />

      <div className="absolute left-[-6%] top-[14%] h-[36%] w-[34%] rounded-full bg-[#3853A4]/10 blur-3xl" />

      <FloatingParticles />

      <div
        data-cloud-layer
        className="absolute -left-16 bottom-[18%] w-[120%] text-white/72"
      >
        <CloudSvg className="h-28 w-full md:h-36" />
      </div>

      <div
        data-cloud-layer
        className="absolute -right-24 bottom-[10%] w-[110%] text-white/52"
      >
        <CloudSvg className="h-24 w-full md:h-32" />
      </div>

      <div
        data-cloud-layer
        className="absolute -left-32 bottom-[2%] w-[130%] text-white/88"
      >
        <CloudSvg className="h-32 w-full md:h-44" />
      </div>

      <div
        data-cloud-layer
        className="absolute right-[-8%] bottom-[24%] w-[70%] text-white/38"
      >
        <CloudSvg className="h-20 w-full md:h-28" />
      </div>

      <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-white via-white/85 to-transparent" />
    </div>
  );
}

export function HeroBackground({ variant = "sky" }: HeroBackgroundProps) {
  if (variant === "photo") return <PhotoBackground />;
  return <SkyBackground />;
}
