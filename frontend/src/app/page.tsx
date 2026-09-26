"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Upload } from "lucide-react";
import { api, Job } from "@/lib/api";
import { uploadToBlob, blobUploadsEnabled } from "@/lib/blob";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEFAULT_PACING, PacingControls } from "@/components/PacingControls";
import { EpisodeList } from "@/components/EpisodeList";
import { cn } from "cn";

const POINTS = [
  ["01", "It reads the scene", "Gemini watches the episode in five-minute chunks and returns every scene, its mood, who is speaking and when — tagged only from a fixed vocabulary."],
  ["02", "It marks the pause", "Scene boundaries and flagged pauses become candidates. Each is snapped to the nearest real silence from ffmpeg and scored for cut safety."],
  ["03", "It calls the brand", "A brand is placed only where its context fits and never beside what it must avoid. A second model audits the cut before it ships."],
];

export default function Home() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);
  const [rules, setRules] = useState<Record<string, number>>(DEFAULT_PACING);
  const [confirming, setConfirming] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Real figures from the caller's own completed analyses — never placeholder numbers.
  const done = (jobs ?? []).filter((j) => j.status === "done");
  const placed = done.reduce((n, j) => n + (j.breaks ?? 0), 0);
  const runtime = done.reduce((n, j) => n + (j.duration ?? 0), 0);
  const perHour = runtime > 0 ? (placed / runtime) * 3600 : 0;

  useEffect(() => { api.pacingDefaults().then(setRules).catch(() => {}); }, []);
  useEffect(() => {
    const load = () => api.jobs().then((j) => { setJobs(j); setErr(""); }).catch(() => setErr("Couldn't reach the API — retrying…"));
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  function openRules(e: React.FormEvent) {
    e.preventDefault();
    if (file || url) setConfirming(true);
  }

  async function submit() {
    setConfirming(false); setErr("");
    try {
      let job: Job;
      const name = title || (file ? file.name.replace(/\.\w+$/, "") : "");
      if (file) {
        if (await blobUploadsEnabled()) {
          setBusy("Uploading…");
          const publicUrl = await uploadToBlob(file, (p) => setBusy(`Uploading ${p}%`));
          job = await api.createFromUrl(publicUrl, name, rules);
        } else {
          setBusy("Uploading…");
          job = await api.upload(file, name, rules);
        }
      } else if (url) {
        setBusy("Starting…");
        job = await api.createFromUrl(url, name, rules);
      } else return;
      router.push(`/jobs/${job.id}`);
    } catch (e) { setErr(String(e)); } finally { setBusy(null); }
  }

  return (
    <div className="-mt-4 space-y-14">
      <section className="grid items-start gap-12 py-2 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-16">
        <div className="space-y-8">
          <div className="space-y-5">
            <span className="stamp">Context-aware ad breaks</span>
            <h1 className="rise rise-1 text-5xl leading-[0.9] md:text-6xl">
              It finds the pause.<br />
              <span className="text-primary">Then it calls it.</span>
            </h1>
            <p className="rise rise-2 max-w-lg text-muted-foreground">
              Joti watches an episode the way an editor would, then places every break where it belongs and explains why.
              Out comes a VMAP manifest, a decision report, and a preview you can play right here.
            </p>
          </div>

          {/* Figures computed from this account's own completed runs. */}
          <div className="rise rise-3 rule-red grid grid-cols-3 gap-4 pt-5">
            {[
              [String(done.length), "episodes analysed"],
              [String(placed), "breaks placed"],
              [perHour > 0 ? perHour.toFixed(1) : "—", "breaks per hour"],
            ].map(([n, label]) => (
              <div key={label}>
                <div className="numeral">{n}</div>
                <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={openRules} className="rise rise-4 boxed space-y-5 p-6">
          <span className="stamp bg-primary text-primary-foreground">Analyse an episode</span>
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); setFile(e.dataTransfer.files?.[0] ?? null); }}
            onClick={() => fileInput.current?.click()}
            className={cn("flex cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed border-foreground px-4 py-10 text-center text-sm transition-colors",
              drag ? "bg-accent" : "bg-background hover:bg-accent/60")}>
            <Upload className="size-5" strokeWidth={2} />
            {file ? (
              <><span className="font-semibold uppercase tracking-wide">{file.name}</span><span className="text-xs text-muted-foreground">{(file.size / 1e6).toFixed(0)} MB</span></>
            ) : (
              <><span className="font-semibold uppercase tracking-wide">Drop a video here</span><span className="text-xs text-muted-foreground">MP4 · a 25-minute episode takes about two minutes</span></>
            )}
            <input ref={fileInput} type="file" accept="video/mp4,video/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" placeholder="Episode title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="url">Video URL</Label>
            <Input id="url" placeholder="Paste a video link" value={url} onChange={(e) => setUrl(e.target.value)} disabled={!!file} />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={!!busy || (!file && !url)}>
            {busy ?? <>Analyse episode <ArrowRight data-icon="inline-end" /></>}
          </Button>
          {err && <p className="text-sm font-medium text-destructive">{err}</p>}
        </form>
      </section>

      {/* How it works — the numbered grid. */}
      <section className="rise rise-4 rule-red space-y-6 pt-8">
        <div className="flex items-baseline justify-between gap-4">
          <h2>How it works</h2>
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Three questions, three answers</span>
        </div>
        <ol className="grid gap-5 md:grid-cols-3">
          {POINTS.map(([n, title, body]) => (
            <li key={n} className="boxed space-y-3 p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-8 shrink-0 place-items-center border-2 border-foreground bg-primary font-mono text-xs font-bold text-primary-foreground">{n}</span>
                <h3>{title}</h3>
              </div>
              <p className="text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pacing rules for this episode</DialogTitle>
            <DialogDescription>How many breaks it may carry and where they may not go. You can change these afterwards and re-place in seconds.</DialogDescription>
          </DialogHeader>
          <PacingControls value={rules} onChange={setRules} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button onClick={submit}>Start analysis <ArrowRight data-icon="inline-end" /></Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section className="rise rise-5 space-y-4">
        <div className="flex items-baseline justify-between gap-4 rule-red pt-6">
          <h2>Episodes</h2>
          <span className="text-sm text-muted-foreground">{err.startsWith("Couldn") ? err : jobs?.length ? `${jobs.length} analysed or in progress` : ""}</span>
        </div>
        <EpisodeList jobs={jobs} limit={8} onRemoved={(id) => setJobs((s) => (s ?? []).filter((x) => x.id !== id))} />
      </section>
    </div>
  );
}
