"""Thin Gemini REST client: Files API upload, chunked video analysis with a
strict JSON schema, disk cache, retry with backoff and model fallback."""
import hashlib
import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

from .. import config
from ..vocab import CATEGORY_TAGS, CONTEXT_TAGS, MOODS

BASE = "https://generativelanguage.googleapis.com"
PROMPT_VERSION = "v5"


class GeminiError(RuntimeError):
    pass


def _read_cache(path: Path):
    """Parse a cache file; a truncated/corrupt one (e.g. written during a restart) is discarded."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        path.unlink(missing_ok=True)
        return None


def _write_cache(path: Path, data) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)  # atomic on POSIX


def _headers(extra=None):
    h = {"x-goog-api-key": config.GEMINI_API_KEY}
    h.update(extra or {})
    return h


def _sha1(path: str) -> str:
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# ---------------------------------------------------------------- Files API
def upload_video(path: str, log=print) -> dict:
    """Upload (or reuse a still-ACTIVE upload of) a video. Returns {uri, name, sha1}."""
    sha = _sha1(path)
    cache = config.CACHE_DIR / f"file_{sha}.json"
    meta = _read_cache(cache) if cache.exists() else None
    if meta:
        r = httpx.get(f"{BASE}/v1beta/{meta['name']}", headers=_headers(), timeout=30)
        if r.status_code == 200 and r.json().get("state") == "ACTIVE":
            log(f"gemini: reusing uploaded file {meta['name']}")
            return meta
    size = Path(path).stat().st_size
    with httpx.Client(timeout=600) as c:
        start = c.post(
            f"{BASE}/upload/v1beta/files",
            headers=_headers({
                "X-Goog-Upload-Protocol": "resumable",
                "X-Goog-Upload-Command": "start",
                "X-Goog-Upload-Header-Content-Length": str(size),
                "X-Goog-Upload-Header-Content-Type": "video/mp4",
                "Content-Type": "application/json",
            }),
            content=json.dumps({"file": {"display_name": Path(path).name}}),
        )
        start.raise_for_status()
        upload_url = start.headers["X-Goog-Upload-URL"]
        log(f"gemini: uploading {size/1e6:.1f} MB")
        with open(path, "rb") as f:
            fin = c.post(
                upload_url,
                headers={"Content-Length": str(size), "X-Goog-Upload-Offset": "0",
                         "X-Goog-Upload-Command": "upload, finalize"},
                content=f,
            )
        fin.raise_for_status()
        file = fin.json()["file"]
        while file.get("state") == "PROCESSING":
            time.sleep(3)
            file = c.get(f"{BASE}/v1beta/{file['name']}", headers=_headers()).json()
        if file.get("state") != "ACTIVE":
            raise GeminiError(f"file not active: {file}")
    meta = {"uri": file["uri"], "name": file["name"], "sha1": sha}
    _write_cache(cache, meta)
    return meta


# ------------------------------------------------------------- generation
def generate(parts: list, schema: dict | None = None, models=None, log=print,
             temperature: float = 0.2, max_output_tokens: int = 16000) -> dict:
    """generateContent with retry/backoff and model fallback. Returns parsed JSON
    when a schema is given, else {"text": ...}."""
    models = models or config.GEMINI_MODELS
    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"temperature": temperature, "maxOutputTokens": max_output_tokens},
    }
    if schema:
        body["generationConfig"]["responseMimeType"] = "application/json"
        body["generationConfig"]["responseSchema"] = schema
    last = None
    dead = set()
    # Round-robin: try every model once before waiting and retrying — a 503 on
    # one model is usually a spike, and another Flash model answers immediately.
    for attempt in range(4):
        for model in models:
            if model in dead:
                continue
            try:
                r = httpx.post(f"{BASE}/v1beta/models/{model}:generateContent",
                               headers=_headers({"Content-Type": "application/json"}),
                               json=body, timeout=300)
            except httpx.HTTPError as e:
                last = f"{model}: {e}"; continue
            if r.status_code == 200:
                data = r.json()
                try:
                    text = data["candidates"][0]["content"]["parts"][0]["text"]
                except (KeyError, IndexError):
                    last = f"{model}: empty candidate {str(data)[:200]}"; continue
                usage = data.get("usageMetadata", {})
                log(f"gemini: {model} ok ({usage.get('totalTokenCount')} tokens)")
                if schema:
                    try:
                        return json.loads(text)
                    except json.JSONDecodeError as e:
                        last = f"{model}: bad json {e}"; continue
                return {"text": text}
            last = f"{model}: HTTP {r.status_code} {r.text[:120].replace(chr(10), ' ')}"
            log(f"gemini: {last}")
            if r.status_code not in (429, 503, 500):
                dead.add(model)  # 400/404: this model won't work for this request
        if len(dead) == len(models):
            break
        time.sleep(3 * (attempt + 1))
    raise GeminiError(f"all models failed: {last}")


# ------------------------------------------------------- scene analysis
SCENE_SCHEMA = {
    "type": "object",
    "properties": {
        "scenes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "start": {"type": "string", "description": "MM:SS within this chunk"},
                    "end": {"type": "string", "description": "MM:SS within this chunk"},
                    "title": {"type": "string"},
                    "summary": {"type": "string", "description": "2-3 sentences, English"},
                    "setting": {"type": "string"},
                    "dominant_activity": {"type": "string", "description": "the single main thing happening"},
                    "tags": {"type": "array", "items": {"type": "string", "enum": CONTEXT_TAGS}},
                    "mood": {"type": "string", "enum": MOODS},
                    "sensitive": {"type": "boolean", "description": "death, grief, violence, illness, crime, intimacy or similar"},
                    "ends_on_cliffhanger": {"type": "boolean"},
                    "promotion": {
                        "type": "object",
                        "description": "in-content advertising in this scene: a sponsor segment, product placement, a brand being praised or shown on purpose, an on-screen ad. Omit or present=false when none.",
                        "properties": {
                            "present": {"type": "boolean"},
                            "brand": {"type": "string", "description": "the brand or product being promoted, as named/shown"},
                            "categories": {"type": "array", "items": {"type": "string", "enum": CATEGORY_TAGS}},
                        },
                        "required": ["present"],
                    },
                    "boundary_quality": {"type": "number", "description": "0-1: how natural a pause is the END of this scene (location/time change, fade, music sting = high; cut mid-conversation = low)"},
                },
                "required": ["start", "end", "title", "summary", "dominant_activity", "tags", "mood", "sensitive", "boundary_quality"],
            },
        },
        "speech": {
            "type": "array",
            "description": "continuous spoken passages (dialogue or narration), MM:SS within this chunk",
            "items": {
                "type": "object",
                "properties": {"start": {"type": "string"}, "end": {"type": "string"}},
                "required": ["start", "end"],
            },
        },
        "pause_points": {
            "type": "array",
            "description": "natural interruption points INSIDE long scenes (not scene boundaries): a topic shift, someone leaving, a beat of silence, a reaction shot after a punchline",
            "items": {
                "type": "object",
                "properties": {
                    "time": {"type": "string", "description": "MM:SS within this chunk"},
                    "reason": {"type": "string"},
                    "quality": {"type": "number", "description": "0-1 how natural an ad break here would feel"},
                },
                "required": ["time", "reason", "quality"],
            },
        },
    },
    "required": ["scenes", "speech", "pause_points"],
}

SCENE_PROMPT = """You are a broadcast content analyst preparing a Bengali drama episode for ad-break insertion.
You are watching ONE CHUNK of the episode: from {start_mmss} to {end_mmss} of the full video. All timestamps you output must be RELATIVE TO THIS CHUNK (00:00 = start of chunk).

Tasks:
1. Segment the chunk into semantically coherent SCENES (a change of location, time, participants or narrative beat). Typical scene length 30s-4min. Do not split a single continuous conversation.
2. For each scene: title, 2-3 sentence summary (English), setting, the ONE dominant activity, tags (only from the allowed list; include every tag that genuinely applies, sensitive ones included), mood, sensitive flag, ends_on_cliffhanger, and boundary_quality (0-1) for how natural an interruption at the END of this scene would be for a viewer.
2b. If a scene contains IN-CONTENT ADVERTISING — a sponsor's segment, product placement, a brand deliberately shown or praised, an on-screen ad — set promotion.present=true with the brand name and its product categories. Ad breaks must not place a competing brand next to it.
3. List every continuous SPEECH passage (dialogue, narration, singing with lyrics) as start/end. Be precise: a gap of >1s of no speech ends a passage. This is used to avoid cutting mid-sentence, so accuracy matters more than completeness of short fragments.
4. For any scene longer than ~2 minutes, list up to 3 PAUSE POINTS inside it where a viewer could tolerate an interruption (a topic shift in the conversation, a character walking away, a beat after a punchline, a lull with no speech). Never mid-sentence. Give each a quality 0-1.

Rules: The chunk may start or end mid-scene; that is fine — the first scene starts at 00:00 and the last ends at the chunk end. Never invent content you did not see or hear."""


def _mmss(t: float) -> str:
    t = max(0, int(round(t)))
    return f"{t // 60:02d}:{t % 60:02d}"


def _parse_mmss(s: str) -> float:
    parts = [float(p) for p in str(s).strip().split(":")]
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    return parts[0]


def analyze_chunk(file: dict, start: float, end: float, log=print) -> dict:
    key = f"scene_{file['sha1']}_{int(start)}_{int(end)}_{PROMPT_VERSION}_fps{config.VIDEO_FPS:g}.json"
    cache = config.CACHE_DIR / key
    cached = _read_cache(cache) if cache.exists() else None
    if cached:
        log(f"gemini: cache hit {int(start)}-{int(end)}s")
        return cached
    parts = [
        {"file_data": {"file_uri": file["uri"], "mime_type": "video/mp4"},
         "video_metadata": {"start_offset": f"{int(start)}s", "end_offset": f"{int(end)}s", "fps": config.VIDEO_FPS}},
        {"text": SCENE_PROMPT.format(start_mmss=_mmss(start), end_mmss=_mmss(end))},
    ]
    data = generate(parts, SCENE_SCHEMA, log=log)
    # convert to absolute seconds
    scenes = []
    for s in data.get("scenes", []):
        s_start = start + _parse_mmss(s["start"])
        s_end = start + _parse_mmss(s["end"])
        if s_end <= s_start:
            continue
        s["start"], s["end"] = round(min(s_start, end), 2), round(min(s_end, end), 2)
        s["tags"] = [t for t in s.get("tags", []) if t in set(CONTEXT_TAGS)]
        promo = s.get("promotion") or {}
        s["promotion"] = ({"brand": promo.get("brand", ""), "categories": [c for c in promo.get("categories", []) if c in CATEGORY_TAGS]}
                          if promo.get("present") else None)
        scenes.append(s)
    speech = []
    for p in data.get("speech", []):
        a, b = start + _parse_mmss(p["start"]), start + _parse_mmss(p["end"])
        if b > a:
            speech.append({"start": round(a, 2), "end": round(min(b, end), 2)})
    pauses = []
    for p in data.get("pause_points", []):
        t = start + _parse_mmss(p["time"])
        if start < t < end:
            pauses.append({"time": round(t, 2), "reason": p.get("reason", ""),
                           "quality": float(p.get("quality", 0.5))})
    out = {"scenes": scenes, "speech": speech, "pause_points": pauses, "chunk": [start, end]}
    _write_cache(cache, out)
    return out


def analyze_video(file: dict, duration: float, log=print, on_progress=None) -> dict:
    """Run chunked analysis over the whole video and merge."""
    chunks = []
    t = 0.0
    while t < duration - 1:
        chunks.append((t, min(t + config.CHUNK_SECONDS, duration)))
        t += config.CHUNK_SECONDS
    # avoid a tiny orphan chunk at the end
    if len(chunks) > 1 and chunks[-1][1] - chunks[-1][0] < 45:
        a, _ = chunks.pop()
        chunks[-1] = (chunks[-1][0], duration)
    # Chunks are independent → analyse a few at a time (modest parallelism keeps
    # well inside rate limits while cutting wall time roughly by the worker count).
    log(f"gemini: analysing {len(chunks)} chunks, {min(config.CHUNK_WORKERS, len(chunks))} at a time")
    results: list[dict | None] = [None] * len(chunks)
    done = 0
    lock = threading.Lock()

    def work(i: int):
        a, b = chunks[i]
        return i, analyze_chunk(file, a, b, log=lambda m: log(f"[{_mmss(a)}-{_mmss(b)}] {m}"))

    with ThreadPoolExecutor(max_workers=config.CHUNK_WORKERS) as pool:
        for i, res in pool.map(work, range(len(chunks))):
            results[i] = res
            with lock:
                done += 1
                if on_progress:
                    on_progress(done / len(chunks))

    scenes, speech, pauses = [], [], []
    for i, res in enumerate(results):
        assert res is not None
        for s in res["scenes"]:
            s["chunk_index"] = i
        scenes += res["scenes"]
        speech += res["speech"]
        pauses += res.get("pause_points", [])
    scenes.sort(key=lambda s: s["start"])
    speech.sort(key=lambda p: p["start"])
    # merge overlapping speech passages
    merged = []
    for p in speech:
        if merged and p["start"] <= merged[-1]["end"] + 0.3:
            merged[-1]["end"] = max(merged[-1]["end"], p["end"])
        else:
            merged.append(dict(p))
    for i, s in enumerate(scenes):
        s["id"] = f"s{i+1:03d}"
        s["chunk_edge"] = i + 1 < len(scenes) and scenes[i + 1]["chunk_index"] != s["chunk_index"]
    pauses.sort(key=lambda p: p["time"])
    return {"scenes": scenes, "speech": merged, "pause_points": pauses, "chunks": chunks}
