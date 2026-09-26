"use client";
import { useState } from "react";
import { Break, Candidate, Scene, fmt } from "@/lib/api";
import { moodColor } from "@/lib/copy";
import { Badge } from "@/components/ui/badge";

export default function Timeline({ scenes, breaks, candidates, duration, onSeek }:
  { scenes: Scene[]; breaks: Break[]; candidates: Candidate[]; duration: number; onSeek?: (t: number) => void }) {
  const [hover, setHover] = useState<Scene | null>(null);
  const pct = (t: number) => `${(t / duration) * 100}%`;
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{scenes.length} scenes · {candidates.length} candidate cuts · {breaks.length} breaks placed</p>
      <div className="relative h-12 overflow-hidden border-2 border-foreground bg-card">
        {scenes.map((s) => (
          <div key={s.id} className="absolute top-0 h-full cursor-pointer border-r-2 border-foreground/50 transition hover:brightness-95"
            style={{ left: pct(s.start), width: pct(s.end - s.start), background: moodColor[s.mood] ?? "var(--muted-foreground)", opacity: s.sensitive ? 0.9 : 0.75 }}
            onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(null)} onClick={() => onSeek?.(s.start)} />
        ))}
        {candidates.map((c) => (
          <div key={c.id} className="absolute bottom-0 h-2.5 w-px bg-foreground/40" style={{ left: pct(c.time) }} />
        ))}
        {breaks.map((b) => (
          <div key={b.id} className={b.status === "review" ? "absolute top-0 h-full w-1.5 bg-warning" : "absolute top-0 h-full w-1.5 bg-foreground"} style={{ left: pct(b.time) }} title={`${fmt(b.time)} · ${b.brand.name}${b.status === "review" ? " · needs review" : ""}`} />
        ))}
      </div>
      <div className="min-h-16 text-sm">
        {hover ? (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold uppercase tracking-wide">{hover.title}</span>
              <span className="font-mono text-xs text-muted-foreground">{fmt(hover.start)}–{fmt(hover.end)}</span>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2" style={{ background: moodColor[hover.mood] ?? "var(--muted-foreground)" }} />
                {hover.mood}
              </span>
              {hover.sensitive && <span className="stamp border-destructive text-destructive">Sensitive</span>}
              {hover.promotion && <span className="stamp border-warning text-warning">Promotes {hover.promotion.brand}</span>}
            </div>
            <p className="text-muted-foreground">{hover.summary}</p>
            <div className="flex flex-wrap gap-1">{hover.tags.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}</div>
          </div>
        ) : (
          <p className="text-muted-foreground">Hover a scene for its summary and context tags. Colour is mood; dark bars are placed breaks, amber bars need your call, faint ticks are every cut that was considered.</p>
        )}
      </div>
    </div>
  );
}
