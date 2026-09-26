"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Trash2 } from "lucide-react";
import { api, Job, fmt } from "@/lib/api";
import { etaLabel, stageLabel } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { deleteFromBlob } from "@/lib/blob";

const when = (ts: number) =>
  new Date(ts * 1000).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function EpisodeList({ jobs, limit, onRemoved }: { jobs: Job[] | null; limit?: number; onRemoved: (id: string) => void }) {
  const [pending, setPending] = useState<Job | null>(null);
  if (jobs === null) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading episodes…</p>;
  const shown = limit ? jobs.slice(0, limit) : jobs;
  if (jobs.length === 0) return <p className="text-sm text-muted-foreground">No episodes yet. Analyse one to see it here.</p>;
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="text-[11px] font-semibold uppercase tracking-[0.14em]">
            <TableHead className="pl-0">Episode</TableHead>
            <TableHead className="w-24">Duration</TableHead>
            <TableHead className="w-20">Breaks</TableHead>
            <TableHead className="w-40">Added</TableHead>
            <TableHead className="w-44">Status</TableHead>
            <TableHead className="w-10 pr-0" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((j) => (
            <TableRow key={j.id} className="group">
              <TableCell className="pl-0">
                <Link href={`/jobs/${j.id}`} className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-wide hover:text-primary hover:underline">
                  {j.title}<ArrowRight className="size-3.5 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                </Link>
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{j.duration ? fmt(j.duration) : "—"}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{j.breaks ?? "—"}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{when(j.created_at)}</TableCell>
              <TableCell><Status job={j} /></TableCell>
              <TableCell className="pr-0 text-right">
                <Button variant="ghost" size="icon" aria-label="Remove" className="opacity-0 transition group-hover:opacity-100" onClick={() => setPending(j)}><Trash2 /></Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {limit && jobs.length > limit && (
        <div className="pt-4">
          <Link href="/episodes" className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline">
            View all {jobs.length} episodes <ArrowRight className="size-3.5" />
          </Link>
        </div>
      )}
      <ConfirmDialog open={!!pending} title={`Remove "${pending?.title}"?`}
        description="The analysis, placements and the uploaded video will be deleted."
        onClose={() => setPending(null)}
        onConfirm={() => { if (pending) api.deleteJob(pending.id).then(() => { onRemoved(pending.id); deleteFromBlob(pending.video_url); }); }} />
    </>
  );
}

function Status({ job }: { job: Job }) {
  if (job.status === "done") return <span className="stamp border-success text-success">Ready</span>;
  if (job.status === "error") return <span className="stamp border-destructive text-destructive">Failed</span>;
  return (
    <div className="flex items-center gap-2">
      <Progress value={job.progress ?? 0} className="w-16" />
      <span className="text-xs text-muted-foreground">{Math.round(job.progress ?? 0)}% · {job.eta_seconds != null ? etaLabel(job.eta_seconds) : stageLabel[job.stage ?? "queued"] ?? job.stage}</span>
    </div>
  );
}
