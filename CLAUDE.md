# hoichoi Hackathon '26 — Problem 1: Context-Aware Ad Placement

Solo, 12h (26 Sep 2026 11:30 → submission closes 00:30 IST). Handbook: `docs/HANDBOOK.txt`.
Submission = live demo URL + public GitHub + <5 min video. Judging = AI-native + working end-to-end.
Auto-DQ: hard-coded timestamps/brands, ANY negative-context violation on held-out videos, demo not runnable live, real brand names.

## Approach (Where / Whether / What)
- **Perceive**: ffmpeg silence map + shot cuts (precise, local) + Gemini Flash on 5-min video chunks @1fps
  (scenes w/ controlled-vocab tags, mood, boundary_quality; speech passages; intra-scene pause points).
- **Where**: candidates = scene boundaries + pause points ONLY (semantic). Cut snapped to nearest pause
  (ffmpeg silence, else Gemini speech gap). score = .45 pause + .35 boundary_quality + .20 shot_cut − penalties. Mid-speech ⇒ never.
- **Whether**: pacing rules in `config.DEFAULT_PACING` (breaks/hr, min gap, ad load %, edges); greedy best-first; rejected kept with reason.
- **What**: gate1 = `brand.negative_contexts ∩ scene tags` (before ∪ after) → hard block (set logic, not LLM);
  gate2 = LLM checks free-text `negative_description`; rank = tag affinity + LLM pick w/ rationale; fallback house promo.
- **Out**: VMAP 1.0 + inline VAST 3.0 (+ extension w/ rationale), debug JSON, player that cuts to ad and resumes.
- 9th brand: `POST /brands` then `POST /jobs/{id}/place` (re-runs only scoring+matching, seconds).

## Layout
- `backend/` FastAPI (uv). `app/pipeline/{audio,gemini,scoring,matching,vmap,run}.py`, `app/vocab.py` = shared tag vocab,
  `data/brands.json` = synthetic catalogue. `scripts/run_local.py <video>` runs pipeline w/o server. Cache in `data_local/cache` keyed by sha1+chunk+PROMPT_VERSION (bump PROMPT_VERSION when prompt/schema changes).
- `frontend/` Next.js (app router, Tailwind v4, pnpm). Deploy: Vercel. Backend: Render (Docker). Store: Supabase (jobs table + `media` bucket).

## Findings
- Gemini free tier: Flash models only (3.7/3.5/3.8-flash, 3.5-flash-lite work; Pro = 429). 2.5-flash is retired (404).
  Frequent transient 503 "high demand" → `gemini.generate` round-robins models per attempt. Files API works; ~30k tokens per 5-min chunk.
- Samples: 6 episodes, 20–26 min, 960x540, in `~/Downloads`. bhojon_bilashi full run = ~5 min wall time.
- ffmpeg 9: use `-fps_mode vfr` (not `-vsync`). Music beds defeat `silencedetect` → also use Gemini speech gaps as pauses.
- Gemini speech passages are coarse/over-merged: a ≥1s ffmpeg silence overrides "inside speech".
- Competitive separation: scenes carry `promotion` (brand + CATEGORY_TAGS); brands have `category_tag`; same-category brands are hard-blocked within ±180s (bhojon_bilashi promotes Sunrise Pure Spices → Ghorer Swad blocked).

- Judge (`pipeline/judge.py`): provider = Anthropic key → Bedrock → **Gemini 3.1 Pro (what we use; user has no Anthropic API key)**.
  Vetoes jarring cuts (re-select) / brand violations (re-match), max 2 rounds; still-jarring breaks are dropped.
- Video storage: Supabase Storage free tier caps files at 50 MB → videos go to **Vercel Blob** (Hobby: 1 GB, 10 GB transfer).
  Only pre-seed ~3 smallest samples. Supabase = jobs table only. Fresh Supabase projects throw PGRST002 for a while; store is circuit-broken.
- Paid Gemini key (AIza…) in `backend/.env`; Pro available. All 6 samples analysed locally in `backend/data_local` (~4–5 min each).
- Deploy: Render blueprint `render.yaml` (Docker, SHOT_DETECT=0), Vercel root `frontend/`, `frontend/scripts/seed.mjs` pre-seeds demo jobs.

## Live deployment (26 Sep 2026)
- Frontend: https://hoichoi-hackathon-sisanta.vercel.app (Vercel, root `frontend/`, env `NEXT_PUBLIC_API_URL`, `BLOB_READ_WRITE_TOKEN` added manually — the store connection only added `BLOB_STORE_ID`).
- Backend: https://hoichoi-hackathon-sisanta.onrender.com (Render free, Docker). Any env change/deploy restarts the container and kills
  in-flight jobs → `_resume_interrupted()` on startup re-queues them from the Blob URL. **No deploys during judging.**
- Prod timing: 23-min episode ≈ 2 min (silence 30s, upload 30s, chunks in parallel at 0.5 fps ~30s, match+judge 40–90s). Breaks with real doubt are held for user review.
- Prod jobs belong to user accounts (sisanta__ owns the seeded three; sisanta___ ran mandaar). Videos in Vercel Blob `episodes/`.
- Keep-alive: `.github/workflows/keepalive.yml` pings /health every 10 min.
- Auth: JWT (HS256, 7d) — set JWT_SECRET on Render; tables users/jobs.owner_id/brands are per user; the old public-sample concept is gone. Local user account: sisanta__.

## Working style
- Be token-frugal: no re-reading files already in context, small targeted edits, no long file dumps.
- Never print the API key. `.env` files are gitignored.
