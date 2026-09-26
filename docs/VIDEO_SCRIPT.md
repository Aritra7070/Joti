# Demo video script (target 4:30, hard cap 5:00)

Record with the live site open. Talk plainly; show, don't narrate the README.

## 0:00–0:30 — The problem (home page)
"Problem 1: take a long-form Bengali drama and decide **where** an ad break is non-jarring, **whether** a break is warranted under pacing rules, and **what** brand belongs there — from a synthetic catalogue, with negative contexts as a hard block. Output a VMAP manifest, a debug JSON, and a player that actually cuts to the ad."
Point at the three Where/Whether/What cards.

## 0:30–1:15 — Live run on a held-out episode (upload form)
Start the upload of an episode the judges haven't seen. While it uploads: "Video goes straight to storage; the backend runs ffmpeg for silence and shot cuts, then Gemini looks at the video in 5-minute chunks and returns scenes with a controlled tag vocabulary, mood, boundary quality, speech passages and pause points."
Show the live log on the job page for ~10s, then switch to a finished job (mohanagar) — "this one finished earlier; it takes about 3–4 minutes."

## 1:15–2:30 — Where + Whether (job page: timeline + rejected list)
- Hover scenes on the timeline: colour = mood, tags, boundary quality.
- Ticks = every scored candidate; white bars = selected breaks.
- Open one break: "cut_safety is built from silence gap, Gemini's boundary quality and shot-cut alignment; a cut inside speech is never used." Read the `Cut:` reasons line.
- Scroll to **Rejected candidates**: "every rejected point says *why* — mid-speech, below threshold, break budget, min gap, too close to the end. That's the pacing rules — max breaks per hour, min gap, ad-load %."
- Change `max_breaks_per_hour` in the pacing panel → Re-run placement → breaks change in seconds. "Analysis is cached; only scoring and matching re-run."

## 2:30–3:30 — What (brand matching)
- On a break: the brand chip, the rationale, and the **Hard-blocked** chips: "these brands were removed by pure set logic — brand negative_contexts ∩ scene tags. No LLM can talk its way past it."
- Show feluda's house-promo break if available: "when everything is blocked, we fall back to a house promo rather than force a bad ad."
- The **Claude/Gemini judge** line: "a second, stronger model independently audits each break — jarring cuts get replaced, brand violations get re-matched. Its audit trail is on the page."

## 3:30–4:10 — The 9th brand (brand catalogue page)
Add a new fictional brand live (e.g. "Nodi Mobile Network", targets: phone/city/office, negatives: police/crime/death). Save → back to the job → Re-run placement → it gets matched (or correctly blocked) with a rationale. "Zero code changes — brands are data in a shared vocabulary."

## 4:10–4:40 — Outputs + player
- Click **VMAP manifest**: VMAP 1.0 + VAST 3.0, `timeOffset`, MediaFile pointing at the creative, plus an extension with cutSafety and rationale.
- Click **Debug JSON** briefly.
- Back on the player: click a marker → video pauses at the cue → creative plays → content resumes.

## 4:40–5:00 — Close
"Stack: Next.js on Vercel, FastAPI + ffmpeg on Render, Gemini Flash for perception, Gemini Pro for judgement, Postgres for jobs, Vercel Blob for video. Repo link in the submission. Thanks."

## Before recording
- Open tabs: home, mohanagar job, brands page, VMAP of mohanagar.
- Have the held-out episode file ready in the upload dialog.
- Mute notifications; 1080p; browser zoom 110%.
