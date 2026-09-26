"use client";
import { useEffect, useState } from "react";
import { api, Job } from "@/lib/api";
import { EpisodeList } from "@/components/EpisodeList";

export default function Episodes() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  useEffect(() => {
    const load = () => api.jobs().then(setJobs).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-4xl">All episodes</h1>
        <p className="text-sm text-muted-foreground">{jobs ? `${jobs.length} analysed or in progress` : " "}</p>
      </div>
      <EpisodeList jobs={jobs} onRemoved={(id) => setJobs((s) => (s ?? []).filter((x) => x.id !== id))} />
    </div>
  );
}
