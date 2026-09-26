import { upload } from "@vercel/blob/client";

export async function blobUploadsEnabled(): Promise<boolean> {
  try { return (await (await fetch("/api/upload")).json()).enabled === true; } catch { return false; }
}

/** Best-effort removal of a stored video after its episode is deleted. */
export async function deleteFromBlob(url?: string | null) {
  if (!url || !url.includes(".public.blob.vercel-storage.com/")) return;
  try { await fetch("/api/upload", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) }); } catch {}
}

/** Browser → Vercel Blob (multipart, resumable-ish). Returns the public URL. */
export async function uploadToBlob(file: File, onProgress?: (pct: number) => void): Promise<string> {
  const blob = await upload(`episodes/${file.name.replace(/[^\w.-]+/g, "_")}`, file, {
    access: "public",
    handleUploadUrl: "/api/upload",
    multipart: true,
    clientPayload: String(file.size),
    onUploadProgress: (p) => onProgress?.(Math.round(p.percentage)),
  });
  return blob.url;
}
