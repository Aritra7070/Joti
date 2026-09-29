"use client";
import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { QAndA } from "@/components/landing/QAndA";
import { QuoteBanner } from "@/components/landing/QuoteBanner";
import { Footer } from "@/components/landing/Footer";

export default function LandingPage() {
  return (
    <div className="gallery-page bg-black text-white min-h-screen">
      <Navbar />
      <Hero />

      {/* Painted cloud bank between the hero and the Q&A.
          Pure-CSS layer (the fog PNG is unreachable): seated just after the
          hero ends (slight kiss so the masks blend) with its body extending
          down into the maroon. Hero content stays above it, Q&A rises below
          it — no collisions. */}
      <div className="relative z-20 -mt-20 sm:-mt-24 md:-mt-28" aria-hidden>
        <div className="cloud-bank pointer-events-none h-48 w-full sm:h-60 md:h-72" />
      </div>

      {/* Q & A — tucked just under the cloud bank's soft base so the fog
          melts straight into the maroon with no gap */}
      <div id="qa" className="relative -mt-10 sm:-mt-12">
        <QAndA />
      </div>

      {/* Quote Banner */}
      <div id="quote">
        <QuoteBanner />
      </div>

      {/* Fixed bottom footer */}
      <Footer />
    </div>
  );
}
