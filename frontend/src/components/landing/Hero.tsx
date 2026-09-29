"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { HERO_VIDEO, DOVE } from "./media";

/**
 * Individual animated dove. Each dove floats across the hero section on its own
 * path using CSS keyframes defined in globals.css.
 */
function FlyingDove({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <img
      src={DOVE}
      alt=""
      aria-hidden
      className={`pointer-events-none absolute z-30 select-none ${className ?? ""}`}
      style={style}
    />
  );
}

export function Hero() {
  return (
    <section className="relative flex h-screen w-full items-center justify-center overflow-hidden">
      <video
        className="absolute inset-0 h-full w-full object-cover"
        src={HERO_VIDEO}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 bg-black/35" />

      {/* Flying doves scattered across the hero */}
      <FlyingDove
        className="w-20 sm:w-28 lg:w-36 dove-fly-1"
        style={{ top: "12%", left: "8%" }}
      />
      <FlyingDove
        className="w-14 sm:w-20 lg:w-24 dove-fly-2"
        style={{ top: "25%", right: "12%" }}
      />
      <FlyingDove
        className="w-16 sm:w-24 lg:w-32 dove-fly-3"
        style={{ top: "55%", right: "5%" }}
      />

      <div className="relative z-20 px-4 pb-[14vh] text-center text-white sm:pb-[18vh]">
        <div
          className="hero-fade-up text-xs font-medium uppercase tracking-[0.35em] text-white/90 sm:text-sm"
          style={{ animationDelay: "0.1s" }}
        >
          Context-Aware
        </div>
        <div
          className="hero-fade-up text-[10px] font-light uppercase tracking-[0.4em] text-white/70 sm:text-xs"
          style={{ animationDelay: "0.1s" }}
        >
          Ad Placement
        </div>

        <h1
          className="hero-fade-up mt-6 text-5xl leading-[1.05] tracking-wide drop-shadow-[0_2px_24px_rgba(0,0,0,0.25)] sm:text-[5rem] lg:text-[7rem]"
          style={{ animationDelay: "0.25s" }}
        >
          <span className="font-arsenica block">JOTI</span>
          <span className="font-inter block font-semibold tracking-tight">জ্যোতি</span>
        </h1>

        <p
          className="hero-fade-up font-arsenica mx-auto mt-8 max-w-xl text-sm leading-relaxed text-white/90 drop-shadow-[0_2px_16px_rgba(0,0,0,0.25)] sm:text-xl"
          style={{ animationDelay: "0.4s" }}
        >
          A showcase honoring the makers, visionaries and creators who turned a hard season into something rare.
        </p>

        <div className="hero-fade-up mt-10" style={{ animationDelay: "0.55s" }}>
          <Link
            href="/episodes"
            className="liquid-glass font-inter inline-block rounded-[50%] px-10 py-5 text-[10px] font-medium uppercase tracking-[0.25em] text-white transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_0_30px_rgba(255,255,255,0.15)] active:scale-[0.98] sm:px-12 sm:py-6 sm:text-xs"
          >
            Analyze an Episode
          </Link>
        </div>
      </div>
    </section>
  );
}
