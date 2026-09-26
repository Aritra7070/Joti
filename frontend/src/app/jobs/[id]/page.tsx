"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, Check, ChevronDown, CircleHelp, Download, FileJson, RefreshCw, ShieldCheck, X } from "lucide-react";
import { api, authedUrl, Job, Scene, fmt, mediaUrl } from "@/lib/api";
import { STAGES, blockLabel, etaLabel, matchLabel, sourceLabel, stageLabel } from "@/lib/copy";
import Player from "@/components/Player";
import Timeline from "@/components/Timeline";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { PacingControls } from "@/components/PacingControls";
import { cn } from "cn";

const sectionLabel = "stamp";

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [err, setErr] = useState("");
  const [pacing, setPacing] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [seekTo, setSeekTo] = useState<number | null>(null);

  const load = useCallback(() => api.job(id).then(setJob).catch((e) => setErr(String(e))), [id]);
  useEffect(() => {
    load();
    const t = setInterval(() => { if (!job || job.status === "running" || job.status === "queued") load(); }, 3000);
    return () => clearInterval(t);
  }, [load, job?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(breakId: string, action: "approve" | "remove") {
    try { setJob(await api.decide(id, breakId, action)); } catch (e) { setErr(String(e)); }
  }

  async function replace() {
    setBusy(true);
    try { setJob(await api.place(id, pacing)); } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }

  if (err) return <p className="text-destructive">{err}</p>;
  if (!job) return <p className="text-muted-foreground">Loading…</p>;
  const a = job.analysis, r = job.result;
  const scenesById: Record<string, Scene> = Object.fromEntries((a?.scenes ?? []).map((s) => [s.id, s]));
  const p = { ...(r?.pacing ?? {}), ...pacing };
  const stageIdx = STAGES.indexOf((job.stage ?? "") as typeof STAGES[number]);

  // The flagged cut: the first break held for a human call, else the first candidate a rule ruled out.
  const flagged = r ? (r.breaks.find((b) => b.status === "review") ?? null) : null;
  const firstBlocked = r?.rejected.length ? [...r.rejected].sort((x, y) => x.time - y.time)[0] : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1>{job.title}</h1>
        {a && <span className="text-sm text-muted-foreground">{fmt(a.media.duration)} · {a.media.width}×{a.media.height}</span>}
        {r && (
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" nativeButton={false} render={<a href={authedUrl(`/jobs/${id}/vmap.xml`)} target="_blank" rel="noreferrer" />}>
              <Download data-icon="inline-start" /> VMAP manifest
            </Button>
            <Button variant="outline" size="sm" nativeButton={false} render={<a href={authedUrl(`/jobs/${id}/debug.json`)} target="_blank" rel="noreferrer" />}>
              <FileJson data-icon="inline-start" /> Decision report
            </Button>
          </div>
        )}
      </div>

      {job.status !== "done" && (
        <section className="max-w-3xl space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-medium">{job.status === "error" ? "Analysis failed" : "Analysing"}</h2>
            <p className="text-sm text-muted-foreground">
              {job.status === "error" ? job.message : <>{job.message || stageLabel[job.stage ?? "queued"]}<span className="mx-2">·</span><span className="font-mono">{Math.round(job.progress ?? 0)}%</span>{job.eta_seconds != null && <span className="mx-2">·</span>}{etaLabel(job.eta_seconds)}</>}
            </p>
          </div>
          {job.status !== "error" && <Progress value={job.progress ?? 0} />}
          <ol className="grid gap-2 sm:grid-cols-5">
            {STAGES.map((s, i) => {
              const state = job.status === "error" ? "idle" : i < stageIdx ? "done" : i === stageIdx ? "active" : "idle";
              return (
                <li key={s} className={cn("flex items-center gap-2 text-sm", state === "idle" && "text-muted-foreground")}>
                  <span className={cn("grid size-5 place-items-center rounded-full border text-[10px]",
                    state === "done" && "border-foreground bg-foreground text-background", state === "active" && "border-foreground")}>
                    {state === "done" ? <Check className="size-3" /> : i + 1}
                  </span>
                  {stageLabel[s]}
                </li>
              );
            })}
          </ol>
          {job.status === "error" && (
            <Button size="sm" onClick={() => api.retry(id).then(setJob).catch((e) => setErr(String(e)))}><RefreshCw data-icon="inline-start" /> Retry</Button>
          )}
        </section>
      )}

      {a && r && (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* main column */}
          <div className="space-y-8">
            {/* The flagged cut — the callout card, mirroring a claimed statement under scrutiny. */}
            {(flagged || firstBlocked) && (
              <section className="border-2 border-primary bg-card p-5 shadow-[6px_6px_0_var(--foreground)]">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="stamp border-primary bg-primary text-primary-foreground">The flagged cut</span>
                  <button type="button" onClick={() => setSeekTo((flagged?.time ?? firstBlocked!.time) - 4)}
                    className="font-mono text-sm font-bold text-primary underline-offset-4 hover:underline">
                    {fmt(flagged?.time ?? firstBlocked!.time)}
                  </button>
                </div>
                {flagged ? (
                  <>
                    <p className="display mt-4 text-xl leading-tight">
                      {fmt(flagged.time)} held back — {flagged.review_reason}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Cut safety {flagged.cut_safety.toFixed(2)}. {scenesById[flagged.scene_before]?.title} → {scenesById[flagged.scene_after]?.title}. Not inserted until you say so.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="display mt-4 text-xl leading-tight">
                      {fmt(firstBlocked!.time)} was ruled out — {firstBlocked!.rejected_because}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Cut safety {firstBlocked!.cut_safety.toFixed(2)} of a possible 1.00, on the boundary between{" "}
                      {scenesById[firstBlocked!.scene_before]?.title} and {scenesById[firstBlocked!.scene_after]?.title}.
                      This one never became a break.
                    </p>
                  </>
                )}
              </section>
            )}

            {job.video_url && <Player src={mediaUrl(job.video_url)} breaks={r.breaks.filter((b) => b.status !== "review")} adSeconds={r.pacing.ad_duration_seconds} duration={a.media.duration} seekTo={seekTo} />}

            <section className="space-y-3">
              <p className={sectionLabel}>Scenes</p>
              <Timeline scenes={a.scenes} breaks={r.breaks} candidates={r.candidates} duration={a.media.duration} onSeek={setSeekTo} />
            </section>

            <section className="space-y-4">
              <div className="flex items-baseline justify-between">
                <p className={sectionLabel}>Ad breaks</p>
                <span className="text-xs text-muted-foreground">{r.breaks.filter((b) => b.status !== "review").length} placed{r.breaks.some((b) => b.status === "review") ? ` · ${r.breaks.filter((b) => b.status === "review").length} to review` : ""}</span>
              </div>
              {r.breaks.length === 0 && <p className="text-sm text-muted-foreground">No break met the rules for this episode.</p>}
              <div className="divide-y divide-foreground/25">
                {r.breaks.map((b) => {
                  const blocked = b.brand_rows.filter((x) => x.blocked_by.length);
                  return (
                    <article key={b.id} className="grid gap-x-8 gap-y-2 py-5 first:pt-0 sm:grid-cols-[110px_minmax(0,1fr)]">
                      <div className="space-y-1">
                        <button type="button" onClick={() => setSeekTo(b.time - 4)} className="font-mono text-lg font-semibold hover:underline">{fmt(b.time)}</button>
                        <p className="text-xs text-muted-foreground">{sourceLabel[b.source] ?? b.source}</p>
                        <p className="font-mono text-xs text-muted-foreground">safety {b.cut_safety.toFixed(2)}</p>
                      </div>
                      <div className="space-y-2">
                        {b.status === "review" && (
                          <div className="flex flex-wrap items-start gap-2 border-2 border-warning bg-warning/15 px-3 py-2 text-sm">
                            <CircleHelp className="mt-0.5 size-4 shrink-0 text-warning" />
                            <span className="flex-1"><span className="font-medium">Needs your call</span> — {b.review_reason}</span>
                            <span className="flex gap-1.5">
                              <Button size="xs" onClick={() => decide(b.id, "approve")}><Check data-icon="inline-start" /> Insert</Button>
                              <Button size="xs" variant="outline" onClick={() => decide(b.id, "remove")}><X data-icon="inline-start" /> Reject</Button>
                            </span>
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md px-2 py-0.5 text-sm font-semibold" style={{ background: b.brand.creative?.bg, color: b.brand.creative?.fg }}>{b.brand.name}</span>
                          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            {scenesById[b.scene_before]?.title} <ArrowRight className="size-3.5" /> {scenesById[b.scene_after]?.title}
                          </span>
                          {b.status !== "review" && (
                            <Button size="xs" variant="outline" className="ml-auto" onClick={() => decide(b.id, "remove")}>
                              <X data-icon="inline-start" /> Remove break
                            </Button>
                          )}
                        </div>
                        <p className="text-sm">{b.rationale}</p>
                        <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[130px_1fr]">
                          <dt className="text-muted-foreground">Why this cut</dt><dd>{b.reasons.join(" · ")}</dd>
                          <dt className="text-muted-foreground">Selection</dt><dd>{matchLabel[b.match_method] ?? b.match_method}</dd>
                          {b.promotions_nearby && b.promotions_nearby.length > 0 && (<>
                            <dt className="text-muted-foreground">In-content promotion nearby</dt>
                            <dd>{b.promotions_nearby.map((p) => `${p.brand} (${p.categories.join(", ")})`).join("; ")} — competing brands were kept out of this slot</dd>
                          </>)}
                          {blocked.length > 0 && (<>
                            <dt className="text-muted-foreground">Blocked here</dt>
                            <dd>{blocked.map((x) => `${x.brand_id} (${x.blocked_by.map(blockLabel).join(", ")})`).join(", ")}</dd>
                          </>)}
                          {b.judge && (<>
                            <dt className="text-muted-foreground">Independent review</dt>
                            <dd className="flex flex-wrap items-center gap-1.5">
                              <ShieldCheck className="size-3.5 text-success" />
                              <span>cut {b.judge.cut_verdict}, brand {b.judge.brand_verdict}</span>
                              <span className="text-muted-foreground">— {b.judge.notes}</span>
                            </dd>
                          </>)}
                        </dl>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <Collapsible>
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 border-t-2 border-foreground pt-5 text-left">
                <div>
                  <p className={sectionLabel}>Other cuts considered</p>
                  <p className="mt-1 text-sm text-muted-foreground">{r.rejected.length} candidates and the rule that ruled each one out</p>
                </div>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-4 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
                  {[...r.rejected].sort((x, y) => x.time - y.time).map((c) => (
                    <div key={c.id} className="flex gap-3">
                      <button type="button" className="w-12 shrink-0 text-left font-mono text-xs hover:underline" onClick={() => setSeekTo(c.time - 3)}>{fmt(c.time)}</button>
                      <span className="text-muted-foreground">{c.rejected_because}</span>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* side column: no box, sticky */}
          <aside className="boxed space-y-6 p-5 self-start lg:sticky lg:top-24">
            <div className="space-y-1.5">
              <p className={sectionLabel}>Pacing rules</p>
              <p className="text-sm text-muted-foreground">Whether a break is warranted. Re-placing reuses the analysis and takes seconds.</p>
            </div>
            <PacingControls value={p} onChange={(v) => setPacing({ ...pacing, ...v })} />
            <Button className="w-full" onClick={replace} disabled={busy}><RefreshCw data-icon="inline-start" className={busy ? "animate-spin" : ""} /> {busy ? "Re-placing…" : "Re-run placement"}</Button>
          </aside>
        </div>
      )}
    </div>
  );
}
