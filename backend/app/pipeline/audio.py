"""Cheap, precise signals from ffmpeg: media info, silence map (sub-second
precision for "is this mid-sentence?") and optional shot cuts."""
import json
import re
import subprocess


def probe(path: str) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path],
        capture_output=True, text=True, check=True,
    ).stdout
    info = json.loads(out)
    v = next((s for s in info["streams"] if s["codec_type"] == "video"), {})
    a = next((s for s in info["streams"] if s["codec_type"] == "audio"), {})
    num, den = (v.get("r_frame_rate", "25/1").split("/") + ["1"])[:2]
    return {
        "duration": float(info["format"].get("duration", 0)),
        "width": v.get("width"), "height": v.get("height"),
        "fps": round(float(num) / float(den or 1), 3),
        "has_audio": bool(a),
        "size_bytes": int(info["format"].get("size", 0)),
    }


def silence_map(path: str, noise_db: float = -32.0, min_len: float = 0.45) -> list[dict]:
    """Return [{start, end, dur}] of silences. Audio-only decode: fast even on a tiny CPU."""
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-vn", "-i", path,
         "-af", f"silencedetect=noise={noise_db}dB:d={min_len}", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    silences, start = [], None
    for line in proc.stderr.splitlines():
        m = re.search(r"silence_start: ([\d.]+)", line)
        if m:
            start = float(m.group(1))
            continue
        m = re.search(r"silence_end: ([\d.]+) \| silence_duration: ([\d.]+)", line)
        if m and start is not None:
            end, dur = float(m.group(1)), float(m.group(2))
            silences.append({"start": round(start, 3), "end": round(end, 3), "dur": round(dur, 3)})
            start = None
    return silences


def shot_cuts(path: str, threshold: float = 0.35, scale_h: int = 144) -> list[float]:
    """Timestamps of hard shot changes. Decodes the whole video (downscaled) — the
    slow step on weak CPUs; disable with SHOT_DETECT=0."""
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", path,
         "-vf", f"scale=-2:{scale_h},select='gt(scene,{threshold})',showinfo",
         "-fps_mode", "vfr", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    return [round(float(m.group(1)), 3) for m in re.finditer(r"pts_time:([\d.]+)", proc.stderr)]


def extract_frame(path: str, t: float, out_path: str, height: int = 360) -> None:
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{t:.3f}", "-i", path,
         "-frames:v", "1", "-vf", f"scale=-2:{height}", "-q:v", "4", out_path],
        check=True,
    )
