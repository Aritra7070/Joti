"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clapperboard, LogOut } from "lucide-react";
import { PUBLIC_ROUTES, clearSession, getUsername } from "@/lib/auth";
import { cn } from "cn";

const links = [
  { href: "/", label: "Episodes" },
  { href: "/brands", label: "Brands" },
];

export function Nav() {
  const path = usePathname();
  if (PUBLIC_ROUTES.includes(path)) return null;
  const username = getUsername();
  return (
    <header className="sticky top-0 z-20 border-b-2 border-foreground bg-background">
      <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-8 px-5 lg:px-6">
        <Link href="/" className="flex items-center gap-2">
          <Clapperboard className="size-5" strokeWidth={2} />
          <span className="display text-2xl leading-none">Joti</span>
        </Link>
        <nav className="ml-auto flex h-16 items-stretch gap-6 text-sm">
          {links.map((l) => {
            const active = l.href === "/" ? path === "/" || path.startsWith("/jobs") : path.startsWith(l.href);
            return (
              <Link key={l.href} href={l.href}
                className={cn("flex items-center border-b-2 pt-0.5 font-semibold uppercase tracking-wide",
                  active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                {l.label}
              </Link>
            );
          })}
          <span className="ml-4 hidden items-center gap-3 border-l-2 border-foreground pl-4 text-muted-foreground sm:flex">
            <span className="font-semibold uppercase tracking-wide">{username}</span>
            <button type="button" title="Sign out" aria-label="Sign out" className="hover:text-foreground"
              onClick={() => { clearSession(); window.location.assign("/login"); }}><LogOut className="size-4" /></button>
          </span>
        </nav>
      </div>
    </header>
  );
}
