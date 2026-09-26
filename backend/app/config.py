import hashlib
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
def _models(env: str, default: str) -> list[str]:
    return [m.strip() for m in os.environ.get(env, default).split(",") if m.strip()]

# Video understanding (speed matters for a live demo → Flash first)
GEMINI_MODELS = _models("GEMINI_MODELS", "gemini-3.8-flash,gemini-3.7-flash,gemini-3.5-flash,gemini-3.5-flash-lite")
# Brand matching / negative-context judgement (small text call → strongest model first)
GEMINI_TEXT_MODELS = _models("GEMINI_TEXT_MODELS", "gemini-3.1-pro-preview,gemini-3.8-flash,gemini-3.7-flash")

# Signing secret for auth tokens. Set JWT_SECRET in production; the fallback is stable per DB URL.
JWT_SECRET = os.environ.get("JWT_SECRET") or hashlib.sha256(("cuepoint:" + os.environ.get("MONGODB_URI", os.environ.get("SUPABASE_DB_URL", "dev"))).encode()).hexdigest()

# MongoDB URI (MongoDB Atlas or local, e.g. mongodb://localhost:27017). Empty = local-only persistence.
MONGODB_URI = os.environ.get("MONGODB_URI", "")
MONGODB_DB_NAME = os.environ.get("MONGODB_DB_NAME", "cuepoint")

# One-time migration: ownerless jobs (pre-auth "samples") are assigned to this username, if it exists.
MIGRATE_OWNER = os.environ.get("MIGRATE_OWNER", "sisanta__")

DATA_DIR = Path(os.environ.get("DATA_DIR", "./data_local")).resolve()
CACHE_DIR = DATA_DIR / "cache"
JOBS_DIR = DATA_DIR / "jobs"
MEDIA_DIR = DATA_DIR / "media"
for d in (CACHE_DIR, JOBS_DIR, MEDIA_DIR):
    d.mkdir(parents=True, exist_ok=True)

CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")]
SHOT_DETECT = os.environ.get("SHOT_DETECT", "1") == "1"

BRANDS_FILE = Path(__file__).resolve().parent.parent / "data" / "brands.json"
# Where the generated ad creatives (frontend/public/creatives/<brand_id>.mp4) are served from
CREATIVE_BASE_URL = os.environ.get("CREATIVE_BASE_URL", "http://localhost:3000/creatives").rstrip("/")
# This API's own public URL (for creatives rendered on the server). Render provides RENDER_EXTERNAL_URL.
PUBLIC_API_URL = (os.environ.get("PUBLIC_API_URL") or os.environ.get("RENDER_EXTERNAL_URL") or "http://localhost:8000").rstrip("/")

# Pacing rules ("whether" a break is warranted at all). Overridable per job.
DEFAULT_PACING = {
    "max_breaks_per_hour": 6,     # a 20-min episode gets 2, a 26-min one 3
    "min_gap_seconds": 300,       # between consecutive breaks
    "max_ad_load_pct": 10.0,      # total ad seconds / content seconds
    "ad_duration_seconds": 20,    # each break carries one creative of this length
    "no_break_before_seconds": 120,
    "no_break_after_seconds": 120,
    "min_cut_safety": 0.55,       # candidates below this are never used
}

# Gemini chunking: keep each request small so free-tier TPM is never hit and a
# failed chunk can be retried alone.
CHUNK_SECONDS = 300
CHUNK_WORKERS = int(os.environ.get("CHUNK_WORKERS", "4"))  # concurrent Gemini chunk calls
VIDEO_FPS = 0.5  # frames per second the model sees; audio stays continuous
