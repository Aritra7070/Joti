"""Run the full pipeline on a local video without the API server.

    cd backend && uv run python scripts/run_local.py ~/Downloads/feluda.mp4
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import config, store  # noqa: E402
from app.pipeline import run  # noqa: E402

video = sys.argv[1]
job_id = f"local-{Path(video).stem}"
store.save_job({"id": job_id, "title": Path(video).name, "status": "queued", "created_at": time.time(), "log": []})
t0 = time.time()
run.run_job(job_id, video)
job = store.get_job(job_id)
print("\nstatus:", job["status"], job.get("message", ""), f"({time.time()-t0:.0f}s)")
if job["status"] == "done":
    r = job["result"]
    print(f"scenes: {len(job['analysis']['scenes'])}  candidates: {len(r['candidates'])}  breaks: {len(r['breaks'])}")
    for b in r["breaks"]:
        print(f"  @{b['time']:8.1f}s  safety={b['cut_safety']:.2f}  {b['brand']['name']:22s} [{b['match_method']}]  {b['rationale'][:90]}")
    out = config.JOBS_DIR / f"{job_id}.vmap.xml"
    out.write_text(r["vmap"])
    print("vmap:", out)
    print("debug json:", config.JOBS_DIR / f"{job_id}.json")
