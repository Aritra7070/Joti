"use client";
import { Aperture, BarChart3 } from "lucide-react";

/** Brand glyphs (Facebook/Twitter/Linkedin) were removed from lucide-react upstream
 * (verified: exports are undefined in the installed v1.48), so only these three
 * use minimal inline SVGs. Everything else is lucide-only per spec. */
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06C2 17.08 5.66 21.25 10.44 22v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.49-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.44 2.91h-2.34V22C18.34 21.25 22 17.08 22 12.06Z" />
    </svg>
  );
}

function TwitterIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M18.9 2.3h3.3l-7.2 8.2 8.5 11.2h-6.7l-5.2-6.9-6 6.9H2.3l7.7-8.8L1.9 2.3h6.8l4.7 6.3 5.5-6.3Zm-1.2 17.5h1.9L6.4 4.1H4.4l13.3 15.7Z" />
    </svg>
  );
}

function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M4.98 3.5A2.5 2.5 0 1 0 5 8.5a2.5 2.5 0 0 0 0-5ZM3 9.5h4V21H3V9.5Zm7 0h3.8v1.6h.06c.53-1 1.83-2.06 3.77-2.06C21.4 9 22 11.3 22 14v7h-4v-6.2c0-1.48-.03-3.4-2.07-3.4-2.07 0-2.39 1.62-2.39 3.29V21h-4V9.5Z" />
    </svg>
  );
}

const textLink =
  "text-[9px] sm:text-[10px] uppercase font-medium tracking-[0.15em] sm:tracking-[0.25em] text-white/80 hover:text-white transition-colors cursor-pointer";
const iconLink = "text-white/80 hover:text-white transition-colors cursor-pointer";

export function Footer() {
  return (
    <footer className="fixed bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-black/40 to-transparent">
      <div className="flex items-center justify-between px-3 py-2.5 sm:px-10 sm:py-4">
        <div className="flex items-center gap-4 sm:gap-6">
          <a href="#" aria-label="Facebook" className={iconLink}>
            <FacebookIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </a>
          <a href="#" aria-label="Twitter" className={iconLink}>
            <TwitterIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </a>
          <a href="#" aria-label="LinkedIn" className={iconLink}>
            <LinkedinIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </a>
          <span className={`${textLink} hidden sm:inline`}>
            Privacy Notice
          </span>
        </div>

        <div className="flex items-center gap-4 sm:gap-6">
          <span className={`${textLink} hidden sm:inline`}>
            Terms &amp; Policies
          </span>
          <BarChart3 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white/80 hover:text-white transition-colors" strokeWidth={1.5} aria-hidden />
          <Aperture className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white/80 hover:text-white transition-colors" strokeWidth={1.5} aria-hidden />
        </div>
      </div>
    </footer>
  );
}
