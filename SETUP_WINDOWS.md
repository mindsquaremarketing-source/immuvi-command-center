# Phase 0A — First-time setup on Windows

This guide walks you through claiming the project under your organization's accounts — Supabase, GitHub, Vercel. Follow it top to bottom. Estimated time: **45–60 minutes** for someone who has never done this before, **15 minutes** if you're familiar with Git and cloud services.

Your project folder is `D:\Lunar Wave Project's\immuvi-command-center`. That's where all the commands below assume you're working.

> **Before you start — a safety note about secrets.**
> This setup involves two kinds of credentials:
> - **Anon key** (Supabase) — safe to commit, it's public by design, protected by RLS.
> - **Service-role key** (Supabase), **ClickUp API key**, **GitHub tokens**, **Vercel tokens** — these are write-level credentials. **Never paste them into any chat (Slack, Discord, ChatGPT, Claude, email). Never commit them to git.** If you ever suspect one leaked, rotate it immediately from the dashboard that issued it.
> - This repo's `.gitignore` already excludes `.env`. Keep it that way.

---

## What you need before starting

- [ ] A Google or GitHub account you can use to sign up for Supabase, GitHub, and Vercel
- [ ] Git installed on Windows ([git-scm.com](https://git-scm.com/download/win)) — verify with `git --version` in PowerShell
- [ ] Python 3 installed (for the local dev server) — verify with `py --version`
- [ ] The project folder extracted at `D:\Lunar Wave Project's\immuvi-command-center`
- [ ] Your team's ClickUp API keys — each person gets their own later, not needed for setup

---

## Step 1 — Create a Supabase project (10 min)

1. Go to https://supabase.com, click **Start your project**, sign in.
2. Click **New project**.
   - **Name:** `immuvi-command-center` (or whatever fits your org)
   - **Database password:** click **Generate a password**, then **copy it immediately** into a password manager. You won't be able to view it again.
   - **Region:** pick the one closest to your team (e.g. `South Asia (Mumbai)` for India)
   - **Plan:** Free is fine for a 5-person team
3. Wait ~2 minutes for the project to provision. You'll land on the project dashboard.
4. On the left sidebar, click **Project Settings** (gear icon) → **API**. You'll see three things:
   - **Project URL** — looks like `https://xxxxxxxxxxxx.supabase.co`
   - **anon / public key** — the one that's safe in the browser
   - **service_role / secret key** — **DANGEROUS. DO NOT expose.** Only needed for the data-import script.

   **Copy these three values to a scratch file on your desktop.** You'll paste them into the project in a later step.

5. **Run the schema.** In the Supabase sidebar, click **SQL Editor** → **New query**. Open the file `D:\Lunar Wave Project's\immuvi-command-center\schema.sql` in Notepad, select all, copy, paste into the Supabase SQL editor, click **Run**.
   
   Expected: "Success. No rows returned." The schema creates all tables, RLS policies, and seeds 3 placeholder products (`astro-rekha`, `immuvi`, `kids-mental-health`).

6. **Replace the seed products with yours.** Click **Table Editor** → `products` table. Edit the three rows so `id`, `name`, and `config` reflect your org's products. (You can also do this from the SQL Editor with `UPDATE products SET ...` statements.)

---

## Step 2 — Wire the app to your new Supabase (2 min)

Open `D:\Lunar Wave Project's\immuvi-command-center\js\core\db.js` in your editor. Near the top of the file you'll see two constants:

```javascript
const SB_URL = 'https://...';
const SB_ANON = 'eyJ...';
```

Replace both with **your** Supabase Project URL and anon key from Step 1.4. **Do NOT put the service_role key here** — it must never reach the browser.

Save the file.

---

## Step 3 — Test it runs locally before touching GitHub (3 min)

In PowerShell, from the project folder:

```powershell
cd "D:\Lunar Wave Project's\immuvi-command-center"
py -3 -m http.server 8000 --bind 127.0.0.1
```

Open http://localhost:8000/ in your browser. You should see the dashboard — header, tabs, no errors. Open DevTools (F12) → Console. Expect zero red errors (some external font warnings are OK).

If you see red errors, **stop here and tell me what they say** before proceeding.

Press `Ctrl+C` in PowerShell to stop the server.

---

## Step 4 — Create the GitHub repo (5 min)

1. Go to https://github.com/new (you may need to sign in).
2. **Owner:** your org's GitHub org, or your personal account if you don't have one yet.
3. **Repository name:** `immuvi-command-center`
4. **Visibility:** **Private** (unless your org explicitly wants it public).
5. **Do NOT** check "Add a README", "Add .gitignore", or "Add a license" — the repo already has these.
6. Click **Create repository**.
7. On the next page, copy the URL shown — it looks like `https://github.com/your-org/immuvi-command-center.git`.

---

## Step 5 — Push the project to GitHub (5 min)

In PowerShell, from the project folder:

```powershell
cd "D:\Lunar Wave Project's\immuvi-command-center"

# If this folder already has a .git directory from the previous owner, remove it.
# This wipes any old commit history so nothing from the old team carries over.
if (Test-Path ".git") { Remove-Item -Recurse -Force .git }

# Start fresh
git init
git add .
git commit -m "Initial commit: modular split, ready for org setup"

# Add your new remote (replace the URL with what GitHub showed you)
git branch -M main
git remote add origin https://github.com/YOUR-ORG/immuvi-command-center.git
git push -u origin main
```

If prompted for credentials, use a **GitHub personal access token** (not your password). Create one at https://github.com/settings/tokens with `repo` scope.

After it finishes, reload your GitHub repo page — you should see all the files.

---

## Step 6 — Connect Vercel (10 min)

1. Go to https://vercel.com and sign in **with your GitHub account** (this is the easiest path — Vercel can then see your repos).
2. Click **Add New** → **Project**.
3. Find `immuvi-command-center` in the list of your GitHub repos. Click **Import**.
4. **Configure project:**
   - **Framework Preset:** select **Other** (no framework — it's plain HTML)
   - **Root directory:** leave as `./`
   - **Build command:** leave empty
   - **Output directory:** leave empty (Vercel auto-detects static)
   - **Install command:** leave empty
5. Click **Deploy**. Wait ~30 seconds.
6. Vercel gives you a URL like `https://immuvi-command-center-xxxx.vercel.app`. Open it. You should see the dashboard.

**From now on, every `git push origin main` auto-deploys.**

---

## Step 7 — Invite your team (5 min)

- **GitHub:** repo → Settings → Collaborators → add each teammate by GitHub username.
- **Supabase:** project → Settings → Team → invite by email.
- **Vercel:** project → Settings → Members → invite by email.
- **The Vercel URL:** just share it. No account needed for teammates to use the app itself — they open the URL, paste their own ClickUp key, and start using it.

---

## Step 8 — Your daily workflow

Any time you want to change something:

```powershell
cd "D:\Lunar Wave Project's\immuvi-command-center"

# Pull any changes teammates pushed
git pull

# Edit files with your editor (VS Code recommended: `code .`)

# Test locally
py -3 -m http.server 8000 --bind 127.0.0.1
# open http://localhost:8000/ — verify it works — Ctrl+C when done

# Commit + push
git add .
git commit -m "short message describing what you changed"
git push origin main

# Vercel auto-deploys in ~30 seconds
```

---

## Troubleshooting

**"git: command not found"** → install Git from git-scm.com, restart PowerShell.

**"py: command not found"** → install Python from python.org; make sure the "Add to PATH" checkbox is ticked during install.

**Supabase SQL editor says "relation already exists"** → safe to ignore; `schema.sql` is idempotent and you may have run it twice.

**Vercel deploys but page is blank** → open DevTools on the deployed URL, check the Console. If it says "Failed to load SB_URL" or similar, you didn't update `js/core/config.js` correctly. Fix, commit, push.

**CORS errors to ClickUp** → expected when running locally if you call the `/api/clickup` proxy. The proxy only works on Vercel. Either test ClickUp features on the deployed URL, or run `vercel dev` locally (requires `npm i -g vercel`).

**"Page loads but no data shows up"** → expected on first run; Supabase is empty except for your 3 products. Use the dashboard's UI to add angles, personas, and ads.

---

## What happens next

Once you've completed Phases 0A + 0B, you're ready for:

- **Phase 1** — seed the Supabase DB with your org's real angles, personas, and field options. Mostly dashboard clicks, ~1 day.
- **Phase 2** — the real gap-filling logic. This is where I'll be writing code for you again.

Ping me in a new conversation when you've finished Step 7 and the app is live on your Vercel URL. Say "phase 0 done, ready for phase 2."
