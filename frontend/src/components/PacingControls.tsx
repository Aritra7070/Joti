"use client";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

export const PACING_FIELDS: { key: string; label: string; min: number; max: number; step: number; unit?: string }[] = [
  { key: "max_breaks_per_hour", label: "Breaks per hour", min: 1, max: 12, step: 1 },
  { key: "min_gap_seconds", label: "Minimum gap", min: 60, max: 900, step: 30, unit: "s" },
  { key: "max_ad_load_pct", label: "Ad load", min: 2, max: 25, step: 1, unit: "%" },
  { key: "ad_duration_seconds", label: "Ad length", min: 10, max: 60, step: 5, unit: "s" },
  { key: "min_cut_safety", label: "Minimum cut safety", min: 0.3, max: 0.9, step: 0.05 },
];

export const DEFAULT_PACING: Record<string, number> = {
  max_breaks_per_hour: 6, min_gap_seconds: 300, max_ad_load_pct: 10, ad_duration_seconds: 20, min_cut_safety: 0.55,
};

export function PacingControls({ value, onChange }: { value: Record<string, number>; onChange: (v: Record<string, number>) => void }) {
  return (
    <div className="space-y-5">
      {PACING_FIELDS.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>{f.label}</Label>
            <span className="font-mono text-sm text-muted-foreground">{value[f.key]}{f.unit ?? ""}</span>
          </div>
          <Slider min={f.min} max={f.max} step={f.step} value={[value[f.key] ?? f.min]}
            onValueChange={(v) => onChange({ ...value, [f.key]: Array.isArray(v) ? v[0] : v })} />
        </div>
      ))}
    </div>
  );
}
