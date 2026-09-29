"use client";
import { useEffect, useRef } from "react";

const SELECTOR = ".reveal, .reveal-scale";

/**
 * IntersectionObserver hook that finds all `.reveal` and `.reveal-scale` elements
 * within a ref, and adds the `.revealed` class when they enter view.
 * Default threshold: 0.15, rootMargin: '0px 0px -40px 0px'.
 * Once revealed, unobserves the element.
 *
 * A MutationObserver also watches for late-added nodes (Fast Refresh edits or
 * dynamic content swap the DOM without remounting — nodes added after mount
 * would otherwise stay invisible forever), observing them or revealing them
 * immediately when already in view.
 */
export function useScrollReveal<T extends HTMLElement>(threshold = 0.15) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const revealEl = (el: HTMLElement) => {
      el.classList.add("revealed");
    };
    const revealAll = () => {
      root.querySelectorAll<HTMLElement>(SELECTOR).forEach(revealEl);
    };
    const inView = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canObserve = !reduced && typeof IntersectionObserver !== "undefined";
    if (!canObserve) revealAll();

    let io: IntersectionObserver | null = null;
    if (canObserve) {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            revealEl(entry.target as HTMLElement);
            observer.unobserve(entry.target);
          }
        },
        { threshold, rootMargin: "0px 0px -40px 0px" }
      );
      io = observer;
      root.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => observer.observe(el));
    }

    // Catch nodes added after mount (see docstring): reveal immediately when
    // in view, otherwise hand them to the observer.
    let mo: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined") {
      mo = new MutationObserver((mutations) => {
        for (const m of mutations) {
          m.addedNodes.forEach((node) => {
            if (!(node instanceof HTMLElement)) return;
            const els = node.matches(SELECTOR)
              ? [node]
              : Array.from(node.querySelectorAll<HTMLElement>(SELECTOR));
            for (const el of els) {
              if (el.classList.contains("revealed")) continue;
              if (!canObserve || inView(el)) revealEl(el);
              else io?.observe(el);
            }
          });
        }
      });
      mo.observe(root, { childList: true, subtree: true });
    }

    const failsafe = window.setTimeout(revealAll, 2500);
    return () => {
      window.clearTimeout(failsafe);
      io?.disconnect();
      mo?.disconnect();
    };
  }, [threshold]);

  return ref;
}
