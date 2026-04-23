---
name: classify-inspiration
description: Classify competitor ad URLs for the Immuvi Command Center. Reads pending items from the Supabase `inspiration_queue` table, downloads video/frames, classifies using Claude vision, creates ClickUp doc pages with 7-section creative briefs, writes results to Supabase `inspiration_results`. Bridge/localhost/JSON files are deprecated as of April 2026.
---

# Classify Inspiration Skill (Supabase-native)

This skill reads the queue and writes results directly to Supabase — no more local bridge, no `/tmp` JSON files. Anyone on the team can queue a URL from the live dashboard; you (running Claude locally with ffmpeg) classify; results stream back to the team's browser in real time.

## Prerequisites (installed by `install-skill.sh`)

- **System:** `ffmpeg`, `yt-dlp` (`brew install ffmpeg yt-dlp`)
- **Python:** `psycopg2-binary`, `requests`, `playwright` (`pip3 install --user`) and `python3 -m playwright install chromium`
- **Env file:** `~/.classify-inspiration.env` with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SUPABASE_DB_PASSWORD`
- **Bundled:** `fb_ad_classifier.py` must sit next to this `SKILL.md` in `~/.claude/skills/classify-inspiration/`

---

## Step 0 — Auto-update (always run this first)

Silently refresh the skill files from origin using HTTP ETags — unchanged files are a 304 Not Modified (zero bytes transferred, ~90ms). Next run loads the updated `SKILL.md`; `fb_ad_classifier.py` is re-imported every run so its update takes effect immediately.

```bash
SKILL_DIR="$HOME/.claude/skills/classify-inspiration"
ASSET_BASE="https://immuvi-command-center.vercel.app/team-skill"

for f in SKILL.md fb_ad_classifier.py; do
  file_path="$SKILL_DIR/$f"
  etag_path="$SKILL_DIR/.$f.etag"
  tmp_body="$SKILL_DIR/.$f.body.tmp"
  tmp_head="$SKILL_DIR/.$f.head.tmp"

  inm_args=()
  if [ -f "$file_path" ] && [ -s "$etag_path" ]; then
    inm_args=(-H "If-None-Match: $(cat "$etag_path")")
  fi

  http=$(curl -sS --max-time 10 "${inm_args[@]}" -D "$tmp_head" -o "$tmp_body" \
    -w "%{http_code}" "$ASSET_BASE/$f" 2>/dev/null) || http=""

  case "$http" in
    200)
      mv "$tmp_body" "$file_path"
      new_etag=$(awk -F': ' 'tolower($1)=="etag"{gsub(/\r/,"",$2); e=$2} END{print e}' "$tmp_head")
      [ -n "$new_etag" ] && printf '%s' "$new_etag" > "$etag_path"
      ;;
    304|*) rm -f "$tmp_body" ;;
  esac
  rm -f "$tmp_head"
done
```

Fails silently on network errors and continues with the on-disk copy.

---

## Env loader helper (referenced in every shell step below)

Whenever a step says `source_env` (or shows the env-loader block), it means:

```bash
for _p in "$HOME/.classify-inspiration.env" "$PWD/.env" "$HOME/.env"; do
  [ -f "$_p" ] && { set -a; source "$_p"; set +a; break; }
done
```

This finds the first `.env` file in the fallback chain and exports all its
non-comment variables. Installed by `install-skill.sh` into
`~/.classify-inspiration.env`.

---

## Connection details

- **Supabase URL:** `https://bfsvczgnnjwqzvrluqhw.supabase.co`
- **Service role key:** loaded by the installer into `~/.classify-inspiration.env` (key `SUPABASE_SERVICE_ROLE_KEY`). Never commit this key.
- **Direct Postgres connection string:** stored in same `.env` as `SUPABASE_DB_URL` (host: `db.bfsvczgnnjwqzvrluqhw.supabase.co`).

Throughout this skill, export the env vars at the start of every shell step:

```bash
# Portable env loader — reads from ~/.classify-inspiration.env (set by installer).
# Fallback chain: ~/.classify-inspiration.env → $PWD/.env → ~/.env.
for _p in "$HOME/.classify-inspiration.env" "$PWD/.env" "$HOME/.env"; do
  [ -f "$_p" ] && { set -a; source "$_p"; set +a; break; }
done
```

## ClickUp constants (shared across all product docs)

- **Workspace ID:** `9016762494`
- **Inspiration Library folder ID:** `90169348848` (inside space `90162807791`). **ALL product inspiration-library docs created by this skill MUST be parented here** so the team has one clean folder view.
- **Parent payload for `clickup_create_document`:** `{"id": "90169348848", "type": "5"}` — type 5 = folder.
- **Naming convention for new product libs:** `"[PRODUCT_NAME_UPPERCASE] — Inspiration Library"`
- **Default page created by `clickup_create_document` with `create_page=true`:** starts unnamed. Always rename it to `"📋 Master Tracker"` and seed it with the empty-tracker template (see Step 6.5) before creating any inspiration pages.

---

## Step 1 — Pull the queue from Supabase

```bash
# Portable env loader — reads from ~/.classify-inspiration.env (set by installer).
# Fallback chain: ~/.classify-inspiration.env → $PWD/.env → ~/.env.
for _p in "$HOME/.classify-inspiration.env" "$PWD/.env" "$HOME/.env"; do
  [ -f "$_p" ] && { set -a; source "$_p"; set +a; break; }
done

# Get pending items — all of them, across products. Each row has product_id, ins_id, url, platform.
PGPASSWORD="$SUPABASE_DB_PASSWORD" psql "$SUPABASE_DB_URL" -At -F$'\t' -c "
  select q.ins_id, q.product_id, q.url, q.platform, p.name as product_name, p.config->>'doc_id' as doc_id
  from public.inspiration_queue q
  join public.products p on p.id = q.product_id
  where q.status = 'pending'
  order by q.queued_at asc
" 2>/dev/null
```

Parse the TSV: each line is `ins_id\tproduct_id\turl\tplatform\tproduct_name\tdoc_id`.

**Exclude items already classified** — skip any queue row whose `ins_id` + `product_id` combo already exists in `inspiration_results`:

```bash
PGPASSWORD="$SUPABASE_DB_PASSWORD" psql "$SUPABASE_DB_URL" -At -F$'\t' -c "
  select ins_id, product_id from public.inspiration_results
"
```

Remove from the work list any items whose `(ins_id, product_id)` appears in the results set.

**Load the product's angles and personas** so you can classify with context:

```bash
# For the product_id(s) being processed, fetch angle + persona name lists
PGPASSWORD="$SUPABASE_DB_PASSWORD" psql "$SUPABASE_DB_URL" -At -c "
  select string_agg(name, ', ') from public.angles where product_id = '<PRODUCT_ID>'
"
PGPASSWORD="$SUPABASE_DB_PASSWORD" psql "$SUPABASE_DB_URL" -At -c "
  select string_agg(name, ', ') from public.personas where product_id = '<PRODUCT_ID>'
"
```

**Print status and stop early if nothing to do:**
- Empty queue → tell user "No pending items in inspiration_queue. Queue some URLs from the dashboard." Stop.
- All items already classified → "All queued items already processed. Nothing new to do." Stop.
- Otherwise → print the N items to be processed with their IDs + truncated URLs.

**Mark items as `processing`** so the dashboard can show progress:

```bash
PGPASSWORD="$SUPABASE_DB_PASSWORD" psql "$SUPABASE_DB_URL" -c "
  update public.inspiration_queue
  set status = 'processing'
  where ins_id in (<comma-separated-quoted-list>) and status = 'pending'
"
```

---

## Step 2 — Dispatch parallel agents (one per item)

**1 item** → process inline (Steps 3–4 directly).

**2+ items** → spawn one agent per item in parallel using the Agent tool. Each agent handles Steps 3–4 (classification + frames + result write). Paste this self-contained prompt per agent, filling in real values:

```
You are classifying a single competitor ad creative.

YOUR ITEM:
- INS_ID:     [INS-XXX]
- PRODUCT_ID: [prod-XXX]
- URL:        [url]
- Platform:   [facebook/instagram/tiktok/etc]

CONTEXT:
- Angles:   [comma-separated list or "none provided"]
- Personas: [comma-separated list or "none provided"]

ENVIRONMENT:
Before running shell commands, export env:
  # Portable env loader — reads from ~/.classify-inspiration.env (set by installer).
# Fallback chain: ~/.classify-inspiration.env → $PWD/.env → ~/.env.
for _p in "$HOME/.classify-inspiration.env" "$PWD/.env" "$HOME/.env"; do
  [ -f "$_p" ] && { set -a; source "$_p"; set +a; break; }
done

TASK:
1. Save the pipeline script (see below) to /tmp/ins_pipeline_[INS_ID].py
2. Run it: python3 /tmp/ins_pipeline_[INS_ID].py "[URL]" "/tmp/ins_work_[INS_ID]"
3. Read each produced frame with the Read tool (up to 6 frames)
4. Classify using the dimensions in Step 4
5. Insert the classification into Supabase `public.inspiration_results` via psql
6. Update the matching `public.inspiration_queue` row: status='done', processed_at=now()
7. Clean up: rm -rf /tmp/ins_work_[INS_ID] /tmp/ins_pipeline_[INS_ID].py
8. Print: "DONE [INS_ID]: [hook_type] | [creative_structure] | [funnel_type]"

[paste full pipeline script from Step 3]
[paste classification dimensions from Step 4]
[paste result-write SQL from Step 5]
```

Wait for ALL agents to complete before moving to Step 6 (doc page creation).

---

## Step 3 — Pipeline script (unchanged from bridge version)

Same Python script as before — downloads the video/image, extracts frames, returns metadata. Save to `/tmp/ins_pipeline_[INS_ID].py`:

```python
import asyncio, json, os, re, shutil, subprocess, sys, urllib.request

_SKILL_DIR = os.path.expanduser('~/.claude/skills/classify-inspiration')
if _SKILL_DIR not in sys.path: sys.path.insert(0, _SKILL_DIR)
from fb_ad_classifier import fetch_ad_snapshot, download_video, extract_frames, extract_ad_id, decode_unicode, USER_AGENT, OUTPUT_BASE

def detect_platform(url):
    u = url.lower()
    if "facebook.com/ads/library" in u: return "facebook"
    if "instagram.com" in u: return "instagram"
    if "tiktok.com" in u: return "tiktok"
    if "youtube.com" in u or "youtu.be" in u: return "youtube"
    return "other"

def get_duration(vp):
    try:
        r = subprocess.run(["ffprobe","-v","quiet","-print_format","json","-show_streams",vp], capture_output=True, text=True, timeout=15)
        for s in json.loads(r.stdout).get("streams",[]):
            if "duration" in s: return float(s["duration"])
    except: pass
    return 0.0

def download_ytdlp(url, outdir):
    os.makedirs(outdir, exist_ok=True)
    vp = os.path.join(outdir, "video.mp4")
    subprocess.run(["yt-dlp","--quiet","-f","mp4/best[height<=720]/best","-o",vp,url], capture_output=True, timeout=90, check=True)
    return vp

url = sys.argv[1]
work_dir = sys.argv[2]
os.makedirs(work_dir, exist_ok=True)

platform = detect_platform(url)
snapshot = {}
frames = []
duration = 0.0

try:
    if platform == "facebook":
        ad_id = extract_ad_id(url)
        snapshot = asyncio.run(fetch_ad_snapshot(ad_id))
        snapshot["ad_id"] = ad_id
        video_url = snapshot.get("video_hd_url") or snapshot.get("video_sd_url")
        if video_url:
            vp = os.path.join(work_dir, "video.mp4")
            download_video(video_url, vp)
            duration = get_duration(vp)
            frames = extract_frames(vp, work_dir)
            os.remove(vp)
        elif snapshot.get("image_url"):
            ip = os.path.join(work_dir, "frame_001.jpg")
            req = urllib.request.Request(snapshot["image_url"], headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=30) as r, open(ip,"wb") as f: f.write(r.read())
            frames = [ip]
        else:
            raise RuntimeError("No media found")
    else:
        vp = download_ytdlp(url, work_dir)
        duration = get_duration(vp)
        frames = extract_frames(vp, work_dir)
        os.remove(vp)

    result = {
        "frames": frames,
        "duration": round(duration, 1),
        "metadata": {
            "body_text": decode_unicode(snapshot.get("body_text") or ""),
            "title": decode_unicode(snapshot.get("title") or ""),
            "page_name": decode_unicode(snapshot.get("page_name") or ""),
            "cta_text": decode_unicode(snapshot.get("cta_text") or ""),
            "link_url": snapshot.get("link_url") or snapshot.get("caption") or "",
            "ad_id": snapshot.get("ad_id",""),
        },
        "error": None
    }
except Exception as e:
    result = {"frames": [], "duration": 0, "metadata": {}, "error": str(e)}

print(json.dumps(result))
```

---

## Step 4 — Visually classify the frames

Read each frame with the **Read tool** (up to 6 frames). You are a senior media buyer. Classify:

| Field | Options |
|---|---|
| photo_video | Video, Photo, Carousel, UGC, VSL, AI Style |
| hook_type | Pain/Problem, Fear, Curiosity, Social Proof, Aspirational, Direct Offer, Controversy/Bold Claim, POV, Question, News/Trend, Pattern Interrupt |
| creative_structure | UGC, Testimonial, Demo, Tutorial/How-To, Story/Narrative, Hook+Offer, Listicle, Static/Photo, Comparison, Interview, Skit/Roleplay, AI/Voiceover, Slideshow/Compilation |
| production_style | Organic/Raw UGC, Polished UGC, Professional Studio, AI Generated, Screen Record, Animation/Motion, Static Graphic, Slideshow, Repurposed Organic, Competitor Inspired |
| funnel_type | TOF, MOF, BOF |
| persona | Exact name from personas list if match ≥60%, else short label (4–6 words) |
| angle | Exact name from angles list if match ≥60%, else short label (2–5 words) |
| creative_usp | "Format Name — scroll-stopping mechanic" in 20 words |
| creative_hypothesis | 2 sentences: why made + why it works. Max 35 words. |
| notes | What you literally see. Max 30 words. |
| body_copy_from_frames | Transcribe all visible on-screen text / subtitles from the frames |
| page_name | From pipeline page_name metadata, or visually identified brand name if pipeline returned empty (Instagram/TikTok). **IMPORTANT:** dashboard reads `metadata.page_name` for the Brand column — always populate this field, even if the pipeline didn't. |
| brand | Same value as page_name (human-readable alias) |
| body_text | From body_text metadata |
| title / headline | From title metadata (dashboard reads both keys — write the same value to both) |
| cta_text | From cta_text metadata |
| landing_url / link_url | From link_url metadata (write to both keys) |
| duration_seconds | From pipeline output |

**Also build the full 7-section brief data** (same as before):

```
FRAME_BY_FRAME: timestamped breakdown with label (HOOK/TENSION/PROOF/BRIDGE/CTA) + what happens + emotion triggered
WHY_IT_WORKS: 4–5 psychological mechanisms in plain English
REPLICATION_BRIEF: talent, set, key overlay, subtitle style, pacing, music, mid-video, end card
WHAT_TO_TEST: 5 specific variation ideas (one line each: what changes + why)
COMPETITOR_INTEL: brand scale, funnel strategy, our gap, compete or find lane
OUR_NEXT_AD: what to steal, what to do differently, 3-bullet editor brief, hypothesis sentence
```

---

## Step 5 — Write result to Supabase

For each classified item, insert a row into `inspiration_results` and mark the queue row done:

```bash
# Portable env loader — reads from ~/.classify-inspiration.env (set by installer).
# Fallback chain: ~/.classify-inspiration.env → $PWD/.env → ~/.env.
for _p in "$HOME/.classify-inspiration.env" "$PWD/.env" "$HOME/.env"; do
  [ -f "$_p" ] && { set -a; source "$_p"; set +a; break; }
done

# Build JSON payloads (use a temp file so quoting doesn't break)
cat > /tmp/result_[INS_ID].json <<'JSON'
{
  "metadata": {
    "page_name": "...",
    "brand": "...",
    "body_text": "...",
    "title": "...",
    "headline": "...",
    "cta_text": "...",
    "landing_url": "...",
    "link_url": "...",
    "ad_id": "...",
    "body_copy_from_frames": "..."
  },
  "classification": {
    "photo_video": "...",
    "hook_type": "...",
    "creative_structure": "...",
    "production_style": "...",
    "funnel_type": "...",
    "persona": "...",
    "persona_matched": true,
    "angle": "...",
    "angle_matched": true,
    "creative_usp": "...",
    "creative_hypothesis": "...",
    "notes": "..."
  },
  "brief": {
    "frame_by_frame": [ ... ],
    "why_it_works": "...",
    "replication_brief": "...",
    "what_to_test": "...",
    "competitor_intel": "...",
    "our_next_ad": "..."
  }
}
JSON

PGPASSWORD="$SUPABASE_DB_PASSWORD" psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 <<SQL
insert into public.inspiration_results
  (ins_id, product_id, source_url, platform, metadata, classification, brief,
   duration_seconds, frames_extracted, classified_at)
values
  ('[INS_ID]', '[PRODUCT_ID]', '[URL]', '[PLATFORM]',
   (select metadata from json_populate_record(null::record, pg_read_file('/tmp/result_[INS_ID].json')::json)),  -- easier: use jsonb literal below instead
   '...'::jsonb, '...'::jsonb,
   [duration_seconds], [frames_count], now())
on conflict (ins_id, product_id) do update
  set metadata = excluded.metadata,
      classification = excluded.classification,
      brief = excluded.brief,
      classified_at = now();
SQL
```

**Simpler recommended form** — use Python with `psycopg2` or the Supabase REST API (with the service_role key) to insert. Example via REST:

```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/inspiration_results" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates" \
  --data @/tmp/result_[INS_ID].json
```

Where the JSON file has the full shape:

```json
{
  "ins_id": "[INS_ID]",
  "product_id": "[PRODUCT_ID]",
  "source_url": "[URL]",
  "platform": "[PLATFORM]",
  "metadata": { ... },
  "classification": { ... },
  "brief": { ... },
  "duration_seconds": 12.5,
  "frames_extracted": 6
}
```

Then mark the queue row done:

```bash
curl -s -X PATCH "$SUPABASE_URL/rest/v1/inspiration_queue?ins_id=eq.[INS_ID]&product_id=eq.[PRODUCT_ID]" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  --data '{"status":"done","processed_at":"now()"}'
```

---

## Step 5b — Write DIRECTLY to `public.inspirations.data` (avoid poller race)

**Why:** The dashboard polls `inspiration_results` every 6 s, maps fields into `inspirations.data`, then DELETES the source row (`DB.clearResults`). If the poller tab isn't open, or a second row update arrives before the next poll, fields get lost or overwritten with defaults. Writing directly to `inspirations.data` is lossless and triggers the dashboard's realtime subscription on the `inspirations` table within 1–2 s.

The dashboard's `applyClassificationResults` function expects these **camelCase** keys inside `inspirations.data`:

| data jsonb key | Source in your classification |
|---|---|
| `brand` | metadata.page_name |
| `hookType` | classification.hook_type (normalized to UI options) |
| `creativeStructure` | classification.creative_structure |
| `productionStyle` | classification.production_style |
| `funnelStage` | classification.funnel_type |
| `adType` | classification.photo_video |
| `persona` | classification.persona |
| `angle` | classification.angle |
| `creativeUSP` | classification.creative_usp |
| `formatName` | first phrase of creative_usp before " — " |
| `creativeHypothesis` | classification.creative_hypothesis |
| `notes` | classification.notes |
| `bodyCopy` | metadata.body_copy_from_frames OR metadata.body_text |
| `headline` | metadata.title |
| `ctaText` | metadata.cta_text |
| `landingUrl` | metadata.link_url |
| `duration_seconds` | pipeline output |
| `status` | `"Classified"` literal |
| `classifiedAt` | `Date.now()` equivalent (epoch ms) |
| `_needsAngleReview` | `true` if angle_matched=false and no fuzzy match ≥60%, else `false` |
| `_needsPersonaReview` | same logic for persona |
| `_anglePromptDone` | `true` after this skill has tried to match |
| `_personaPromptDone` | `true` after this skill has tried to match |
| `_clickupDocPageUrl` | set in Step 6 after page create/update |
| `_clickupDocId` | set in Step 6 after page create/update |
| `_inspoDocCreated` | `true` after Step 6 |

Use `psycopg2` (simpler than curl with JSON escaping):

```bash
# Portable env loader — reads from ~/.classify-inspiration.env (set by installer).
# Fallback chain: ~/.classify-inspiration.env → $PWD/.env → ~/.env.
for _p in "$HOME/.classify-inspiration.env" "$PWD/.env" "$HOME/.env"; do
  [ -f "$_p" ] && { set -a; source "$_p"; set +a; break; }
done
python3 <<'PYEOF'
import json, os, psycopg2, time
result = json.load(open('/tmp/result_[INS_ID].json'))
md = result['metadata']
cls = result['classification']

brand = md.get('page_name') or md.get('brand') or ''
body_copy = md.get('body_copy_from_frames') or md.get('body_text') or ''
usp = cls.get('creative_usp') or ''
format_name = usp.split(' — ')[0].strip() if ' — ' in usp else usp

patch = {
  'brand': brand,
  'hookType': cls.get('hook_type') or '',
  'creativeStructure': cls.get('creative_structure') or '',
  'productionStyle': cls.get('production_style') or '',
  'funnelStage': cls.get('funnel_type') or 'TOF',
  'adType': cls.get('photo_video') or 'Video',
  'persona': cls.get('persona') or '',
  'angle': cls.get('angle') or '',
  'creativeUSP': usp,
  'formatName': format_name,
  'creativeHypothesis': cls.get('creative_hypothesis') or '',
  'notes': cls.get('notes') or '',
  'bodyCopy': body_copy,
  'headline': md.get('title') or '',
  'ctaText': md.get('cta_text') or '',
  'landingUrl': md.get('link_url') or '',
  'duration_seconds': result.get('duration_seconds') or 0,
  'status': 'Classified',
  'classifiedAt': int(time.time() * 1000),
  '_needsAngleReview': not cls.get('angle_matched', False),
  '_needsPersonaReview': not cls.get('persona_matched', False),
  '_anglePromptDone': True,
  '_personaPromptDone': True,
}

conn = psycopg2.connect(os.environ['SUPABASE_DB_URL']); cur = conn.cursor()
# Merge patch into existing data jsonb (JSONB || operator, right wins)
cur.execute("""
  update public.inspirations
  set data = coalesce(data,'{}'::jsonb) || %s::jsonb,
      status = 'Classified'
  where id = %s and product_id = %s
  returning id
""", (json.dumps(patch), '[INS_ID]', '[PRODUCT_ID]'))
print('updated:', cur.fetchone())
conn.commit(); cur.close(); conn.close()
PYEOF
```

The dashboard sees this within 1–2 s via its realtime subscription on `public.inspirations`.

---

## Step 6 — Create or UPDATE ClickUp Doc Page (7-section brief)

Uses the `doc_id` from `products.config->>'doc_id'` (pulled in Step 1). **IMPORTANT:** always list existing pages first. If a page already starts with `[INS_ID]` (same ins_id, regardless of old/stale title), UPDATE it instead of creating a duplicate.

### 6-pre — Auto-create library doc if product has no `doc_id`

If `products.config->>'doc_id'` is empty/null (first-ever classification for this product), auto-create the library doc + seed a Master Tracker page, then save the IDs back to Supabase so future runs reuse them.

```text
Call: clickup_create_document
  workspace_id: "9016762494"
  name: "[PRODUCT_NAME uppercased] — Inspiration Library"
  parent: {"id": "90169348848", "type": "5"}   ← Inspiration Lib folder (type 5 = folder)
  visibility: "PUBLIC"
  create_page: true

Response → capture document_id (this becomes the new doc_id).

Call: clickup_list_document_pages(document_id)
→ grab the single auto-created page's id (this becomes the new master_tracker_page_id).

Call: clickup_update_document_page to rename + seed content
  document_id: <new doc_id>
  page_id: <that page id>
  name: "📋 Master Tracker"
  sub_title: "All [PRODUCT_NAME] inspirations — status, decision, quick reference"
  content_format: "text/md"
  content: empty-tracker markdown (see Step 6.5 for the seed template — use the empty state with "_empty — run the skill to populate_" row)

Then persist to Supabase:
```
```bash
python3 <<PYEOF
import os, psycopg2, json
conn = psycopg2.connect(os.environ['SUPABASE_DB_URL']); cur = conn.cursor()
cur.execute("""
  update public.products
  set config = coalesce(config,'{}'::jsonb) || %s::jsonb
  where id = %s
""", (json.dumps({'doc_id': '[NEW_DOC_ID]', 'master_tracker_page_id': '[NEW_TRACKER_PAGE_ID]'}), '[PRODUCT_ID]'))
conn.commit(); cur.close(); conn.close()
PYEOF
```

After this, proceed to 6a with the freshly-minted `doc_id`. Note the existing KLS/KMH/Astro docs were created manually for the first batch; every new product after today will be auto-created here by the skill — zero manual setup.

⚠️ **Known MCP quirk:** parent type `"5"` (folder) currently works against folder `90169348848`. Earlier attempts against OTHER folders returned "Resource not found" — auth is per-folder. If auto-create fails: fall back to parent `{"id": "90162807791", "type": "4"}` (space root), then tell the user to drag the new doc into the folder manually.

### 6a — List existing pages + decide create vs update

Use `clickup_list_document_pages` MCP tool with `document_id = [DOC_ID]`. Scan returned pages for one whose `name` starts with `[INS_ID] ` or equals `[INS_ID]`. If found → capture its `id` for update. If not → create new.

### 6b — Create OR update the inspiration page

**If existing page found:** call `clickup_update_document_page` with:
- `document_id`: [DOC_ID]
- `page_id`: found page id
- `name`: `[INS_ID] — [Brand] | [Angle]`
- `sub_title`: `[Platform] · [Duration]s · [Funnel] · [Hook Type] hook`
- `content_format`: `text/md`
- `content`: the full 7-section markdown (see template below)

**If no existing page:** call `clickup_create_document_page` with the same fields (use `document_id` + no `page_id`).

### 6c — 7-section page content template

The `content` field should be markdown with these 7 H2 sections — format matches existing pages in the doc for consistency:

```markdown
# [INS_ID] — [Brand] | [Angle]
* * *

## 1\. SNAPSHOT
> _Media Buyer — 30 second read_

| Field | Value |
| ---| --- |
| Brand | [metadata.page_name] |
| Platform | [Platform] |
| Duration | [duration_seconds]s |
| Funnel | [funnel_type] |
| Format | [photo_video] — [production_style] |
| Hook Type | [hook_type] |
| Angle | [angle] |
| Persona | [persona] |
| Status | Classified |
| Decision | — |
| Reference | [[source_url]]([source_url]) |

**Ad Copy:** [body_text or "(not available)"]
**Headline:** [title or "(not available)"]
**CTA:** [cta_text or "(not available)"]

**In one sentence:** [creative_hypothesis condensed to one sentence]
* * *

## 2\. CREATIVE BREAKDOWN
> _Strategist + Editor — frame by frame_

| Time | Label | What Happens | Emotion Triggered |
| ---| ---| ---| --- |
[render each frame_by_frame row as table row]

* * *

## 3\. WHY IT WORKS
> _Strategist — the psychology_

[why_it_works as bulleted list]
* * *

## 4\. REPLICATION BRIEF
> _Editor / Video Producer — exactly what to make_

[replication_brief broken into bullets: Talent, Set, Key overlay, Subtitle style, Pacing, Music, Mid-video, End card]
* * *

## 5\. WHAT TO TEST
> _Media Buyer + Strategist — variations_

[what_to_test as numbered list]
* * *

## 6\. COMPETITOR INTEL
> _Strategist + Media Buyer_

[competitor_intel as bullets: Brand scale, Funnel strategy, Our gap, Compete or find lane]
* * *

## 7\. OUR NEXT AD
> _Everyone — the actionable output_

[our_next_ad — include: What we're stealing, What we're doing differently, 3-line editor brief, Hypothesis]
```

### 6d — Write the doc page URL back to `inspirations.data`

After create/update, capture the page URL (format: `https://app.clickup.com/[workspace_id]/docs/[doc_id]/[page_id]`) and the page id. Update `inspirations.data` so the dashboard renders the 📄 Brief link:

```bash
# Portable env loader — reads from ~/.classify-inspiration.env (set by installer).
# Fallback chain: ~/.classify-inspiration.env → $PWD/.env → ~/.env.
for _p in "$HOME/.classify-inspiration.env" "$PWD/.env" "$HOME/.env"; do
  [ -f "$_p" ] && { set -a; source "$_p"; set +a; break; }
done
python3 <<'PYEOF'
import json, os, psycopg2
conn = psycopg2.connect(os.environ['SUPABASE_DB_URL']); cur = conn.cursor()
cur.execute("""
  update public.inspirations
  set data = coalesce(data,'{}'::jsonb) || %s::jsonb
  where id = %s and product_id = %s
""", (json.dumps({
  '_clickupDocPageUrl': '[PAGE_URL]',
  '_clickupDocId':      '[PAGE_ID]',
  '_inspoDocCreated':   True,
}), '[INS_ID]', '[PRODUCT_ID]'))
conn.commit(); cur.close(); conn.close()
PYEOF
```

---

## Step 6.5 — Rebuild the Master Tracker page

Product config stores `master_tracker_page_id`. If absent, skip this step and tell the user to add it (same pattern as `doc_id`).

**Strategy:** regenerate the entire tracker table from Supabase on every classify — cleaner than parsing/merging existing markdown. The `inspirations` table for this product IS the source of truth.

```bash
# Portable env loader — reads from ~/.classify-inspiration.env (set by installer).
# Fallback chain: ~/.classify-inspiration.env → $PWD/.env → ~/.env.
for _p in "$HOME/.classify-inspiration.env" "$PWD/.env" "$HOME/.env"; do
  [ -f "$_p" ] && { set -a; source "$_p"; set +a; break; }
done
python3 <<'PYEOF' > /tmp/tracker_[PRODUCT_ID].md
import os, psycopg2, datetime
conn = psycopg2.connect(os.environ['SUPABASE_DB_URL']); cur = conn.cursor()
cur.execute("""
  select id, platform, status,
         coalesce(data->>'brand',''),
         coalesce(data->>'angle',''),
         coalesce(data->>'persona',''),
         coalesce(data->>'hookType',''),
         coalesce(data->>'funnelStage',''),
         coalesce(data->>'_clickupDocPageUrl','')
  from public.inspirations
  where product_id = %s
  order by id asc
""", ('[PRODUCT_ID]',))
rows = cur.fetchall()
today = datetime.date.today().isoformat()
print("# 📋 Master Tracker — [PRODUCT_NAME] Inspirations\n")
print(f"Last updated: {today}")
print("* * *\n")
print("| ID | Brand | Platform | Angle | Persona | Hook | Funnel | Status | Brief |")
print("| ---| ---| ---| ---| ---| ---| ---| ---| --- |")
for (ins_id, platform, status, brand, angle, persona, hook, funnel, brief_url) in rows:
    brief = f"[Open]({brief_url})" if brief_url else "—"
    print(f"| {ins_id} | {brand or '—'} | {platform or '—'} | {angle or '—'} | {persona or '—'} | {hook or '—'} | {funnel or '—'} | {status or 'Saved'} | {brief} |")
print("\n* * *\n")
print("**Status options:** `Saved` · `Testing` · `Winner` · `Loser` · `Replicated` · `Archived`")
cur.close(); conn.close()
PYEOF
```

Then write the file contents as the new page content via `clickup_update_document_page`:

- `document_id`: [DOC_ID]
- `page_id`: [MASTER_TRACKER_PAGE_ID] from products.config
- `name`: `📋 Master Tracker`
- `sub_title`: `All [PRODUCT_NAME] inspirations — status, decision, quick reference`
- `content_format`: `text/md`
- `content`: contents of `/tmp/tracker_[PRODUCT_ID].md`

---

## Step 6.7 — Self-heal wiped brief URLs (NEW — run after every batch)

**Why:** Even though we write `_clickupDocPageUrl` directly to `inspirations.data`, the dashboard's frontend `saveInspirations` historically did a full-object upsert using its in-memory copy, which could overwrite the URL with an empty string if the frontend's copy was stale (e.g. realtime event arrived after the save was queued). The dashboard code was fixed in April 2026 to server-win for server-owned keys, but older dashboard deploys may still exhibit the bug. This self-heal step makes every run idempotently repair URLs — so even if something wipes the URL between runs, the next run fixes it.

Run this at the end of every classify batch, AFTER all per-item writes and doc page creates are done:

```bash
export $(grep -v '^#' "/Users/gauravpataila/Documents/Claude/Clickup /.env" | xargs)
python3 <<'PYEOF'
import os, json, psycopg2, requests, re
conn = psycopg2.connect(os.environ['SUPABASE_DB_URL']); cur = conn.cursor()

# Find all classified rows missing a brief URL, grouped by product
cur.execute("""
  select i.product_id,
         coalesce(p.config->>'doc_id','') as doc_id,
         i.id,
         (coalesce(i.data->>'brand','') || ' | ' || coalesce(i.data->>'angle','')) as search_hint
  from public.inspirations i
  join public.products p on p.id = i.product_id
  where i.status = 'Classified'
    and coalesce(i.data->>'_clickupDocPageUrl','') = ''
    and coalesce(p.config->>'doc_id','') <> ''
""")
orphans = cur.fetchall()
print(f'[self-heal] {len(orphans)} rows missing brief URLs')

# Group by doc_id → list doc's pages once, match by ins_id prefix
from collections import defaultdict
by_doc = defaultdict(list)
for product_id, doc_id, ins_id, hint in orphans:
    by_doc[doc_id].append((product_id, ins_id, hint))

CLICKUP_TOKEN = os.environ.get('CLICKUP_API_KEY','')
WS_ID = '9016762494'
headers = {'Authorization': CLICKUP_TOKEN}
repaired = 0

for doc_id, items in by_doc.items():
    # List all pages in this doc
    r = requests.get(f'https://api.clickup.com/api/v3/workspaces/{WS_ID}/docs/{doc_id}/pages',
                     headers=headers, timeout=30)
    if r.status_code != 200:
        print(f'  [self-heal] could not list pages for doc {doc_id}: {r.status_code}')
        continue
    pages = r.json() if isinstance(r.json(), list) else r.json().get('pages', [])
    # Build ins_id → page_id lookup from page names (they start with "INS-XXX" or "[INS-XXX]")
    page_by_ins = {}
    for p in pages:
        name = p.get('name','') or ''
        m = re.match(r'^\[?([A-Z0-9-]+)[\]\s]', name)
        if m: page_by_ins[m.group(1)] = p.get('id')

    for product_id, ins_id, hint in items:
        page_id = page_by_ins.get(ins_id)
        if not page_id: continue
        url = f'https://app.clickup.com/{WS_ID}/docs/{doc_id}/{page_id}'
        cur.execute("""
          update public.inspirations
          set data = coalesce(data,'{}'::jsonb) || %s::jsonb
          where id = %s and product_id = %s
        """, (json.dumps({
          '_clickupDocPageUrl': url,
          '_clickupDocId': page_id,
          '_inspoDocCreated': True,
        }), ins_id, product_id))
        repaired += 1
        print(f'  [self-heal] repaired {ins_id} -> {url}')

conn.commit(); cur.close(); conn.close()
print(f'[self-heal] done: repaired {repaired} row(s)')
PYEOF
```

This step is cheap (one ClickUp API call per doc, one UPDATE per orphan row) and guarantees that by the time Step 8 prints the summary, no classified inspiration is missing its brief link in the dashboard.

---

## Step 7 — Clean up

```bash
rm -rf /tmp/ins_work_* /tmp/ins_pipeline_*.py /tmp/result_*.json /tmp/tracker_*.md
```

No more bridge cleanup — there is no bridge.

---

## Step 8 — Print summary

```
✅ Classified N inspiration(s) across K products

 INS_ID   | Product              | Platform | Brand     | Hook         | Funnel | Doc   | Status
----------|----------------------|----------|-----------|--------------|--------|-------|--------
 INS-003  | ASTRO REKHA          | Instagram| AstroTalk | Aspirational | TOF    | ✓     | ✓ done
 INS-004  | Kids Mental Health   | Facebook | Brand XYZ | Curiosity    | TOF    | ✗     | ✓ done
 INS-005  | KIDS LIFE SKILL      | TikTok   | —         | —            | —      | —     | ✗ error
```

Tell the user: "Done. The dashboard auto-updates via Supabase realtime — check the Vercel URL, rows will have filled in and each classified inspo has a 📄 Brief link to its ClickUp doc page."

---

## Error handling

- **Supabase connection fails**: print the error, stop, tell the user to check `.env` and internet connectivity.
- **Queue empty**: print "No pending items in inspiration_queue. Queue some URLs from the dashboard." Stop.
- **Product has empty `doc_id`**: Skip doc creation for that product. Still write the classification result. Note `clickup_doc_page_url: ""`. Tell user to add doc_id to `products.config->>'doc_id'` via the Supabase SQL editor.
- **Doc page creation fails**: still save the classification result. Just leave `clickup_doc_page_url` empty.
- **Facebook ad not found / yt-dlp fails / no frames**: update queue row with `status='error'` and `error_message='<message>'`; do NOT write a result row; continue with other items.
- **Prerequisites missing**: `brew install ffmpeg` · `pip3 install psycopg2-binary requests playwright` · `python3 -m playwright install chromium`

---

## Migration notes

- As of April 2026, the bridge at `localhost:5002` is deprecated. If you find references to `INS_BRIDGE`, `/tmp/immuvi_pending.json`, or `/tmp/immuvi_classification_results.json` anywhere, they can be removed.
- The dashboard at `https://immuvi-command-center.vercel.app` reads/writes Supabase directly. Teammates can queue URLs; only Gaurav (on this Mac) runs the classifier due to ffmpeg/yt-dlp/Playwright requirements.
