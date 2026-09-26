import { getToken, signOutTo } from "@/lib/auth";

export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Brand = {
  id: string; name: string; category?: string; tagline?: string;
  target_contexts: string[]; negative_contexts: string[]; negative_description?: string;
  creative?: { bg?: string; fg?: string; video_url?: string; image_url?: string };
  category_tag?: string; creative_url?: string;
};
export type Scene = {
  id: string; start: number; end: number; title: string; summary: string; setting?: string;
  dominant_activity: string; tags: string[]; mood: string; sensitive: boolean;
  ends_on_cliffhanger?: boolean; boundary_quality: number;
  promotion?: { brand: string; categories: string[] } | null;
};
export type Candidate = {
  id: string; time: number; anchor_time: number; source: string; scene_before: string; scene_after: string;
  cut_safety: number; components: Record<string, number>; reasons: string[]; mid_speech: boolean; rejected_because?: string;
};
export type Verdict = { break_id: string; cut_verdict: string; brand_verdict: string; confidence: number; notes: string };
export type Break = Candidate & {
  brand: Brand; match_method: string; rationale: string;
  brand_rows: { brand_id: string; blocked_by: string[]; affinity: number }[];
  judge?: Verdict;
  status?: "placed" | "review"; review_reason?: string | null; approved?: boolean;
  promotions_nearby?: { brand: string; categories: string[]; scene: string }[];
};
export type Job = {
  id: string; title: string; status: "queued" | "running" | "done" | "error"; stage?: string; progress?: number;
  message?: string; created_at: number; video_url?: string | null; log?: string[]; owner?: string | null; editable?: boolean;
  duration?: number | null; breaks?: number | null; eta_seconds?: number | null;
  analysis?: { media: { duration: number; width: number; height: number }; scenes: Scene[]; speech: { start: number; end: number }[]; silence_count: number; shot_cut_count: number } | null;
  result?: { pacing: Record<string, number>; candidates: Candidate[]; rejected: Candidate[]; breaks: Break[]; vmap: string;
    judge?: (Verdict & { round: number; brand_id: string; time: number })[] } | null;
};

class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let msg = `${r.status}`;
    try { const d = await r.json(); msg = d.detail ?? JSON.stringify(d); } catch {}
    if (r.status === 401 && !r.url.includes("/auth/")) signOutTo(!!getToken());
    throw new ApiError(r.status, msg);
  }
  return r.json();
}

/** Authenticated fetch: bearer token from the session, JSON body helper. */
function call(path: string, init: RequestInit = {}, body?: unknown) {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> ?? {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${API}${path}`, { cache: "no-store", ...init, headers, body: body !== undefined ? JSON.stringify(body) : init.body });
}

/** For links opened in a new tab (they cannot carry headers). */
export const authedUrl = (path: string) => `${API}${path}?token=${encodeURIComponent(getToken() ?? "")}`;

export const api = {
  signup: (username: string, password: string) => call("/auth/signup", { method: "POST" }, { username, password }).then(j<{ token: string; username: string }>),
  login: (username: string, password: string) => call("/auth/login", { method: "POST" }, { username, password }).then(j<{ token: string; username: string }>),
  me: () => call("/auth/me").then(j<{ username: string }>),
  jobs: () => call("/jobs").then(j<Job[]>),
  job: (id: string) => call(`/jobs/${id}`).then(j<Job>),
  pacingDefaults: () => call("/pacing").then(j<Record<string, number>>),
  createFromUrl: (url: string, title: string, pacing?: Record<string, number>) => call("/jobs", { method: "POST" }, { url, title, pacing }).then(j<Job>),
  upload: (file: File, title: string, pacing?: Record<string, number>) => {
    const fd = new FormData(); fd.append("file", file); fd.append("title", title); if (pacing) fd.append("pacing", JSON.stringify(pacing));
    return call("/jobs/upload", { method: "POST", body: fd }).then(j<Job>);
  },
  decide: (id: string, breakId: string, action: "approve" | "remove") => call(`/jobs/${id}/breaks/${breakId}`, { method: "POST" }, { action }).then(j<Job>),
  retry: (id: string) => call(`/jobs/${id}/retry`, { method: "POST" }).then(j<Job>),
  deleteJob: (id: string) => call(`/jobs/${id}`, { method: "DELETE" }).then(j<{ ok: boolean }>),
  place: (id: string, pacing?: Record<string, number>) => call(`/jobs/${id}/place`, { method: "POST" }, { pacing }).then(j<Job>),
  brands: () => call("/brands").then(j<{ brands: Brand[]; fallback: Brand }>),
  addBrand: (b: Brand) => call("/brands", { method: "POST" }, b).then(j<{ brands: Brand[] }>),
  deleteBrand: (id: string) => call(`/brands/${id}`, { method: "DELETE" }).then(j<{ brands: Brand[] }>),
  vocab: () => call("/vocab").then(j<{ tags: string[]; moods: string[]; categories: string[] }>),
};

export const mediaUrl = (u?: string | null) => (!u ? "" : u.startsWith("http") ? u : `${API}${u}`);
export const fmt = (t: number) => {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};
