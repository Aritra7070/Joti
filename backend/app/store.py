"""Job/user/brand persistence. Local JSON files always; mirrored to MongoDB when
MONGODB_URI is set — Render's disk is ephemeral, so the DB is the source of
truth in production.

Mirroring is throttled (progress/log updates at most every few seconds; status
changes always) and circuit-broken so a slow or failing DB can never stall a job.

Collections: users, jobs, brands, docs, counters.
`docs(kind, key, data)` remains as (a) the local-file-fallback format for
users/brands when there is no DB, and (b) legacy key-value storage."""
import json
import threading
import time
from typing import Any

from pymongo import MongoClient, ReturnDocument

from . import config

_lock = threading.Lock()
_db_down_until = 0.0
_last_mirror: dict[str, tuple[float, str]] = {}   # job id → (time, status)
MIRROR_INTERVAL = 4.0

_client = None
_db = None
_db_lock = threading.Lock()


def _get_db():
    global _client, _db, _db_down_until
    if not config.MONGODB_URI or time.time() < _db_down_until:
        return None
    if _db is not None:
        return _db
    if not _db_lock.acquire(timeout=3):
        return None
    try:
        if _db is not None:
            return _db
        _client = MongoClient(
            config.MONGODB_URI,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            socketTimeoutMS=10000,
            retryWrites=True,
        )
        _client.admin.command("ping")
        db = _client[config.MONGODB_DB_NAME]
        db.users.create_index("username", unique=True)
        db.jobs.create_index([("owner_id", 1), ("updated_at", -1)])
        db.brands.create_index([("owner_id", 1), ("id", 1)], unique=True)
        db.docs.create_index([("kind", 1), ("key", 1)], unique=True)
        _db = db
        return _db
    except Exception as e:
        print("MongoDB connection error:", str(e)[:160])
        try:
            if _client:
                _client.close()
        except Exception:
            pass
        _client = None
        _db = None
        _db_down_until = time.time() + 10
        return None
    finally:
        _db_lock.release()


def _run(fn):
    """Run fn(db) with MongoDB under circuit breaker; None on failure."""
    db = _get_db()
    if db is None:
        return None
    try:
        return fn(db)
    except Exception as e:
        print("MongoDB query error:", str(e)[:160])
        return None


def _path(job_id: str):
    return config.JOBS_DIR / f"{job_id}.json"


def get_job(job_id: str) -> dict | None:
    p = _path(job_id)
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    doc = _run(lambda db: db.jobs.find_one({"_id": job_id}))
    if doc:
        job = doc.get("data") or {k: v for k, v in doc.items() if k != "_id"}
        p.write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")
        return job
    return None


def _mirror(job: dict, force: bool) -> None:
    now = time.time()
    last_t, last_status = _last_mirror.get(job["id"], (0.0, None))
    if not force and job.get("status") == last_status and now - last_t < MIRROR_INTERVAL:
        return
    ok = _run(lambda db: db.jobs.update_one(
        {"_id": job["id"]},
        {"$set": {
            "status": job.get("status"),
            "data": job,
            "owner_id": job.get("owner_id"),
            "updated_at": now,
        }},
        upsert=True,
    ))
    if ok is not None:
        _last_mirror[job["id"]] = (now, job.get("status"))


def save_job(job: dict, force_mirror: bool = False) -> None:
    job["updated_at"] = time.time()
    with _lock:
        _path(job["id"]).write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")
    _mirror(job, force=force_mirror or job.get("status") in ("done", "error", "queued"))


def list_jobs(owner_id: int) -> list[dict]:
    """Strictly the jobs owned by `owner_id` — no public/sample jobs."""
    jobs: dict[str, Any] = {}
    if config.MONGODB_URI:
        docs = _run(lambda db: list(db.jobs.find(
            {"owner_id": owner_id},
            {"data.analysis": 0, "data.result": 0, "data.log": 0}
        ).sort("updated_at", -1).limit(200)))
        for doc in docs or []:
            data = doc.get("data")
            if data and "id" in data:
                duration = ((data.get("analysis") or {}).get("media") or {}).get("duration") or (data.get("result") or {}).get("duration") or 0
                breaks = len((data.get("result") or {}).get("breaks") or []) if data.get("result") else 0
                jobs[data["id"]] = {**data, "duration": duration, "breaks": breaks}
    for p in config.JOBS_DIR.glob("*.json"):
        j = json.loads(p.read_text(encoding="utf-8"))
        if j.get("owner_id") == owner_id:
            jobs.setdefault(j["id"], _summary(j))
    out = sorted(jobs.values(), key=lambda j: j.get("created_at", 0), reverse=True)
    for j in out:
        j["editable"] = True
    return out


def list_jobs_all() -> list[dict]:
    """Every job regardless of owner (startup resume only)."""
    jobs: dict[str, Any] = {}
    if config.MONGODB_URI:
        docs = _run(lambda db: list(db.jobs.find(
            {},
            {"data.analysis": 0, "data.result": 0, "data.log": 0}
        )))
        for doc in docs or []:
            data = doc.get("data")
            if data and "id" in data:
                jobs[data["id"]] = data
    for p in config.JOBS_DIR.glob("*.json"):
        j = json.loads(p.read_text(encoding="utf-8"))
        jobs.setdefault(j["id"], _summary(j))
    return list(jobs.values())


def can_view(job: dict, user: dict) -> bool:
    return job.get("owner_id") == user.get("id")


def can_edit(job: dict, user: dict) -> bool:
    return job.get("owner_id") == user.get("id")


def _summary(j: dict) -> dict:
    """List view of a job: no analysis/result/log, plus a few derived fields."""
    s = {k: v for k, v in j.items() if k not in ("analysis", "result", "log")}
    s["duration"] = ((j.get("analysis") or {}).get("media") or {}).get("duration")
    s["breaks"] = len((j.get("result") or {}).get("breaks") or []) if j.get("result") else None
    return s


def delete_job(job_id: str) -> None:
    p = _path(job_id)
    if p.exists():
        p.unlink()
    _run(lambda db: db.jobs.delete_one({"_id": job_id}))


def update(job_id: str, **fields) -> dict:
    job = get_job(job_id) or {"id": job_id}
    job.update(fields)
    save_job(job, force_mirror="result" in fields or "analysis" in fields)
    return job


def set_progress(job_id: str, stage: str, pct: float, msg: str = "") -> None:
    job = get_job(job_id) or {"id": job_id}
    update(job_id, status="running", stage=stage, progress=round(pct, 1), message=msg, eta_seconds=_eta(job, pct))


def _eta(job: dict, pct: float) -> int | None:
    """Seconds remaining. Before we know the video length it is unknown; then a
    duration-based estimate (~3 s per content minute + fixed overhead), refined by
    the observed rate once the run is well under way."""
    duration = job.get("duration")
    if not duration:
        return None
    expected_total = 60 + 3 * duration / 60
    est = expected_total * (1 - pct / 100)
    started = job.get("started_at") or job.get("created_at")
    if started and pct >= 20:
        elapsed = time.time() - started
        rate_based = elapsed / pct * (100 - pct)
        est = 0.5 * est + 0.5 * rate_based
    return max(5, int(est))


# ---------------------------------------------------------------- documents
def _doc_path(kind: str, key: str):
    d = config.DATA_DIR / "docs" / kind
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{key}.json"


def get_doc(kind: str, key: str) -> dict | None:
    if config.MONGODB_URI:
        doc = _run(lambda db: db.docs.find_one({"kind": kind, "key": key}))
        return doc.get("data") if doc else None
    p = _doc_path(kind, key)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def put_doc(kind: str, key: str, data: dict) -> None:
    if config.MONGODB_URI:
        ok = _run(lambda db: db.docs.update_one(
            {"kind": kind, "key": key},
            {"$set": {"data": data, "updated_at": time.time()}},
            upsert=True,
        ))
        if ok is not None:
            return
        raise RuntimeError("database unavailable")
    _doc_path(kind, key).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


# -------------------------------------------------------------------- users
def _next_local_user_id() -> int:
    meta = get_doc("meta", "user_seq") or {"next": 1}
    put_doc("meta", "user_seq", {"next": meta["next"] + 1})
    return meta["next"]


def _next_mongo_user_id(db) -> int:
    doc = db.counters.find_one_and_update(
        {"_id": "user_seq"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return int(doc["seq"])


def get_user(username: str) -> dict | None:
    """{"id", "username", "password_hash"} or None."""
    if config.MONGODB_URI:
        doc = _run(lambda db: db.users.find_one({"username": username}))
        if doc:
            return {"id": doc["id"], "username": doc["username"], "password_hash": doc["password_hash"]}
        return None
    doc = get_doc("user", username)
    return {"id": doc["id"], "username": doc["username"], "password_hash": doc["password_hash"]} if doc else None


def get_user_by_id(user_id: int) -> dict | None:
    """{"id", "username"} or None. Used by current_user to confirm the user still exists."""
    if config.MONGODB_URI:
        doc = _run(lambda db: db.users.find_one({"id": user_id}))
        if doc:
            return {"id": doc["id"], "username": doc["username"]}
        return None
    for p in (config.DATA_DIR / "docs" / "user").glob("*.json"):
        d = json.loads(p.read_text(encoding="utf-8"))
        if d.get("id") == user_id:
            return {"id": d["id"], "username": d["username"]}
    return None


def create_user(username: str, password_hash: str) -> int:
    """Returns the new user's id. Caller must have already checked the username is free."""
    if config.MONGODB_URI:
        def fn(db):
            uid = _next_mongo_user_id(db)
            db.users.insert_one({
                "id": uid,
                "username": username,
                "password_hash": password_hash,
                "created_at": time.time(),
            })
            return uid
        uid = _run(fn)
        if uid is None:
            raise RuntimeError("database unavailable")
        return uid
    uid = _next_local_user_id()
    put_doc("user", username, {"id": uid, "username": username, "password_hash": password_hash, "created_at": time.time()})
    return uid


def delete_user(user_id: int) -> None:
    """Cascade-deletes the user's jobs and brands too."""
    if config.MONGODB_URI:
        def fn(db):
            db.users.delete_one({"id": user_id})
            db.jobs.delete_many({"owner_id": user_id})
            db.brands.delete_many({"owner_id": user_id})
        _run(fn)


# ------------------------------------------------------------------ brands
def get_brand_rows(owner_id: int) -> list[dict]:
    """A user's brand rows, oldest first (insertion order)."""
    if config.MONGODB_URI:
        docs = _run(lambda db: list(db.brands.find(
            {"owner_id": owner_id}
        ).sort("updated_at", 1)))
        return [d["data"] for d in docs] if docs is not None else []
    d = config.DATA_DIR / "docs" / "brands" / str(owner_id)
    if not d.exists():
        return []
    return [json.loads(p.read_text(encoding="utf-8")) for p in sorted(d.glob("*.json"), key=lambda p: p.stat().st_mtime)]


def upsert_brand(owner_id: int, brand: dict) -> None:
    if config.MONGODB_URI:
        ok = _run(lambda db: db.brands.update_one(
            {"owner_id": owner_id, "id": brand["id"]},
            {"$set": {"data": brand, "updated_at": time.time()}},
            upsert=True,
        ))
        if ok is not None:
            return
        raise RuntimeError("database unavailable")
    d = config.DATA_DIR / "docs" / "brands" / str(owner_id)
    d.mkdir(parents=True, exist_ok=True)
    (d / f"{brand['id']}.json").write_text(json.dumps(brand, ensure_ascii=False), encoding="utf-8")


def delete_brand_row(owner_id: int, brand_id: str) -> None:
    if config.MONGODB_URI:
        _run(lambda db: db.brands.delete_one({"owner_id": owner_id, "id": brand_id}))
        return
    p = config.DATA_DIR / "docs" / "brands" / str(owner_id) / f"{brand_id}.json"
    if p.exists():
        p.unlink()


# --------------------------------------------------------------- migration
def migrate_once() -> dict:
    """One-time (idempotent) migration to ensure counters and legacy docs are synced."""
    counts = {"users": 0, "jobs_from_owner_field": 0, "jobs_to_migrate_owner": 0, "brands": 0}
    if config.MONGODB_URI:
        def fn(db):
            for d in db.docs.find({"kind": "user"}):
                data = d.get("data", {})
                username = d.get("key")
                pwd = data.get("password") or data.get("password_hash")
                if username and pwd and not db.users.find_one({"username": username}):
                    uid = _next_mongo_user_id(db)
                    db.users.insert_one({
                        "id": uid,
                        "username": username,
                        "password_hash": pwd,
                        "created_at": data.get("created_at", time.time()),
                    })
                    counts["users"] += 1

            user_map = {u["username"]: u["id"] for u in db.users.find({}, {"username": 1, "id": 1})}
            fallback_id = user_map.get(config.MIGRATE_OWNER)
            for j_doc in db.jobs.find({"owner_id": None}):
                j_data = j_doc.get("data", {})
                owner_name = j_data.get("owner")
                target_id = user_map.get(owner_name) or fallback_id
                if target_id is not None:
                    db.jobs.update_one(
                        {"_id": j_doc["_id"]},
                        {"$set": {"owner_id": target_id, "data.owner_id": target_id, "data.owner": owner_name or config.MIGRATE_OWNER}}
                    )
                    counts["jobs_from_owner_field"] += 1
        _run(fn)
    _mirror_local_job_files()
    return counts


def _mirror_local_job_files() -> None:
    """Backfill owner_id into the local JSON job cache."""
    username_to_id: dict[str, int] = {}
    if config.MONGODB_URI:
        docs = _run(lambda db: list(db.users.find({}, {"id": 1, "username": 1})))
        username_to_id = {u["username"]: u["id"] for u in (docs or [])}
    else:
        for p in (config.DATA_DIR / "docs" / "user").glob("*.json"):
            d = json.loads(p.read_text(encoding="utf-8"))
            username_to_id[d["username"]] = d["id"]
    fallback_id = username_to_id.get(config.MIGRATE_OWNER)
    for p in config.JOBS_DIR.glob("*.json"):
        try:
            j = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        if j.get("owner_id") is not None:
            continue
        owner_id = username_to_id.get(j.get("owner")) or fallback_id
        if owner_id is None:
            continue
        j["owner_id"] = owner_id
        j["owner"] = j.get("owner") or config.MIGRATE_OWNER
        p.write_text(json.dumps(j, ensure_ascii=False), encoding="utf-8")
