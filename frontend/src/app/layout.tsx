import type { Metadata } from "next";
import { Alfa_Slab_One, Inter, JetBrains_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Nav } from "@/components/Nav";
import { Shell } from "@/components/Shell";
import { JobWatcher } from "@/components/JobWatcher";
import { AuthGate } from "@/components/AuthGate";
import { Toaster } from "sonner";
import { CircleAlert, CircleCheck } from "lucide-react";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });
const display = Alfa_Slab_One({ subsets: ["latin"], weight: "400", variable: "--font-display" });

export const metadata: Metadata = {
  title: "Joti — Context-Aware Ad Placement",
  description: "A showcase honoring the makers, visionaries and creators who turned a hard season into something rare.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`}>
      <head>
        {/* Arsenica is a third-party CSS, not a Google font, so next/font cannot
            host it; both are loaded as plain stylesheets. The no-page-custom-font
            rule targets the Pages Router and does not apply here. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap" />
        <link rel="stylesheet" href="https://db.onlinewebfonts.com/c/cbb3cb559d2e4387e139cfb1656e31f5?family=Arsenica+Trial+Light" />
      </head>
      <body className="min-h-screen font-sans">
        <TooltipProvider>
          <AuthGate>
            <Nav />
            <Shell>{children}</Shell>
          </AuthGate>
          <JobWatcher />
          <Toaster position="bottom-right" closeButton offset={24} gap={12}
            icons={{ success: <CircleCheck className="size-7 text-success" strokeWidth={1.75} />, error: <CircleAlert className="size-7 text-destructive" strokeWidth={1.75} /> }}
            style={{ "--width": "440px", "--toast-close-button-start": "auto", "--toast-close-button-end": "8px", "--toast-close-button-transform": "translate(0, 6px)" } as React.CSSProperties}
            toastOptions={{
              classNames: {
                toast: "!rounded-none !border-2 !border-foreground !bg-card !text-foreground !shadow-[var(--shadow-float)] !p-4 !gap-3 font-sans !pr-9 [&_[data-icon]]:!size-7 [&_[data-icon]]:!shrink-0",
                title: "!text-sm !font-semibold !uppercase !tracking-wide",
                description: "!text-sm !text-muted-foreground",
                actionButton: "!h-8 !rounded-none !border-2 !border-foreground !bg-primary !px-3 !text-sm !font-semibold !uppercase !text-primary-foreground hover:!bg-primary/85",
                closeButton: "!size-6 !rounded-none !border-0 !bg-transparent !shadow-none !text-muted-foreground hover:!bg-transparent hover:!text-foreground",
              },
            }} />
        </TooltipProvider>
      </body>
    </html>
  );
}
