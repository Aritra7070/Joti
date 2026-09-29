"use client";
/* eslint-disable @next/next/no-img-element */
import { BOTTOM_CLOUD, QUOTE_IMAGE } from "./media";
import { useParallax } from "./useParallax";
import { useScrollReveal } from "./useScrollReveal";

export function QuoteBanner() {
  const revealRef = useScrollReveal<HTMLDivElement>();
  const { ref, progress } = useParallax<HTMLDivElement>();
  const offset = progress * 80;

  return (
    <section ref={ref} className="relative flex min-h-screen items-center justify-center overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${QUOTE_IMAGE})` }}
        aria-hidden
      />

      <div
        ref={revealRef}
        className="relative z-20 flex w-full items-center justify-center px-6 lg:items-start lg:pt-[25vh]"
      >
        <blockquote className="reveal-scale max-w-xs font-arsenica text-xl leading-snug text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.3)] sm:max-w-2xl sm:text-3xl lg:max-w-2xl lg:text-5xl lg:leading-tight">
          &ldquo;Art, resilience and vision{" "}
          <em className="font-light italic">are more important than ever.</em>&rdquo;
        </blockquote>
      </div>

      <img
        src={BOTTOM_CLOUD}
        alt=""
        aria-hidden
        className="pointer-events-none absolute -bottom-16 left-0 z-10 w-full"
        style={{ transform: `translateY(${-offset}px)` }}
      />
    </section>
  );
}
