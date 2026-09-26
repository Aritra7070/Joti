import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { del, list } from "@vercel/blob";

const STORE_LIMIT = 1024 * 1024 * 1024; // Hobby plan: exceeding it disables Blob for 30 days
const HEADROOM = 40 * 1024 * 1024;

export const dynamic = "force-dynamic"; // never pre-render: the token check must run per request

/** Issues short-lived client-upload tokens so the browser streams the video
 *  straight to Vercel Blob (bypasses backend body limits, survives Render restarts). */
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const size = Number(clientPayload ?? 0);
        const used = (await list({ limit: 1000 })).blobs.reduce((t, b) => t + b.size, 0);
        if (size && used + size > STORE_LIMIT - HEADROOM) {
          throw new Error(`Not enough storage for this file (${((STORE_LIMIT - used) / 1e6).toFixed(0)} MB free). Remove an episode first.`);
        }
        return {
        allowedContentTypes: ["video/mp4", "video/quicktime", "video/x-matroska", "video/webm"],
        maximumSizeInBytes: 800 * 1024 * 1024,
        addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {},
    });
    return Response.json(json);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400 });
  }
}

export async function GET() {
  return Response.json({
    enabled: !!process.env.BLOB_READ_WRITE_TOKEN,
    blob_vars: Object.keys(process.env).filter((k) => k.startsWith("BLOB_")), // names only, for diagnostics
  });
}

/** Remove an episode's video from the store once its job is deleted. */
export async function DELETE(request: Request) {
  try {
    const { url } = (await request.json()) as { url?: string };
    if (!url || !/\.public\.blob\.vercel-storage\.com\/episodes\//.test(url)) return Response.json({ ok: false }, { status: 400 });
    await del(url);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 400 });
  }
}
