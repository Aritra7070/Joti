/** Plain-language labels for machine values coming from the API. */

export const stageLabel: Record<string, string> = {
  queued: "Queued",
  download: "Downloading video",
  probe: "Reading media",
  silence: "Mapping silences",
  shots: "Detecting shot changes",
  upload: "Uploading to the vision model",
  gemini: "Analysing scenes",
  placement: "Placing breaks",
  done: "Done",
};

export const STAGES = ["download", "silence", "upload", "gemini", "placement"] as const;

export const sourceLabel: Record<string, string> = {
  scene_boundary: "Scene boundary",
  pause_point: "Natural pause",
};

export const matchLabel: Record<string, string> = {
  llm: "Chosen by the matcher",
  tag_affinity: "Chosen by context affinity",
  fallback: "House promo (all brands blocked)",
};

export function blockLabel(reason: string): string {
  if (reason === "llm:negative_description") return "brand rule";
  if (reason.startsWith("judge:")) return `judge: ${reason.slice(6)}`;
  return reason;
}

export const moodColor: Record<string, string> = {
  joyful: "var(--chart-1)", warm: "var(--chart-2)", comic: "var(--chart-5)", romantic: "var(--chart-4)",
  neutral: "var(--muted-foreground)", dramatic: "var(--chart-3)", tense: "var(--chart-3)",
  suspenseful: "var(--chart-4)", sad: "var(--chart-5)", grim: "var(--destructive)",
};

export function etaLabel(sec?: number | null): string {
  if (sec == null) return "";
  if (sec < 60) return "under a minute left";
  const m = Math.round(sec / 60);
  return `about ${m} min left`;
}
