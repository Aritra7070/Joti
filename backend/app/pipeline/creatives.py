"""Ad creatives for brands that don't ship with one (user-added brands).

A 20-second text card (name, tagline, category on the brand's colours) is
rendered with ffmpeg on first request and cached under MEDIA_DIR/creatives.
The eight default brands ship as static files with the frontend."""
import hashlib
import json
import shutil
import subprocess
import tempfile
from functools import lru_cache
from pathlib import Path

from .. import config

SHIPPED = {b["id"] for b in json.loads(config.BRANDS_FILE.read_text(encoding="utf-8"))["brands"]} | {"house-promo"}


def creative_url(brand: dict, owner_id: int | None) -> str:
    """Where a player or manifest should fetch this brand's creative."""
    c = brand.get("creative") or {}
    if c.get("video_url"):
        return c["video_url"]
    if brand["id"] in SHIPPED:
        return f"{config.CREATIVE_BASE_URL}/{brand['id']}.mp4"
    return f"{config.PUBLIC_API_URL}/creatives/{owner_id or 0}/{brand['id']}.mp4"


@lru_cache(maxsize=8)
def _font(pattern: str, fallback: str) -> str:
    try:
        out = subprocess.run(["fc-match", "-f", "%{file}", pattern], capture_output=True, text=True, timeout=10).stdout.strip()
        if out and Path(out).exists():
            return out
    except Exception:
        pass
    return fallback


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'").replace("%", "\\%")


def ensure_creative(brand: dict, seconds: int = 20) -> Path:
    """Render (once) and return the path of the brand's creative."""
    key = hashlib.sha1(json.dumps({k: brand.get(k) for k in ("id", "name", "tagline", "category", "creative")}, sort_keys=True).encode()).hexdigest()[:16]
    out_dir = config.MEDIA_DIR / "creatives"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{brand['id']}-{key}.mp4"
    if out.exists():
        return out
    c = brand.get("creative") or {}
    bg = (c.get("bg") or "#334155").lstrip("#")
    fg = (c.get("fg") or "#f8fafc").lstrip("#")
    bold = _font("DejaVu Sans:bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
    bengali = _font("Noto Sans Bengali:bold", bold)
    bn, _, en = (brand.get("tagline") or "").partition(" — ")
    if not en and bn:
        bn, en = ("", bn) if bn.isascii() else (bn, "")
    d = tempfile.mkdtemp()
    files = {}
    for k, v in {"ad": "ADVERTISEMENT", "name": brand["name"], "bn": bn, "en": en, "cat": (brand.get("category") or "").upper()}.items():
        p = Path(d) / f"{k}.txt"
        p.write_text(v, encoding="utf-8")
        files[k] = str(p)
    layers = [
        f"drawtext=fontfile={bold}:textfile={files['ad']}:fontcolor=0x{fg}@0.6:fontsize=16:x=(w-tw)/2:y=60",
        f"drawtext=fontfile={bold}:textfile={files['name']}:fontcolor=0x{fg}:fontsize=58:x=(w-tw)/2:y=(h-th)/2-50",
    ]
    if bn:
        layers.append(f"drawtext=fontfile={bengali}:textfile={files['bn']}:fontcolor=0x{fg}:fontsize=28:x=(w-tw)/2:y=(h-th)/2+28")
    if en:
        layers.append(f"drawtext=fontfile={bold}:textfile={files['en']}:fontcolor=0x{fg}@0.85:fontsize=22:x=(w-tw)/2:y=(h-th)/2+76")
    if brand.get("category"):
        layers.append(f"drawtext=fontfile={bold}:textfile={files['cat']}:fontcolor=0x{fg}@0.6:fontsize=14:x=(w-tw)/2:y=h-72")
    layers.append(f"fade=t=in:st=0:d=0.6,fade=t=out:st={seconds-0.8}:d=0.8")
    tmp = out.with_suffix(".tmp.mp4")
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"color=c=0x{bg}:s=854x480:r=15:d={seconds}",
         "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-vf", ",".join(layers), "-t", str(seconds),
         "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "32k",
         "-movflags", "+faststart", str(tmp)],
        check=True, timeout=120,
    )
    shutil.move(str(tmp), str(out))
    shutil.rmtree(d, ignore_errors=True)
    return out
