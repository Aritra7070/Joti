"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { Break, fmt } from "@/lib/api";
import { cn } from "cn";

/** Custom video player that honours the ad-break manifest: pauses at each cue
 *  point, plays the matched creative, then resumes content. Break markers live
 *  on the seek bar. */
export default function Player({ src, breaks, adSeconds, duration, seekTo }:
  { src: string; breaks: Break[]; adSeconds: number; duration: number; seekTo?: number | null }) {
  const wrap = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [ad, setAd] = useState<Break | null>(null);
  const [left, setLeft] = useState(0);
  const [useCard, setUseCard] = useState(false); // creative mp4 missing → colour card fallback
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [t, setT] = useState(0);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const played = useRef(new Set<string>());
  const lastT = useRef(0);

  function onTime() {
    const v = video.current; if (!v || ad) return;
    const now = v.currentTime; setT(now);
    const natural = now - lastT.current < 1.5 && now > lastT.current;
    lastT.current = now;
    if (!natural) return;
    const hit = breaks.find((b) => !played.current.has(b.id) && now >= b.time && now < b.time + 1.5);
    if (hit) { played.current.add(hit.id); v.pause(); setAd(hit); setLeft(adSeconds); setUseCard(false); }
  }

  useEffect(() => {
    if (!ad || !useCard) return; // with an mp4 creative, its onEnded resumes
    const i = setInterval(() => setLeft((s) => { if (s <= 1) { clearInterval(i); resume(); return 0; } return s - 1; }), 1000);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad, useCard]);

  const seek = useCallback((to: number) => {
    const v = video.current; if (!v) return;
    v.currentTime = Math.min(Math.max(0, to), duration); lastT.current = v.currentTime; setT(v.currentTime); v.play();
  }, [duration]);
  /** Jumping to a break on purpose re-arms it so the ad plays again. */
  const rearm = useCallback((from: number) => {
    for (const b of breaks) if (b.time >= from && b.time <= from + 6) played.current.delete(b.id);
  }, [breaks]);
  useEffect(() => { if (seekTo != null) { rearm(seekTo); seek(seekTo); } }, [seekTo, seek, rearm]);

  function resume() { setAd(null); video.current?.play(); }
  function toggle() { const v = video.current; if (!v || ad) return; v.paused ? v.play() : v.pause(); }
  function barTime(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * duration;
  }
  function fullscreen() { wrap.current?.requestFullscreen?.(); }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.code === "Space") { e.preventDefault(); toggle(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad]);

  const c = ad?.brand.creative ?? {};
  const adSrc = ad ? (ad.brand.creative_url ?? c.video_url ?? `/creatives/${ad.brand.id}.mp4`) : "";
  const pct = (x: number) => `${(x / duration) * 100}%`;

  return (
    <div ref={wrap} className="group relative aspect-video overflow-hidden border-2 border-foreground bg-black shadow-[var(--shadow-float)]">
      <video ref={video} src={src} className="h-full w-full" playsInline onClick={toggle} onTimeUpdate={onTime}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onVolumeChange={(e) => { setMuted(e.currentTarget.muted); setVolume(e.currentTarget.volume); }} />

      {!playing && !ad && (
        <button type="button" onClick={toggle} aria-label="Play" className="absolute inset-0 grid place-items-center">
          <span className="grid size-16 place-items-center border-2 border-black bg-primary text-primary-foreground shadow-[4px_4px_0_rgba(0,0,0,0.5)] transition hover:translate-x-0.5 hover:translate-y-0.5"><Play className="ml-1 size-7" fill="currentColor" /></span>
        </button>
      )}

      {ad && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center" style={{ background: c.bg ?? "#222", color: c.fg ?? "#fff" }}>
          {!useCard ? (
            <video src={adSrc} autoPlay className="absolute inset-0 h-full w-full object-contain" onEnded={resume} onError={() => setUseCard(true)} />
          ) : (
            <>
              <div className="mb-3 text-xs uppercase tracking-widest opacity-70">Advertisement · {ad.brand.category}</div>
              <div className="mb-3 text-5xl font-extrabold">{ad.brand.name}</div>
              <div className="text-xl opacity-90">{ad.brand.tagline}</div>
            </>
          )}
          <div className="absolute right-4 top-4 flex items-center gap-3 text-xs">
            {useCard && <span className="opacity-80">{left}s</span>}
            <button type="button" onClick={resume} className="border-2 border-white bg-black px-2.5 py-1 font-semibold uppercase tracking-wide text-white hover:bg-primary">Skip ad</button>
          </div>
        </div>
      )}

      {/* control bar */}
      <div className={cn("absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-3 pt-10 text-white transition-opacity",
        playing && !ad ? "opacity-0 group-hover:opacity-100" : "opacity-100", ad && "pointer-events-none opacity-0")}>
        <div className="relative mb-3 h-5 cursor-pointer" onClick={(e) => seek(barTime(e))}
          onMouseMove={(e) => setHoverT(barTime(e))} onMouseLeave={() => setHoverT(null)}>
          <div className="absolute inset-x-0 top-2 h-2 bg-white/25 transition-[height] group-hover:h-2.5" />
          <div className="absolute left-0 top-2 h-2 bg-white group-hover:h-2.5" style={{ width: pct(t) }} />
          {breaks.map((b) => (
            <button key={b.id} type="button" title={`${fmt(b.time)} · ${b.brand.name}`}
              onClick={(e) => { e.stopPropagation(); played.current.delete(b.id); seek(b.time - 4); }}
              className={cn("absolute top-0 h-5 w-1.5 transition hover:scale-x-150", played.current.has(b.id) ? "bg-success" : "bg-primary-foreground")}
              style={{ left: `calc(${pct(b.time)} - 3px)`, background: played.current.has(b.id) ? undefined : b.brand.creative?.bg ?? "#fff", outline: "1px solid rgba(255,255,255,.7)" }} />
          ))}
          {hoverT != null && (
            <span className="pointer-events-none absolute -top-6 -translate-x-1/2 border border-white bg-black px-1.5 py-0.5 font-mono text-[11px] text-white" style={{ left: pct(hoverT) }}>{fmt(hoverT)}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="rounded p-1 hover:bg-white/15">
            {playing ? <Pause className="size-5" fill="currentColor" /> : <Play className="size-5" fill="currentColor" />}
          </button>
          <span className="font-mono text-xs tabular-nums">{fmt(t)} <span className="opacity-60">/ {fmt(duration)}</span></span>
          <span className="ml-2 hidden text-xs opacity-70 sm:inline">{breaks.length} ad break{breaks.length === 1 ? "" : "s"} · markers are clickable</span>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" aria-label={muted ? "Unmute" : "Mute"} className="rounded p-1 hover:bg-white/15"
              onClick={() => { const v = video.current; if (v) v.muted = !v.muted; }}>
              {muted || volume === 0 ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
            </button>
            <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} aria-label="Volume"
              onChange={(e) => { const v = video.current; if (!v) return; v.volume = Number(e.target.value); v.muted = v.volume === 0; }}
              className="h-1 w-20 cursor-pointer accent-white" />
            <button type="button" onClick={fullscreen} aria-label="Fullscreen" className="rounded p-1 hover:bg-white/15"><Maximize className="size-5" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
