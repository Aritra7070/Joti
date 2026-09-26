"""WHAT: pick the brand for each break.

Two gates, then a ranker:
  1. deterministic hard block: brand.negative_contexts ∩ (tags of scene before ∪ scene after)
  2. LLM gate on the brand's free-text negative_description (conservative)
  3. ranking = tag overlap with the dominant (preceding) scene, weighted, plus an
     LLM tie-break with a written rationale.
Fully data-driven: a brand never seen before works if it uses the vocabulary."""
import json
from pathlib import Path

from .. import config
from .gemini import generate

RANK_SCHEMA = {
    "type": "object",
    "properties": {
        "choices": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "break_id": {"type": "string"},
                    "brand_id": {"type": "string"},
                    "rationale": {"type": "string"},
                    "conflicts": {"type": "array", "items": {"type": "string"},
                                  "description": "brand_ids among the allowed list that you judge to violate their own negative_description for this slot"},
                },
                "required": ["break_id", "brand_id", "rationale", "conflicts"],
            },
        }
    },
    "required": ["choices"],
}


def _backfill(brand: dict) -> dict:
    """Brands saved before category tags existed inherit the default one by id."""
    if not brand.get("category_tag"):
        d = next((b for b in default_catalogue()["brands"] if b["id"] == brand["id"]), None)
        brand["category_tag"] = d["category_tag"] if d else ""
    return brand


def default_catalogue() -> dict:
    return json.loads(config.BRANDS_FILE.read_text(encoding="utf-8"))


def load_brands(owner_id: int | None) -> dict:
    """A user's catalogue: {"brands": [rows for that user, insertion order], "fallback": ...}.
    Seeded from the default set (data/brands.json) on first access for a user with zero rows.
    owner_id=None (local dev scripts only, never an API path) gets the default catalogue as-is."""
    if owner_id is None:
        return default_catalogue()
    from .. import store
    rows = store.get_brand_rows(owner_id)
    if not rows:
        for b in default_catalogue()["brands"]:
            store.upsert_brand(owner_id, b)
        rows = store.get_brand_rows(owner_id)
    return {"brands": [_backfill(r) for r in rows], "fallback": default_catalogue().get("fallback")}


def add_brand(owner_id: int, brand: dict) -> dict:
    from .. import store
    store.upsert_brand(owner_id, brand)
    return load_brands(owner_id)


def delete_brand(owner_id: int, brand_id: str) -> dict:
    from .. import store
    store.delete_brand_row(owner_id, brand_id)
    return load_brands(owner_id)


def _ctx_tags(scene_before: dict, scene_after: dict) -> tuple[set, set]:
    return set(scene_before.get("tags", [])), set(scene_after.get("tags", []))


def hard_block(brand: dict, before_tags: set, after_tags: set) -> list[str]:
    neg = set(brand.get("negative_contexts", []))
    hits = sorted(neg & (before_tags | after_tags))
    return hits


PROMO_WINDOW = 180.0  # seconds either side of the cut in which an in-content promotion counts


def promotions_near(cut: float, scenes: list[dict]) -> list[dict]:
    """In-content promotions in scenes overlapping the window around a cut."""
    out = []
    for s in scenes:
        p = s.get("promotion")
        if p and s["end"] >= cut - PROMO_WINDOW and s["start"] <= cut + PROMO_WINDOW:
            out.append({**p, "scene": s["id"]})
    return out


def promo_conflict(brand: dict, promos: list[dict]) -> str | None:
    tag = brand.get("category_tag")
    for p in promos:
        if tag and tag in p.get("categories", []):
            return f"in-content promotion of {p.get('brand') or 'a competitor'}"
    return None


def affinity(brand: dict, before: dict, after: dict) -> float:
    tgt = set(brand.get("target_contexts", []))
    if not tgt:
        return 0.0
    b, a = set(before.get("tags", [])), set(after.get("tags", []))
    score = 1.0 * len(tgt & b) + 0.4 * len(tgt & a)
    if before.get("dominant_activity", "").lower() in {t.lower() for t in tgt}:
        score += 0.5
    if before.get("mood") in tgt:
        score += 0.3
    return round(score / max(len(tgt), 1) * 3, 3)


def match(breaks: list[dict], scenes_by_id: dict, catalogue: dict, log=print, use_llm: bool = True,
          exclusions: dict | None = None) -> list[dict]:
    """`exclusions` maps break id → {brand_id: reason} for brands vetoed on that slot (e.g. by the judge)."""
    brands = catalogue["brands"]
    fallback = catalogue.get("fallback")
    exclusions = exclusions or {}
    all_scenes = sorted(scenes_by_id.values(), key=lambda s: s["start"])
    per_break = []
    for br in breaks:
        before, after = scenes_by_id[br["scene_before"]], scenes_by_id[br["scene_after"]]
        bt, at = _ctx_tags(before, after)
        promos = promotions_near(br["time"], all_scenes)
        rows = []
        for b in brands:
            hits = hard_block(b, bt, at)
            conflict = promo_conflict(b, promos)
            if conflict:
                hits = hits + [conflict]
            if b["id"] in exclusions.get(br["id"], {}):
                hits = hits + [exclusions[br["id"]][b["id"]]]
            rows.append({"brand_id": b["id"], "blocked_by": hits, "affinity": affinity(b, before, after)})
        br["promotions_nearby"] = promos
        allowed = [r for r in rows if not r["blocked_by"]]
        per_break.append({"break": br, "before": before, "after": after, "rows": rows, "allowed": allowed})

    llm = {}
    if use_llm and any(pb["allowed"] for pb in per_break):
        slots = []
        for pb in per_break:
            if not pb["allowed"]:
                continue
            allowed_ids = {r["brand_id"] for r in pb["allowed"]}
            slots.append({
                "break_id": pb["break"]["id"],
                "time_seconds": pb["break"]["time"],
                "scene_before": {k: pb["before"].get(k) for k in ("title", "summary", "dominant_activity", "tags", "mood", "sensitive")},
                "scene_after": {k: pb["after"].get(k) for k in ("title", "summary", "dominant_activity", "tags", "mood", "sensitive")},
                "allowed_brands": [
                    {k: b.get(k) for k in ("id", "name", "category", "target_contexts", "negative_description")}
                    for b in brands if b["id"] in allowed_ids
                ],
                "tag_affinity": {r["brand_id"]: r["affinity"] for r in pb["allowed"]},
                "in_content_promotions_nearby": [{"brand": p.get("brand"), "categories": p.get("categories")} for p in pb["break"].get("promotions_nearby", [])],
            })
        prompt = (
            "You are placing ads inside a Bengali drama. For each ad slot, choose the ONE brand from allowed_brands whose creative "
            "fits most naturally with what the viewer has just watched (scene_before dominates; scene_after matters a little). "
            "The dominant scene activity wins over incidental details. tag_affinity is a hint, not a rule.\n"
            "First, for each slot, list in `conflicts` every allowed brand whose own negative_description would be violated by "
            "this slot — be strict and conservative; a food ad after a funeral or illness is never acceptable. Also treat as a conflict any brand that "
            "competes with an in-content promotion nearby (in_content_promotions_nearby): the content is already advertising that category. Never choose a conflicting brand.\n"
            "Prefer variety across slots: do not pick the same brand for adjacent slots unless it is clearly the only good fit.\n"
            "Write a one-sentence rationale in English that cites the specific scene content.\n\n"
            f"SLOTS:\n{json.dumps(slots, ensure_ascii=False)}"
        )
        try:
            res = generate([{"text": prompt}], RANK_SCHEMA, models=config.GEMINI_TEXT_MODELS, log=log, temperature=0.3)
            for c in res.get("choices", []):
                llm[c["break_id"]] = c
        except Exception as e:
            log(f"matching: llm ranking failed, falling back to tag affinity: {e}")

    results, last_brand = [], None
    for pb in per_break:
        br = pb["break"]
        allowed = list(pb["allowed"])
        choice = llm.get(br["id"], {})
        conflicts = set(choice.get("conflicts", []))
        for r in pb["rows"]:
            if r["brand_id"] in conflicts and not r["blocked_by"]:
                r["blocked_by"] = ["llm:negative_description"]
        allowed = [r for r in allowed if r["brand_id"] not in conflicts]
        allowed_ids = {r["brand_id"] for r in allowed}
        chosen_id, rationale, method = None, "", ""
        if choice.get("brand_id") in allowed_ids:
            chosen_id, rationale, method = choice["brand_id"], choice.get("rationale", ""), "llm"
        elif allowed:
            ranked = sorted(allowed, key=lambda r: (-r["affinity"], r["brand_id"] == last_brand))
            chosen_id, method = ranked[0]["brand_id"], "tag_affinity"
            rationale = f"Highest tag affinity ({ranked[0]['affinity']}) with the preceding scene."
        if chosen_id is None:
            brand = fallback
            method, rationale = "fallback", "Every catalogue brand is blocked by the surrounding context; house promo used."
        else:
            brand = next(b for b in brands if b["id"] == chosen_id)
        last_brand = brand["id"] if brand else None
        results.append({
            **br,
            "brand": brand,
            "match_method": method,
            "rationale": rationale,
            "brand_rows": pb["rows"],
        })
    return results
