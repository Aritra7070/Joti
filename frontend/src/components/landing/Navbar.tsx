"use client";
import Link from "next/link";

function Logo() {
  return (
    <Link href="/" aria-label="Joti" className="group mx-2 block transition-transform duration-300 hover:scale-110">
      <svg viewBox="0 0 256 256" className="h-5 w-5 fill-white sm:h-7 sm:w-7" aria-hidden>
        <path d="M 64 128 L 64.5 128 L 32 95 L 0 64 L 0 0 L 64 0 L 128 64 L 128 64.5 L 161 32 L 192 0 L 256 0 L 256 64 L 192 128 L 128 128 L 128 192 L 96 223 L 63.5 256 L 0 256 L 0 192 Z M 256 192 L 224 223 L 191.5 256 L 128 256 L 128 192 L 192 128 L 256 128 Z" />
      </svg>
    </Link>
  );
}

export function Navbar() {
  const item =
    "text-[10px] sm:text-xs uppercase font-medium tracking-[0.15em] sm:tracking-[0.2em] text-white/85 hover:text-white transition-colors";

  return (
    <header className="fixed left-1/2 top-4 z-50 -translate-x-1/2 sm:top-6">
      <nav className="liquid-glass flex items-center gap-4 rounded-full px-4 py-2.5 sm:gap-12 sm:px-10 sm:py-3">
        <Link href="/episodes" className={item}>Episodes</Link>
        <Link href="/brands" className={item}>Brands</Link>
        <Logo />
        <a href="#qa" className={item}>Journal</a>
        <a href="#quote" className={item}>Story</a>
      </nav>
    </header>
  );
}
