import json
import shutil
import threading
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import auth, config, store
from .pipeline import creatives, matching, run
from .vocab import CATEGORY_TAGS, CONTEXT_TAGS, MOODS


def _resume_interrupted():
    """A restart (deploy, free-tier recycle) kills in-flight background jobs. Re-queue any
    job left 'running'/'queued' whose video is still fetchable; otherwise mark it as an error."""
    print("migration:", store.migrate_once())
    for j in store.list_jobs_all():
        if j.get("status") not in ("running", "queued"):
            continue
        url = j.get("video_url") or ""
        if url.startswith("http"):
            print("resuming interrupted job", j["id"])
            store.update(j["id"], status="queued", stage="queued", progress=0, message="resumed after server restart")
            threading.Thread(target=_download_and_run, args=(j["id"], url, j.get("pacing")), daemon=True).start()
        else:
            store.update(j["id"], status="error", message="interrupted by a server restart and the uploaded file is gone — please upload again")


@asynccontextmanager
async def _lifespan(app: FastAPI):
    threading.Thread(target=_resume_interrupted, daemon=True).start()
    yield


app = FastAPI(title="Cuepoint API", lifespan=_lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS + ["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/media", StaticFiles(directory=str(config.MEDIA_DIR), follow_symlink=True), name="media")


@app.get("/health")
def health():
    from .pipeline import judge
    return {"ok": True, "models": config.GEMINI_MODELS, "text_models": config.GEMINI_TEXT_MODELS,
            "judge": judge.provider(), "db": bool(config.MONGODB_URI)}


@app.get("/pacing")
def pacing_defaults():
    return config.DEFAULT_PACING


@app.get("/vocab")
def vocab():
    return {"tags": CONTEXT_TAGS, "moods": MOODS, "categories": CATEGORY_TAGS}


# -------------------------------------------------------------------- auth
class Credentials(BaseModel):
    username: str
    password: str


@app.post("/auth/signup")
def signup(body: Credentials):
    token = auth.signup(body.username, body.password)
    return {"token": token, "username": body.username.strip().lower()}


@app.post("/auth/login")
def login(body: Credentials):
    token = auth.login(body.username, body.password)
    return {"token": token, "username": body.username.strip().lower()}


@app.get("/auth/me")
def me(user: dict = auth.CurrentUser):
    return {"username": user["username"]}


# ------------------------------------------------------------------ brands
def _with_urls(cat: dict, owner_id: int) -> dict:
    for b in cat["brands"]:
        b["creative_url"] = creatives.creative_url(b, owner_id)
    return cat


@app.get("/brands")
def brands(user: dict = auth.CurrentUser):
    return _with_urls(matching.load_brands(user["id"]), user["id"])


@app.get("/creatives/{owner_id}/{brand_id}.mp4")
def creative(owner_id: int, brand_id: str):
    """Rendered on first request for brands that don't ship with a creative."""
    cat = matching.load_brands(owner_id)
    brand = next((b for b in cat["brands"] if b["id"] == brand_id), None)
    if not brand:
        raise HTTPException(404)
    return FileResponse(creatives.ensure_creative(brand), media_type="video/mp4")


class Brand(BaseModel):
    id: str
    name: str
    category: str = ""
    tagline: str = ""
    target_contexts: list[str] = []
    negative_contexts: list[str] = []
    negative_description: str = ""
    creative: dict = {}
    category_tag: str = ""


@app.post("/brands")
def add_brand(brand: Brand, user: dict = auth.CurrentUser):
    """Add a (9th, unseen) brand to the caller's catalogue. Re-run placement on a job to see it matched."""
    bad = [t for t in brand.target_contexts + brand.negative_contexts if t not in CONTEXT_TAGS]
    if bad:
        raise HTTPException(400, f"unknown context tags: {bad}. See GET /vocab")
    if brand.category_tag and brand.category_tag not in CATEGORY_TAGS:
        raise HTTPException(400, f"unknown category: {brand.category_tag}")
    return _with_urls(matching.add_brand(user["id"], brand.model_dump()), user["id"])


@app.delete("/brands/{brand_id}")
def delete_brand(brand_id: str, user: dict = auth.CurrentUser):
    return _with_urls(matching.delete_brand(user["id"], brand_id), user["id"])


# -------------------------------------------------------------------- jobs
def _new_job(title: str, video_url: str | None, user: dict, pacing: dict | None = None) -> dict:
    job = {"id": uuid.uuid4().hex[:12], "title": title, "owner": user["username"], "owner_id": user["id"], "pacing": pacing,
           "status": "queued", "stage": "queued", "progress": 0, "message": "", "created_at": time.time(),
           "video_url": video_url, "log": []}
    store.save_job(job)
    return job


def _local_video_path(job_id: str) -> Path:
    return config.MEDIA_DIR / f"{job_id}.mp4"


def _load(job_id: str, user: dict, edit: bool = False) -> dict:
    j = store.get_job(job_id)
    if not j or not store.can_view(j, user):
        raise HTTPException(404)
    if edit and not store.can_edit(j, user):
        raise HTTPException(403, "you do not own this episode")
    return j


@app.post("/jobs/upload")
async def create_job_upload(bg: BackgroundTasks, file: UploadFile = File(...), title: str = Form(""), pacing: str = Form(""), user: dict = auth.CurrentUser):
    rules = json.loads(pacing) if pacing else None
    job = _new_job(title or file.filename or "untitled", None, user, rules)
    dest = _local_video_path(job["id"])
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    store.update(job["id"], video_url=f"/media/{dest.name}")
    bg.add_task(run.run_job, job["id"], str(dest), rules, user["id"])
    return store.get_job(job["id"])


class JobFromUrl(BaseModel):
    url: str
    title: str = ""
    pacing: dict | None = None


def _download_and_run(job_id: str, url: str, pacing: dict | None):
    dest = _local_video_path(job_id)
    owner_id = (store.get_job(job_id) or {}).get("owner_id")
    try:
        store.set_progress(job_id, "download", 1, "Downloading video")
        with httpx.stream("GET", url, follow_redirects=True, timeout=600) as r:
            r.raise_for_status()
            with dest.open("wb") as f:
                for chunk in r.iter_bytes(1 << 20):
                    f.write(chunk)
    except Exception as e:
        store.update(job_id, status="error", message=f"download failed: {e}"[:300])
        return
    run.run_job(job_id, str(dest), pacing, owner_id)


@app.post("/jobs")
def create_job_url(body: JobFromUrl, bg: BackgroundTasks, user: dict = auth.CurrentUser):
    """Start a job from a video URL (e.g. the Blob URL the frontend uploaded to)."""
    job = _new_job(body.title or body.url.rsplit("/", 1)[-1], body.url, user, body.pacing)
    bg.add_task(_download_and_run, job["id"], body.url, body.pacing)
    return job


@app.get("/jobs")
def jobs(user: dict = auth.CurrentUser):
    return store.list_jobs(user["id"])


@app.post("/jobs/{job_id}/retry")
def retry_job(job_id: str, bg: BackgroundTasks, user: dict = auth.CurrentUser):
    """Re-run a failed/interrupted job from its stored video URL."""
    j = _load(job_id, user, edit=True)
    url = j.get("video_url") or ""
    local = _local_video_path(job_id)
    store.update(job_id, status="queued", stage="queued", progress=0, message="", log=[])
    if url.startswith("http"):
        bg.add_task(_download_and_run, job_id, url, j.get("pacing"))
    elif local.exists():
        bg.add_task(run.run_job, job_id, str(local), j.get("pacing"), user["id"])
    else:
        raise HTTPException(409, "video no longer available — upload again")
    return store.get_job(job_id)


@app.delete("/jobs/{job_id}")
def delete_job(job_id: str, user: dict = auth.CurrentUser):
    _load(job_id, user, edit=True)
    store.delete_job(job_id)
    p = _local_video_path(job_id)
    if p.exists() or p.is_symlink():
        p.unlink()
    return {"ok": True}


@app.get("/jobs/{job_id}")
def job(job_id: str, full: bool = False, user: dict = auth.CurrentUser):
    j = _load(job_id, user)
    j["editable"] = store.can_edit(j, user)
    if not full:
        j = {k: v for k, v in j.items() if k != "analysis"} | {"analysis": _analysis_summary(j.get("analysis"))}
    return j


def _analysis_summary(a: dict | None):
    if not a:
        return None
    return {"media": a["media"], "scenes": a["scenes"], "speech": a["speech"],
            "silence_count": len(a["silences"]), "shot_cut_count": len(a["shot_cuts"])}


class Replace(BaseModel):
    pacing: dict | None = None
    use_llm: bool = True
    use_judge: bool = True


@app.post("/jobs/{job_id}/place")
def replace(job_id: str, body: Replace, user: dict = auth.CurrentUser):
    """Re-run scoring + matching only (seconds). Use after adding a brand or changing pacing."""
    j = _load(job_id, user, edit=True)
    if not j.get("analysis"):
        raise HTTPException(404, "job has no analysis yet")
    pacing = {**config.DEFAULT_PACING, **(body.pacing or {})}
    video = _local_video_path(job_id)
    result = run.place(job_id, j["analysis"], matching.load_brands(user["id"]), pacing, config.CREATIVE_BASE_URL,
                       use_llm=body.use_llm, video_path=str(video) if video.exists() else None, use_judge=body.use_judge, owner_id=user["id"])
    store.update(job_id, result=result)
    return job(job_id, user=user)


class Decision(BaseModel):
    action: str  # approve | remove


@app.post("/jobs/{job_id}/breaks/{break_id}")
def decide_break(job_id: str, break_id: str, body: Decision, user: dict = auth.CurrentUser):
    """Approve a break that was held for review, or remove any break."""
    j = _load(job_id, user, edit=True)
    if not j.get("result"):
        raise HTTPException(404, "no placement yet")
    try:
        result = run.apply_decision(j["result"], break_id, body.action, j["result"]["pacing"]["ad_duration_seconds"], job_id, config.CREATIVE_BASE_URL, user["id"])
    except KeyError:
        raise HTTPException(404, "unknown break")
    except ValueError:
        raise HTTPException(400, "action must be approve or remove")
    store.update(job_id, result=result)
    return job(job_id, user=user)


@app.get("/jobs/{job_id}/vmap.xml")
def vmap_xml(job_id: str, user: dict = auth.CurrentUser):
    j = _load(job_id, user)
    if not j.get("result"):
        raise HTTPException(404)
    return Response(j["result"]["vmap"], media_type="application/xml",
                    headers={"Content-Disposition": f'inline; filename="{job_id}.vmap.xml"'})


@app.get("/jobs/{job_id}/debug.json")
def debug_json(job_id: str, user: dict = auth.CurrentUser):
    j = _load(job_id, user)
    if not j.get("result"):
        raise HTTPException(404)
    r = j["result"]
    a = j["analysis"]
    return {"job_id": job_id, "media": a["media"], "pacing": r["pacing"],
            "scenes": a["scenes"], "speech": a["speech"], "silences": a["silences"], "shot_cuts": a["shot_cuts"],
            "candidates": r["candidates"], "rejected": r["rejected"], "breaks": r["breaks"], "log": j.get("log", [])}
