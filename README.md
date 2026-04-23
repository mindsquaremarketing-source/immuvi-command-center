# Immuvi Command Center

Single-page dashboard for managing paid-ad creative pipelines — angles, personas, ad matrix, inspiration classification — all synced to ClickUp and stored in Supabase.

**What changed:** the original `immuvi-command-center.html` was a single 14,500-line file. It has been split into an `index.html` plus CSS and JS modules so multiple people can edit different features without stepping on each other. No build step, no bundler — plain `<script>` tags.

---

## Live URL

Deployed to Vercel from the `main` branch — every push auto-deploys.

(Set this once you connect your fork to Vercel.)

---

## Run locally

From inside the repo folder:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
# then open http://localhost:8000/
```

On Windows, `py -3 -m http.server 8000 --bind 127.0.0.1` works the same.

---

## Project layout

```
immuvi-command-center/
├── index.html                   ← markup + <link>/<script> tags only (~400 lines)
├── css/
│   ├── base.css                 ← fonts, layout, tabs, tracker, KPI strip
│   ├── matrix.css               ← creative-matrix grid + cells + detail panel
│   └── modals.css               ← AI modal + product-profile styles
├── js/
│   ├── core/
│   │   ├── config.js            ← Supabase URL/key, field-option defaults
│   │   ├── utils.js             ← helpers (esc, mono, debounce, merge logic)
│   │   ├── ui.js                ← modal, toast, stat-popup primitives
│   │   ├── processing.js        ← process(ads) — builds derived P state
│   │   ├── db.js                ← Supabase client + DAL + global state vars
│   │   ├── sync.js              ← ClickUp ↔ Supabase sync engine
│   │   └── cloud.js             ← cloud persistence + boot (DOMContentLoaded)
│   ├── features/
│   │   ├── hq.js                ← Command HQ tab (KPIs, coverage, gap box)
│   │   ├── angles.js            ← Angles tracker tab
│   │   ├── personas.js          ← Personas tracker tab
│   │   ├── creatives.js         ← Creative Tracker tab (big data table)
│   │   ├── winners.js           ← Winners hub
│   │   ├── actions.js           ← Action Plan tab
│   │   ├── production.js        ← Production kanban
│   │   ├── matrix.js            ← Creative Matrix tab (biggest file)
│   │   ├── inspiration.js       ← Inspiration queue + picker
│   │   ├── mutations.js         ← shared CRUD across tabs
│   │   ├── winner-actions.js    ← promote/demote winner operations
│   │   ├── sort-filter.js       ← tracker filters + sorting
│   │   ├── dnd.js               ← drag & drop (variations, kanban, reorder)
│   │   ├── bulk.js              ← bulk operations
│   │   └── field-options.js     ← per-product dropdown settings UI
│   └── integrations/
│       └── clickup.js           ← ClickUp push/pull via /api/clickup proxy
├── api/
│   ├── clickup.js               ← Vercel serverless function (CORS proxy to api.clickup.com)
│   └── install-skill.js         ← Serverless skill delivery (for classifier machines)
├── supabase/
│   ├── config.toml              ← Supabase CLI config
│   └── migrations/              ← schema migrations
├── schema.sql                   ← idempotent full schema (run this in Supabase SQL editor)
├── scripts/
│   ├── export-localstorage.js   ← run in browser console to dump state as JSON
│   └── seed-from-localstorage.py← import that JSON into Supabase
├── team-skill/                  ← optional classifier (runs on one team member's Mac)
├── vercel.json                  ← Vercel deployment config
├── .env.example                 ← secrets template (never commit real .env)
├── .gitignore
├── MIGRATION_PLAN.md            ← historical — original cloud migration notes
└── SETUP_WINDOWS.md             ← first-time setup guide for your org
```

---

## Load order for JS modules

`index.html` loads scripts in this fixed order — don't shuffle without thinking:

1. `core/config.js` — constants first (field-option defaults)
2. `core/utils.js` — helpers + primary state declarations are referenced by everything below
3. `core/ui.js` — modal / toast primitives
4. `core/processing.js` — `process()` function that features call
5. `core/db.js` — Supabase client + global state (`ANGLES`, `PERSONAS`, `ADS`, etc.)
6. Feature files (order among them doesn't matter — they only define functions)
7. `integrations/clickup.js`
8. `core/sync.js` — wires realtime subscriptions
9. `core/cloud.js` — last, because it contains the `DOMContentLoaded` boot

If you add a new JS file, add a `<script src="...">` tag to `index.html` in the right bucket.

---

## Rule of thumb for where code goes

- **Touches the DOM of one specific tab?** → `js/features/<tab>.js`
- **Shared across tabs (formatters, helpers, constants)?** → `js/core/utils.js` or `js/core/ui.js`
- **Talks to Supabase?** → `js/core/db.js`
- **Talks to ClickUp?** → `js/integrations/clickup.js`
- **Boot sequence or realtime plumbing?** → `js/core/cloud.js` / `js/core/sync.js`

---

## First-time setup

See [`SETUP_WINDOWS.md`](SETUP_WINDOWS.md) for step-by-step instructions to wire up a fresh Supabase project, GitHub repo, and Vercel deployment under your own accounts.

---

## Deployment

Every push to `main` auto-deploys to Vercel. No build step — Vercel serves the static files directly.

```bash
git add .
git commit -m "your change"
git push origin main
# Vercel builds + deploys in ~30 seconds
```

Rollback: `git revert <commit> && git push`.

---

## Team onboarding

1. Open the Vercel URL.
2. Paste your personal ClickUp API key on first load (stays in your browser only — not shared).
3. You see the shared products, angles, personas, matrix, ads from Supabase.

Auth is not enabled in v1 — anyone with the URL can access. Add real auth later; the schema's RLS is already on and ready to flip.
