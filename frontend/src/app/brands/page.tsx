"use client";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { api, Brand } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "cn";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const empty: Brand = { id: "", name: "", category: "", tagline: "", target_contexts: [], negative_contexts: [], negative_description: "", creative: { bg: "#334155", fg: "#f8fafc" } };

export default function Brands() {
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [b, setB] = useState<Brand>(empty);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [view, setView] = useState<Brand | null>(null);
  const [pending, setPending] = useState<Brand | null>(null);
  useEffect(() => {
    api.brands().then((c) => setBrands(c.brands)).catch(() => setMsg("Couldn't reach the API — retrying…"));
    api.vocab().then((v) => { setTags(v.tags); setCategories(v.categories ?? []); }).catch(() => {});
    const t = setInterval(() => api.brands().then((c) => { setBrands(c.brands); setMsg((m) => (m.startsWith("Couldn't") ? "" : m)); }).catch(() => {}), 5000);
    return () => clearInterval(t);
  }, []);

  const toggle = (k: "target_contexts" | "negative_contexts", t: string) =>
    setB({ ...b, [k]: b[k].includes(t) ? b[k].filter((x) => x !== t) : [...b[k], t] });

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const id = b.id || b.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const c = await api.addBrand({ ...b, id });
      setBrands(c.brands); setB(empty); setOpen(false);
      setMsg(`${b.name} added. Re-run placement on any episode to see it considered.`);
    } catch (e) { setMsg(String(e)); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1>Brand catalogue</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Each brand says which moments suit it and which it must stay away from. Add one here and it is considered the next time you place breaks.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus data-icon="inline-start" /> Add brand</Button>
      </div>

      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}

      <div className="overflow-hidden border-y">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="h-auto py-3 pl-6 text-xs font-medium text-muted-foreground uppercase tracking-wide">Brand</TableHead>
              <TableHead className="h-auto py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Category</TableHead>
              <TableHead className="h-auto py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Target contexts</TableHead>
              <TableHead className="h-auto py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Hard blocks</TableHead>
              <TableHead className="h-auto w-12 py-3 pr-6" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {brands === null && (
              <TableRow><TableCell colSpan={5} className="py-6 pl-6 text-sm text-muted-foreground"><span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Loading brands…</span></TableCell></TableRow>
            )}
            {(brands ?? []).map((x) => (
              <TableRow key={x.id} className="cursor-pointer hover:bg-accent/40" onClick={() => setView(x)}>
                <TableCell className="py-3.5 pl-6 align-top">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 size-4 shrink-0 rounded-sm border border-border" style={{ background: x.creative?.bg }} />
                    <div>
                      <div className="font-medium">{x.name}</div>
                      <div className="text-xs text-muted-foreground">{x.tagline}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3.5 align-top text-muted-foreground">{x.category}</TableCell>
                <TableCell className="py-3.5 align-top"><TagList tags={x.target_contexts} /></TableCell>
                <TableCell className="py-3.5 align-top"><TagList tags={x.negative_contexts} tone="destructive" /></TableCell>
                <TableCell className="py-3.5 pr-6 text-right align-top">
                  <Button variant="ghost" size="icon" aria-label="Remove" onClick={(e) => { e.stopPropagation(); setPending(x); }}><Trash2 /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <BrandDialog brand={view} onClose={() => setView(null)} />
      <ConfirmDialog open={!!pending} title={`Remove ${pending?.name}?`} description="It will no longer be considered for any placement."
        onClose={() => setPending(null)} onConfirm={() => { if (pending) api.deleteBrand(pending.id).then((c) => setBrands(c.brands)); }} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-2 border-foreground bg-card shadow-[var(--shadow-float)] ring-0 sm:max-w-2xl">
          <form onSubmit={save} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Add a brand</DialogTitle>
              <DialogDescription>Choose the moments that suit this brand and the ones it must avoid.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" id="name"><Input id="name" placeholder="Brand name" value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} required /></Field>
              <Field label="Category" id="cat"><Input id="cat" placeholder="e.g. Tea, Two-wheelers" value={b.category} onChange={(e) => setB({ ...b, category: e.target.value })} /></Field>
              <Field label="Product category" id="ctag" hint="Kept apart from in-content promotions of the same kind" className="sm:col-span-2">
                <select id="ctag" value={b.category_tag ?? ""} onChange={(e) => setB({ ...b, category_tag: e.target.value })}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm">
                  <option value="">Choose…</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Tagline" id="tag" className="sm:col-span-2"><Input id="tag" placeholder="Short tagline" value={b.tagline} onChange={(e) => setB({ ...b, tagline: e.target.value })} /></Field>
            </div>
            <TagPicker label="Target contexts" hint="moments that suit this brand" tags={tags} selected={b.target_contexts} onToggle={(t) => toggle("target_contexts", t)} tone="primary" />
            <TagPicker label="Hard blocks" hint="moments it must avoid" tags={tags} selected={b.negative_contexts} onToggle={(t) => toggle("negative_contexts", t)} tone="destructive" />
            <Field label="Additional rule" id="rule" hint="Anything else the brand should never appear next to">
              <Textarea id="rule" placeholder="e.g. never after a scene where food is wasted" value={b.negative_description} onChange={(e) => setB({ ...b, negative_description: e.target.value })} />
            </Field>
            <Field label="Creative video URL" id="cvid" hint="Optional — an MP4 to play as this brand's ad. Without it, a card in the brand's colours is generated.">
              <Input id="cvid" placeholder="https://…/ad.mp4" value={b.creative?.video_url ?? ""} onChange={(e) => setB({ ...b, creative: { ...b.creative, video_url: e.target.value || undefined } })} />
            </Field>
            <div className="flex items-center gap-4">
              <Label>Creative colours</Label>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">Background
                <input type="color" value={b.creative?.bg} onChange={(e) => setB({ ...b, creative: { ...b.creative, bg: e.target.value } })} className="size-7 cursor-pointer rounded border bg-transparent" /></label>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">Text
                <input type="color" value={b.creative?.fg} onChange={(e) => setB({ ...b, creative: { ...b.creative, fg: e.target.value } })} className="size-7 cursor-pointer rounded border bg-transparent" /></label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || !b.name}>{saving ? "Saving…" : "Save brand"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, id, hint, className, children }: { label: string; id: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TagList({ tags, tone }: { tags: string[]; tone?: "destructive" }) {
  if (!tags.length) return <span className="text-sm text-muted-foreground/60">—</span>;
  const shown = tags.slice(0, 4);
  const rest = tags.slice(4);
  return (
    <span className={cn("text-sm text-muted-foreground", tone === "destructive" && "text-destructive/80")}>
      {shown.join(", ")}
      {rest.length > 0 && <span title={rest.join(", ")}>, +{rest.length} more</span>}
    </span>
  );
}

function TagPicker({ label, hint, tags, selected, onToggle, tone }: { label: string; hint: string; tags: string[]; selected: string[]; onToggle: (t: string) => void; tone: "primary" | "destructive" }) {
  const [q, setQ] = useState("");
  const visible = useMemo(() => tags.filter((t) => t.includes(q.toLowerCase())), [tags, q]);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label>{label} <span className="font-normal text-muted-foreground">— {hint}</span></Label>
        <span className="text-xs text-muted-foreground">{selected.length} selected</span>
      </div>
      <Input placeholder="Filter contexts" value={q} onChange={(e) => setQ(e.target.value)} className="h-8" />
      <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-border p-2">
        {visible.map((t) => {
          const on = selected.includes(t);
          return (
            <button type="button" key={t} onClick={() => onToggle(t)}
              className={cn("rounded-md border px-2 py-0.5 text-xs transition-colors",
                on
                  ? tone === "primary"
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground")}>
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BrandDialog({ brand, onClose }: { brand: Brand | null; onClose: () => void }) {
  const [noVideo, setNoVideo] = useState(false);
  const b = brand;
  return (
    <Dialog open={!!b} onOpenChange={(o) => { if (!o) { onClose(); setNoVideo(false); } }}>
      <DialogContent className="border-2 border-foreground bg-card p-0 shadow-[var(--shadow-float)] ring-0 sm:max-w-xl" showCloseButton>
        {b && (
          <>
            <div className="aspect-video w-full overflow-hidden rounded-t-lg" style={{ background: b.creative?.bg, color: b.creative?.fg }}>
              {!noVideo ? (
                <video key={b.id} src={b.creative_url ?? b.creative?.video_url ?? `/creatives/${b.id}.mp4`} autoPlay muted loop playsInline className="h-full w-full object-cover" onError={() => setNoVideo(true)} />
              ) : (
                <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                  <div className="display text-3xl">{b.name}</div>
                  <div className="mt-2 opacity-90">{b.tagline}</div>
                </div>
              )}
            </div>
            <div className="space-y-4 p-6">
              <DialogHeader>
                <DialogTitle>{b.name} <span className="ml-2 text-sm font-normal text-muted-foreground">{b.category}</span></DialogTitle>
                <DialogDescription>{b.tagline}</DialogDescription>
              </DialogHeader>
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[130px_1fr]">
                <dt className="text-muted-foreground">Target contexts</dt><dd>{b.target_contexts.join(", ") || "—"}</dd>
                <dt className="text-muted-foreground">Hard blocks</dt><dd className="text-destructive/80">{b.negative_contexts.join(", ") || "—"}</dd>
                {b.category_tag && (<><dt className="text-muted-foreground">Product category</dt><dd>{b.category_tag}</dd></>)}
                {b.negative_description && (<><dt className="text-muted-foreground">Additional rule</dt><dd>{b.negative_description}</dd></>)}
                <dt className="text-muted-foreground">Creative</dt>
                <dd className="flex items-center gap-2"><span className="size-4 rounded-sm border" style={{ background: b.creative?.bg }} /><span className="font-mono text-xs">{b.creative?.bg}</span><span className="size-4 rounded-sm border" style={{ background: b.creative?.fg }} /><span className="font-mono text-xs">{b.creative?.fg}</span></dd>
              </dl>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
