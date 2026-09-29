"use client";
/* eslint-disable @next/next/no-img-element */
import { CLOUD, MAROON } from "./media";
import { useParallax } from "./useParallax";
import { useScrollReveal } from "./useScrollReveal";

type QA = { q: string; a: string };

const left: QA[] = [
  {
    q: "What is Joti?",
    a: "Joti (জ্যোতি — light, precision cue) is an AI-native ad-break engine for long-form Bengali drama on hoichoi. It watches every episode like an expert ad-ops director and answers three questions: WHERE can a break land, WHETHER it is warranted, and WHAT brand belongs there.",
  },
  {
    q: "How does Joti find the where?",
    a: "Candidates come from scene boundaries and intra-scene pauses only — never arbitrary timestamps. Each is snapped to the nearest ffmpeg acoustic silence and scored on pause, boundary quality and shot cuts. Anything inside dialogue is penalized or discarded. Mid-speech cuts never happen.",
  },
  {
    q: "How does Joti decide whether?",
    a: "A pacing engine enforces breaks per hour, minimum gaps, ad-load limits and protected opening and ending buffers, then picks greedily best-first. Every rejected candidate keeps its reason, and editors can re-pace a whole episode in seconds.",
  },
];

const right: QA[] = [
  {
    q: "How are brands matched?",
    a: "Two gates: a hard set-intersection block on negative contexts no model can talk around, then an LLM check of each brand's free-text safety rule. Rivals stay ±180s apart, survivors rank by scene affinity with a written rationale, and a house promo covers the rest.",
  },
  {
    q: "Who checks the machine?",
    a: "An independent judge model inspects the frames around every cut and vetoes jarring breaks or brand violations, with two rounds to recover. Anything borderline lands in a Needs Your Call queue for a human editor to approve, swap or remove.",
  },
  {
    q: "What do editors take away?",
    a: "Broadcast-ready IAB VMAP 1.0 with inline VAST 3.0 carrying every rationale, a full debug JSON audit trail, and an interactive player that cuts to ads and resumes. New brands register with zero code changes.",
  },
];

function Item({ qa, delay }: { qa: QA; delay: number }) {
  return (
    <div className="reveal" style={{ animationDelay: `${delay}s` }}>
      <p className="font-arsenica text-xs uppercase tracking-wide text-white sm:text-base">{qa.q}</p>
      <p className="font-inter mt-3 text-[11px] leading-relaxed text-white/60 sm:text-sm">{qa.a}</p>
    </div>
  );
}

export function QAndA() {
  const revealRef = useScrollReveal<HTMLDivElement>();
  const { ref: parallaxRef, progress } = useParallax<HTMLDivElement>();
  const y = 60 - progress * 30;

  return (
    <section ref={parallaxRef} className="relative overflow-hidden" style={{ backgroundColor: MAROON }}>
      <div ref={revealRef} className="relative z-20 px-4 pt-20 lg:px-28 lg:pt-32" style={{ paddingBottom: "50vh" }}>
        <h2 className="reveal flex items-baseline justify-center gap-1 text-4xl text-white sm:text-6xl lg:text-7xl">
          {"Q & A".split(" ").map((chunk, i) => (
            <span key={i} className="flex items-baseline gap-1">
              {chunk.split("").map((ch, j) => (
                <span
                  key={j}
                  className={
                    ch === "&"
                      ? "font-arsenica text-xl italic text-white/80 sm:text-3xl lg:text-4xl"
                      : "font-arsenica"
                  }
                >
                  {ch === " " ? "\u00A0" : ch}
                </span>
              ))}
            </span>
          ))}
        </h2>

        <div className="mt-16 grid gap-10 md:grid-cols-2 md:gap-20 lg:mt-24">
          <div className="space-y-12 lg:space-y-20">
            {left.map((qa, i) => (
              <Item key={qa.q} qa={qa} delay={0.12 + i * 0.12} />
            ))}
          </div>
          <div className="space-y-12 md:mt-24 lg:space-y-20">
            {right.map((qa, i) => (
              <Item key={qa.q} qa={qa} delay={0.12 + (left.length + i) * 0.12} />
            ))}
          </div>
        </div>
      </div>

      <img
        src={CLOUD}
        alt=""
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 z-10 w-full"
        style={{ transform: `translateY(${y}%)` }}
      />
    </section>
  );
}
