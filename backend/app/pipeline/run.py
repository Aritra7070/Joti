"""Orchestration: video path → analysis → scored candidates → breaks → brands → judge → VMAP."""
import time
import traceback
from pathlib import Path

from .. import config, store
from . import audio, gemini, judge, matching, scoring, vmap
from .creatives import creative_url


def _logger(job_id: str):
    def log(msg: str):
        line = f"[{time.strftime('%H:%M:%S')}] {msg}"
        print(job_id[:8], line)
        job = store.get_job(job_id) or {"id": job_id}
        job.setdefault("log", []).append(line)
        job["log"] = job["log"][-200:]
        store.save_job(job)
    return log


def analyze(job_id: str, video_path: str) -> dict:
    """Expensive half (ffmpeg + Gemini). Cached on disk by content hash."""
    log = _logger(job_id)
    store.set_progress(job_id, "probe", 2, "Reading media info")
    info = audio.probe(video_path)
    store.update(job_id, duration=info["duration"], started_at=time.time())
    log(f"media: {info['duration']:.1f}s {info['width']}x{info['height']} {info['size_bytes']/1e6:.0f}MB")

    store.set_progress(job_id, "silence", 5, "Mapping silences")
    silences = audio.silence_map(video_path)
    log(f"silence: {len(silences)} gaps")

    cuts = []
    if config.SHOT_DETECT:
        store.set_progress(job_id, "shots", 10, "Detecting shot changes")
        cuts = audio.shot_cuts(video_path)
        log(f"shots: {len(cuts)} cuts")

    store.set_progress(job_id, "upload", 15, "Uploading to the vision model")
    file = gemini.upload_video(video_path, log=log)

    store.set_progress(job_id, "gemini", 20, "Analysing scenes")
    analysis = gemini.analyze_video(
        file, info["duration"], log=log,
        on_progress=lambda f: store.set_progress(job_id, "gemini", 20 + 60 * f, f"Analysing scenes · {int(f*100)}%"),
    )
    log(f"gemini: {len(analysis['scenes'])} scenes, {len(analysis['speech'])} speech passages")
    return {"media": info, "silences": silences, "shot_cuts": cuts, **analysis}


def place(job_id: str, analysis: dict, catalogue: dict, pacing: dict, creative_base_url: str,
          use_llm: bool = True, video_path: str | None = None, use_judge: bool = True, owner_id: int | None = None) -> dict:
    """Cheap half: scoring, pacing, brand matching, judge, VMAP. Re-runnable in seconds
    (e.g. after adding a 9th brand or changing pacing)."""
    log = _logger(job_id)
    duration = analysis["media"]["duration"]
    cands = scoring.score_candidates(analysis, analysis["silences"], analysis["shot_cuts"], duration)
    scenes_by_id = {s["id"]: s for s in analysis["scenes"]}

    vetoed: dict[str, str] = {}          # candidate id → reason
    exclusions: dict[str, dict] = {}     # break id → {brand_id: reason}
    judge_log: list[dict] = []
    placed, rejected = [], []
    def tick(pct, msg):
        if video_path:  # only during a real run, not an interactive re-place
            store.set_progress(job_id, "placement", pct, msg)

    for round_no in range(3):
        tick(86 + round_no * 4, "Scoring breaks" if round_no == 0 else "Re-placing after review")
        selected, rejected = scoring.select_breaks(cands, duration, pacing, vetoed)
        log(f"scoring: {len(cands)} candidates → {len(selected)} breaks" + (f" (round {round_no+1})" if round_no else ""))
        tick(87 + round_no * 4, "Matching brands")
        placed = matching.match(selected, scenes_by_id, catalogue, log=log, use_llm=use_llm, exclusions=exclusions)
        changed = False
        # A slot where no catalogue brand fits is not a good ad slot: try the next candidate instead.
        for p in placed:
            if p["match_method"] == "fallback" and round_no < 2:
                vetoed[p["id"]] = "no catalogue brand fits the surrounding scenes"
                changed = True
        if not (use_judge and judge.enabled()):
            if round_no == 0:
                log("judge: skipped")
            if not changed:
                break
            continue
        tick(89 + round_no * 4, "Independent review of each break")
        try:
            verdicts = judge.judge(video_path, placed, scenes_by_id, log=log)
        except Exception as e:
            log(f"judge: failed, keeping placement as-is: {type(e).__name__}: {e}"[:300])
            break
        by_id = {v.break_id: v for v in verdicts}
        for p in placed:
            v = by_id.get(p["id"])
            if not v:
                continue
            p["judge"] = v.model_dump()
            judge_log.append({"round": round_no + 1, **v.model_dump(), "brand_id": p["brand"]["id"], "time": p["time"]})
            if v.cut_verdict == "jarring":
                vetoed[p["id"]] = f"judge: jarring cut — {v.notes}"
                changed = True
            elif v.brand_verdict in ("violation", "mismatch") and p["match_method"] != "fallback":
                exclusions.setdefault(p["id"], {})[p["brand"]["id"]] = f"judge:{v.brand_verdict}"
                changed = True
        if not changed:
            break
        log("judge: requested changes, re-placing")

    # Never ship a break the judge still calls jarring: fewer breaks beats a bad one.
    still_bad = [p for p in placed if p.get("judge", {}).get("cut_verdict") == "jarring"]
    if still_bad:
        for p in still_bad:
            rejected.append({**{k: v for k, v in p.items() if k not in ("brand", "brand_rows")},
                             "rejected_because": f"judge: jarring cut — {p['judge']['notes']}"})
            log(f"judge: dropping break @{p['time']:.1f}s (still jarring after re-placement)")
        placed = [p for p in placed if p not in still_bad]

    # Confidence gate: anything we are not sure about is handed to the user with the specific doubt.
    for p in placed:
        doubt = review_reason(p)
        p["status"] = "review" if doubt else "placed"
        p["review_reason"] = doubt

    for p in placed:
        p["brand"]["creative_url"] = creative_url(p["brand"], owner_id)
        log(f"break @{p['time']:.1f}s → {p['brand']['name']} ({p['match_method']}, {p['status']})"
            + (f" · judge: cut={p['judge']['cut_verdict']} brand={p['judge']['brand_verdict']}" if p.get("judge") else ""))
    xml = vmap.build_vmap(job_id, placed, pacing["ad_duration_seconds"], creative_base_url, owner_id)
    return {
        "pacing": pacing,
        "candidates": cands,
        "rejected": rejected,
        "breaks": placed,
        "judge": judge_log,
        "vmap": xml,
        "brand_ids": [b["id"] for b in catalogue["brands"]],
    }


def run_job(job_id: str, video_path: str, pacing: dict | None = None, owner_id: int | None = None) -> None:
    try:
        analysis = analyze(job_id, video_path)
        store.update(job_id, analysis=analysis)
        store.set_progress(job_id, "placement", 85, "Scoring breaks and matching brands")
        result = place(job_id, analysis, matching.load_brands(owner_id), {**config.DEFAULT_PACING, **(pacing or {})},
                       config.CREATIVE_BASE_URL, video_path=video_path, owner_id=owner_id)
        store.update(job_id, result=result, status="done", stage="done", progress=100, message="")
        _free_local_copy(job_id, video_path)
    except Exception as e:
        traceback.print_exc()
        store.update(job_id, status="error", message=f"{type(e).__name__}: {e}"[:500])


def review_reason(p: dict) -> str | None:
    """Why a break needs a human look, in the user's words; None when confident."""
    doubts = []
    j = p.get("judge") or {}
    safety = p["cut_safety"]
    if p["match_method"] == "fallback":
        doubts.append("no brand in your catalogue fits these scenes, so the house promo was used")
    elif p["match_method"] == "tag_affinity" and j.get("brand_verdict") not in ("fit",):
        doubts.append("the brand was chosen by context overlap only")
    if safety < 0.6:
        doubts.append(f"the cut is only moderately clean (safety {safety:.2f})")
    elif safety < 0.7 and j.get("cut_verdict") == "acceptable":
        doubts.append(f"both the score ({safety:.2f}) and the reviewer rate this cut as merely acceptable")
    if j.get("brand_verdict") in ("mismatch", "violation"):
        doubts.append(f"the reviewer flagged the brand as a {j['brand_verdict']}")
    return "; ".join(doubts) or None


def apply_decision(result: dict, break_id: str, action: str, ad_seconds: int, job_id: str, creative_base_url: str, owner_id: int | None = None) -> dict:
    """User approves a break under review, or removes any break. Rebuilds the manifest."""
    breaks = result["breaks"]
    target = next((b for b in breaks if b["id"] == break_id), None)
    if not target:
        raise KeyError(break_id)
    if action == "approve":
        target["status"] = "placed"
        target["approved"] = True
    elif action == "remove":
        result["breaks"] = [b for b in breaks if b["id"] != break_id]
        result.setdefault("rejected", []).append({**{k: v for k, v in target.items() if k not in ("brand", "brand_rows")},
                                                  "rejected_because": "removed by you"})
    else:
        raise ValueError(action)
    result["vmap"] = vmap.build_vmap(job_id, result["breaks"], ad_seconds, creative_base_url, owner_id)
    return result


def _free_local_copy(job_id: str, video_path: str) -> None:
    """Server disk is small and ephemeral; once the job is done and the video is
    reachable by URL, drop the local download. Local symlinks (dev samples) are kept."""
    try:
        job = store.get_job(job_id) or {}
        p = Path(video_path)
        if str(job.get("video_url", "")).startswith("http") and p.is_file() and not p.is_symlink():
            p.unlink()
    except Exception as e:
        print("could not remove local copy:", e)
