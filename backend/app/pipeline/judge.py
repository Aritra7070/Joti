"""Independent second-opinion judge.

Gemini Flash perceives and proposes; a different, stronger model audits. For every
selected break the judge sees the keyframes just before and after the cut, the
surrounding scene analysis, why the cut was chosen, and the brand that was matched,
and returns a structured verdict. A "jarring" cut is removed and the next candidate
takes its place; a brand "violation"/"mismatch" excludes that brand for that slot
and the matcher re-runs.

Provider (first available): Claude via Anthropic API (ANTHROPIC_API_KEY) → Claude via
Amazon Bedrock (AWS_ACCESS_KEY_ID + AWS_REGION) → Gemini Pro (GEMINI_TEXT_MODELS).
"""
import base64
import os
import tempfile
from typing import Literal

from pydantic import BaseModel

from .. import config
from . import audio, gemini

CLAUDE_MODEL = os.environ.get("JUDGE_CLAUDE_MODEL", "claude-opus-5")


class Verdict(BaseModel):
    break_id: str
    cut_verdict: Literal["natural", "acceptable", "jarring"]
    brand_verdict: Literal["fit", "neutral", "mismatch", "violation"]
    confidence: float
    notes: str


class Verdicts(BaseModel):
    verdicts: list[Verdict]


VERDICT_SCHEMA = {
    "type": "object",
    "properties": {"verdicts": {"type": "array", "items": {
        "type": "object",
        "properties": {
            "break_id": {"type": "string"},
            "cut_verdict": {"type": "string", "enum": ["natural", "acceptable", "jarring"]},
            "brand_verdict": {"type": "string", "enum": ["fit", "neutral", "mismatch", "violation"]},
            "confidence": {"type": "number"},
            "notes": {"type": "string"},
        },
        "required": ["break_id", "cut_verdict", "brand_verdict", "confidence", "notes"],
    }}},
    "required": ["verdicts"],
}


def provider() -> str | None:
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "anthropic"
    if os.environ.get("AWS_ACCESS_KEY_ID") and os.environ.get("AWS_REGION"):
        return "bedrock"
    if config.GEMINI_API_KEY:
        return "gemini"
    return None


def enabled() -> bool:
    return provider() is not None


def _frame_b64(video_path: str, t: float) -> str | None:
    try:
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
            out = f.name
        audio.extract_frame(video_path, max(0.0, t), out, height=360)
        data = base64.standard_b64encode(open(out, "rb").read()).decode()
        os.unlink(out)
        return data
    except Exception:
        return None


INSTRUCTIONS = (
    "You are the final QC reviewer for ad-break insertion in a Bengali drama episode on a streaming service. "
    "Another system proposed the breaks below. For EACH break, judge two things independently:\n"
    "1. cut_verdict — would a viewer experience this cut as a natural pause (scene/location change, beat resolved), "
    "acceptable, or jarring (mid-conversation, mid-action, emotionally wrong moment)? Use the two keyframes (just before / just after the cut) and the scene context.\n"
    "2. brand_verdict — is the matched brand a fit, neutral, a mismatch (tonally wrong), or a violation "
    "(the surrounding content clearly conflicts with the brand's negative contexts / rules, e.g. a food ad after a funeral or a vehicle ad after a crash)?\n"
    "Be strict on violations — they are the worst outcome. Be practical on cuts — broadcasters interrupt scenes; only flag 'jarring' when the cut is clearly bad. "
    "Return one verdict per break_id, in order, with a one-sentence note each."
)


def _build_items(video_path: str | None, breaks: list[dict], scenes_by_id: dict) -> list[tuple[str, str]]:
    """Provider-neutral content: [("text", str) | ("image", b64jpeg)]."""
    items: list[tuple[str, str]] = [("text", INSTRUCTIONS)]
    for b in breaks:
        before, after = scenes_by_id[b["scene_before"]], scenes_by_id[b["scene_after"]]
        brand = b["brand"]
        items.append(("text",
            f"\n### {b['id']} — cut at {b['time']:.1f}s (cut_safety {b['cut_safety']}, source {b['source']})\n"
            f"Cut reasons: {'; '.join(b['reasons'])}\n"
            f"Scene before: {before['title']} — {before['summary']} [activity: {before['dominant_activity']}; tags: {', '.join(before['tags'])}; mood: {before['mood']}; sensitive: {before['sensitive']}]\n"
            f"Scene after: {after['title']} — {after['summary']} [activity: {after['dominant_activity']}; tags: {', '.join(after['tags'])}; mood: {after['mood']}; sensitive: {after['sensitive']}]\n"
            f"Matched brand: {brand['name']} ({brand.get('category','')}) — tagline '{brand.get('tagline','')}'. "
            f"Negative contexts: {', '.join(brand.get('negative_contexts', [])) or 'none'}. Rule: {brand.get('negative_description') or 'none'}. "
            f"Matcher rationale: {b.get('rationale','')}"
            + (f"\nIn-content promotions nearby: " + "; ".join(f"{p.get('brand')} ({', '.join(p.get('categories', []))})" for p in b.get("promotions_nearby", []))
               + " — a brand competing with these is a violation." if b.get("promotions_nearby") else "")))
        if video_path and os.path.exists(video_path):
            for label, t in (("just before the cut", b["time"] - 1.5), ("just after the cut", b["time"] + 1.5)):
                img = _frame_b64(video_path, t)
                if img:
                    items.append(("text", f"Keyframe {label}:"))
                    items.append(("image", img))
    return items


def _judge_claude(items, log, prov: str) -> list[Verdict]:
    import anthropic

    if prov == "bedrock":
        client = anthropic.AnthropicBedrockMantle(aws_region=os.environ["AWS_REGION"])
        model = CLAUDE_MODEL if CLAUDE_MODEL.startswith("anthropic.") else f"anthropic.{CLAUDE_MODEL}"
    else:
        client = anthropic.Anthropic()
        model = CLAUDE_MODEL
    content = [{"type": "text", "text": t} if k == "text" else
               {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": t}} for k, t in items]
    response = client.messages.parse(model=model, max_tokens=4000,
                                     messages=[{"role": "user", "content": content}], output_format=Verdicts)
    if response.stop_reason == "refusal" or response.parsed_output is None:
        log(f"judge: no verdict (stop_reason={response.stop_reason})")
        return []
    u = response.usage
    log(f"judge: {model} via {prov} ({u.input_tokens} in / {u.output_tokens} out)")
    return response.parsed_output.verdicts


def _judge_gemini(items, log) -> list[Verdict]:
    parts = [{"text": t} if k == "text" else {"inline_data": {"mime_type": "image/jpeg", "data": t}} for k, t in items]
    data = gemini.generate(parts, VERDICT_SCHEMA, models=config.GEMINI_TEXT_MODELS, log=log, temperature=0.2)
    return Verdicts.model_validate(data).verdicts


def judge(video_path: str | None, breaks: list[dict], scenes_by_id: dict, log=print) -> list[Verdict]:
    prov = provider()
    if not prov or not breaks:
        return []
    items = _build_items(video_path, breaks, scenes_by_id)
    log(f"judge: reviewing {len(breaks)} breaks with {prov}")
    if prov in ("anthropic", "bedrock"):
        return _judge_claude(items, log, prov)
    return _judge_gemini(items, log)
