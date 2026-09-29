"use client";
import { usePathname } from "next/navigation";

/**
 * Page shell. App pages are width-capped and inset; /showcase is a full-bleed
 * cinematic page and opts out of both.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (path === "/" || path.startsWith("/showcase")) return <>{children}</>;
  return <main className="mx-auto w-full max-w-[1320px] px-5 py-12 lg:px-6">{children}</main>;
}
