# Immuvi Command Center — Cloud Migration Plan

**Goal:** Move from local-only (localhost + /tmp files + browser localStorage) to a fully online, multi-user tool.

**Stack:** Supabase (shared DB) + GitHub (source of truth) + Vercel (hosting).

**Decisions locked:**
- Auth: none for v1 (anyone with URL can use)
- Access: all teammates see all 3 products
- Bridge server: killed entirely (classifier reads/writes Supabase directly)
- GitHub: new private repo

---

## Architecture (after migration)

```
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│  Teammate's      │       │  Vercel          │       │  Supabase        │
│  browser         │◀─────▶│  (static HTML)   │◀─────▶│  (Postgres DB)   │
└──────────────────┘       └──────────────────┘       └──────────────────┘
                                                              ▲
                                                              │
                                                    ┌─────────┴────────┐
                                                    │  Gaurav's Mac    │
                                                    │  (Claude Code    │
                                                    │   runs classifier│
                                                    │   locally, reads │
                                                    │   queue from     │
                                                    │   Supabase,      │
                                                    │   writes results │
                                                    │   to Supabase)   │
                                                    └──────────────────┘
```

**Dies in this migration:** bridge.py, /tmp/*.json files, all localStorage *shared* state.
**Stays on Gaurav's Mac:** Claude Code + ffmpeg + yt-dlp + Playwright (for classification).
**Kept in localStorage:** ClickUp API key, last active product (UI preference).

---

## GitHub workflow

**Repo:** `immuvi-command-center` (private)

### Branch strategy (kept simple for a small team)
- `main` — production. Every push auto-deploys to Vercel.
- `dev` — optional working branch when a change is risky or needs review. Merge to `main` when ready.
- For v1: push straight to `main` is fine. Add `dev` later when team starts contributing.

### Files in the repo
```
immuvi-command-center/
├── immuvi-command-center.html    # the dashboard (single file)
├── README.md                     # setup + how to run locally + how it's deployed
├── .gitignore                    # keeps /tmp files, .env, backups, logs out
├── .env.example                  # template for env vars (Supabase keys)
├── MIGRATION_PLAN.md             # this file
├── schema.sql                    # Supabase schema (re-runnable)
├── scripts/
│   ├── export-localstorage.js    # paste in browser console to dump current state
│   └── seed-from-localstorage.py # import dumped JSON into Supabase
└── backups/                      # git-ignored, keeps old HTML versions
```

### What is NOT committed
- `.env` (contains Supabase service_role key)
- `backups/` folder (your local safety copies)
- Any `/tmp` data or bridge logs
- Previous per-version HTML backup files

### Deploy flow (after first setup)
```
Edit HTML → git add → git commit → git push origin main
                                   ↓
                            Vercel detects push
                                   ↓
                          Auto-deploys to production URL
                                   ↓
                        Teammates see the change instantly
```
No build step needed — it's a static HTML file. Vercel just serves it.

### Secrets in GitHub
- **Supabase anon key** — safe in the HTML (public by design, RLS protects data). Committed.
- **Supabase service_role key** — NEVER committed. Only lives in your `.env` on your Mac for the one-time data import, and gets rotated after migration.
- **ClickUp API keys** — never touched. Each user enters their own in the browser.

### Commit hygiene
- One change = one commit with a short message (`add Ready to Launch KPI`, `swap localStorage to Supabase for matrix`, etc.)
- Tag releases when we hit milestones: `v1.0-cloud` after migration, `v1.1-auth` when we add login, etc.
- Rollback is trivial: `git revert <commit>` + push → Vercel redeploys the old version.

---

## Supabase schema (draft)

### `products`
| col | type | notes |
|---|---|---|
| id | text (PK) | e.g. "immuvi", "astro-rekha", "kids-mental-health" |
| name | text | display name |
| config | jsonb | { doc_id, clickup_list_ids, etc. } |
| created_at | timestamptz | default now() |

### `angles`
| col | type | notes |
|---|---|---|
| id | text (PK) | e.g. "ang-002" |
| product_id | text (FK → products.id) | |
| name | text | |
| status | text | Untested / Approved / Testing / ... |
| source_link | text | |
| notes | text | |
| updated_at | timestamptz | |

### `personas`
| col | type | notes |
|---|---|---|
| id | text (PK) | e.g. "per-003" |
| product_id | text (FK → products.id) | |
| name | text | |
| status | text | |
| source_link | text | |
| notes | text | |
| updated_at | timestamptz | |

### `angle_personas` (matrix pairings)
| col | type | notes |
|---|---|---|
| id | uuid (PK) | |
| product_id | text | |
| angle_id | text | |
| persona_id | text | |
| linked | boolean | |

### `ads`
| col | type | notes |
|---|---|---|
| id | text (PK) | e.g. "AD-003" |
| product_id | text | |
| format_name | text | |
| ad_link | text | |
| drive_link | text | |
| ad_type | text | Video/Photo/AI Style/etc. |
| funnel_stage | text | TOF/MOF/BOF |
| status | text | Untested / Ready to Launch / Testing / Winner / ... |
| angle | text | |
| persona | text | |
| parent_ad_id | text | for variations |
| variation_number | int | |
| ad_origin | text | New Find / Variation / etc. |
| clickup_task_id | text | after pushing to production |
| updated_at | timestamptz | |

### `matrix_cells`
Replaces `MATRIX_CELL_META` + `CELL_CREATIVE_ASSIGNMENTS`.
| col | type | notes |
|---|---|---|
| id | uuid (PK) | |
| product_id | text | |
| angle_id | text | |
| persona_id | text | |
| meta | jsonb | arbitrary cell state |
| creative_assignments | jsonb | array of {adId, slot} |
| action_status | text | |
| updated_at | timestamptz | |

### `manual_actions`
| col | type | notes |
|---|---|---|
| id | uuid (PK) | |
| product_id | text | |
| payload | jsonb | |
| live_status | text | |
| created_at | timestamptz | |

### `inspiration_queue`
Replaces `/tmp/immuvi_pending.json` + bridge `POST /queue`.
| col | type | notes |
|---|---|---|
| id | uuid (PK) | |
| ins_id | text | e.g. "INS-003" |
| product_id | text | |
| url | text | |
| platform | text | facebook / instagram / tiktok / etc. |
| status | text | pending / processing / done / error |
| queued_at | timestamptz | |
| processed_at | timestamptz | |

### `inspiration_results`
Replaces `/tmp/immuvi_classification_results.json`.
| col | type | notes |
|---|---|---|
| id | uuid (PK) | |
| ins_id | text (unique per product) | |
| product_id | text | |
| source_url | text | |
| platform | text | |
| metadata | jsonb | brand, body_text, title, cta, etc. |
| classification | jsonb | hook_type, creative_structure, persona, angle, etc. |
| brief | jsonb | 7-section brief data for ClickUp doc |
| clickup_doc_page_url | text | |
| duration_seconds | numeric | |
| frames_extracted | int | |
| classified_at | timestamptz | |

### `inspirations` (saved URLs not yet classified — dashboard-only list)
| col | type | notes |
|---|---|---|
| id | text (PK) | INS-XXX |
| product_id | text | |
| url | text | |
| title | text | |
| added_by | text | (freeform for v1, becomes user_id if we add auth) |
| status | text | saved / queued / classified |
| added_at | timestamptz | |

---

## Migration phases

### Phase 1 — Foundations (Gaurav's setup, ~20 min)
- [ ] Create Supabase project (free tier)
- [ ] Create GitHub private repo `immuvi-command-center`
- [ ] Send Gaurav: Supabase URL + anon key + service_role key + GitHub repo URL

### Phase 1.5 — Repo bootstrap (~15 min, I do it)
- [ ] Create `.gitignore`, `README.md`, `.env.example`, `schema.sql`
- [ ] Move current HTML into repo structure
- [ ] `git init` in project folder, set remote to GitHub repo
- [ ] First commit + push to `main`
- [ ] Connect Vercel → GitHub repo → auto-deploy on push
- [ ] Confirm the current HTML works on the live Vercel URL (before any migration)

### Phase 2 — Schema + seed (~30 min)
- [ ] Run schema SQL in Supabase SQL editor
- [ ] Export current localStorage from Gaurav's browser to JSON
- [ ] Import Gaurav's data into Supabase tables

### Phase 3 — HTML swap (~1.5 hrs)
- [ ] Add Supabase JS client via CDN
- [ ] Swap `localStorage.getItem/setItem` calls for Supabase queries (except API key + active product)
- [ ] Swap `fetch(INS_BRIDGE + ...)` calls for Supabase queries
- [ ] Add realtime subscriptions so dashboard updates when classifier writes results
- [ ] Delete bridge-related code paths

### Phase 4 — Classifier skill update (~30 min)
- [ ] Update `classify-inspiration` SKILL.md:
  - Step 1: read queue from Supabase `inspiration_queue where status='pending'`
  - Step 6: write results to Supabase `inspiration_results`
  - Update queue status to `processing` → `done` as items process
- [ ] Remove bridge auto-start and `/tmp` file logic

### Phase 5 — Deploy + test (~30 min)
- [ ] Commit + push → Vercel auto-deploy
- [ ] Smoke-test dashboard on Vercel URL
- [ ] Teammate opens URL → enters own ClickUp key → sees shared data
- [ ] Teammate queues a URL → Gaurav runs `/classify-inspiration` → teammate sees result

### Phase 6 — Cleanup (5 min)
- [ ] Remove `bridge.py`, `start.sh` bridge line, `/tmp` references
- [ ] Archive old SKILL.md as `.bak`
- [ ] Update README with new workflow

---

## Secrets handling

| Secret | Where it lives |
|---|---|
| Supabase anon key | Embedded in HTML (public — RLS protects data) |
| Supabase service_role key | Only on Gaurav's Mac, in a `.env` file used by the classifier script. **Never committed.** |
| ClickUp API key | Each user's browser localStorage |

`.env` is in `.gitignore`. Service key never reaches Vercel.

---

## Row Level Security (RLS)

For v1 (no auth): enable RLS, create policies that allow `anon` role to SELECT/INSERT/UPDATE everything. This is no worse than the current setup (anyone with HTML access sees everything) but lets us tighten later by swapping policies — no schema change.

When we add auth (v2): flip policies to require `auth.uid()`.
