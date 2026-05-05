# Agentic Robot Motion (ARM) Website

A lightweight single-page application (SPA) lab website with Home, Research, Scenario, Tutorial, and Join Us pages.

## Local Preview

Open `index.html` directly in your browser, or serve the folder with any static file server.

## Routing Architecture

- Single entry page: `index.html`
- Client-side routing: `script.js`
- Routes: `/`, `/research`, `/research/:slug`, `/scenario`, `/scenario/:slug`, `/tutorial`, `/tutorial/:slug`, `/join-us`, `/apply/:role`

## Deploy to GitHub Pages

1. Create a new GitHub repository (for example: `arm-lab-site`).
2. In this folder, initialize and push:
   ```bash
   git init
   git add .
   git commit -m "Initial ARM lab website"
   git branch -M main
   git remote add origin https://github.com/<your-user>/<your-repo>.git
   git push -u origin main
   ```
3. In GitHub repo settings:
   - Go to **Pages**.
   - Set **Build and deployment** source to **Deploy from a branch**.
   - Choose branch `main` and folder `/ (root)`.
4. Save and wait 1-2 minutes. Your site will be online at:
   `https://<your-user>.github.io/<your-repo>/`

## Customize Quickly

- Page shell placeholders: edit `index.html`.
- JSON-driven config and i18n text: edit `site-config.json`.
- Route templates and rendering logic: edit `script.js`.
- Style and layout visuals: edit `styles.css`.

## Edit Content JSON

Each section has a list file plus its own posts folder:

- Research list: `research-list.json`
- Research posts: `research-posts/*.json`
- Scenario list: `scenario-list.json`
- Scenario posts: `scenario-posts/*.json`
- Tutorial list: `tutorial-list.json`
- Tutorial posts: `tutorial-posts/*.json`
- Join Us roles: `joinus-list.json`
- Site-level text/config (nav, intro, apply labels, Supabase): `site-config.json`

## Apply Form (Supabase)

Apply submission now uses Supabase end-to-end:

1. Resume file upload to Supabase Storage bucket `applications-resumes`.
2. Form fields inserted into table `public.applications` (structured payload + flattened columns).
3. Supabase Edge Function `send-application-email` sends forwarding email to recipients (Mr. Cui + Dr. Yang by default).

### Frontend Config (`site-config.json`)

Use the `supabase` block:

- `supabase.enabled`: set `true` to enable submission.
- `supabase.url`: your Supabase project URL.
- `supabase.anonKey`: your Supabase anon public key.
- `supabase.storageBucket`: default `applications-resumes`.
- `supabase.emailFunctionName`: default `send-application-email`.
- `supabase.notifyEmails`: recipient list, e.g. `cuichaochen@ymbot.com`, `omtcyang@gmail.com`.

### Supabase Setup

1. Run SQL in `supabase/sql/applications.sql` (creates bucket/table/policies).
2. Deploy function in `supabase/functions/send-application-email/index.ts`.
3. Set function secrets:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY`
   - `RESEND_FROM`
   - `NOTIFY_EMAILS` (optional fallback, comma-separated)

Example deploy commands:

```bash
supabase functions deploy send-application-email
supabase secrets set SUPABASE_URL="https://<project-ref>.supabase.co"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
supabase secrets set RESEND_API_KEY="<resend-api-key>"
supabase secrets set RESEND_FROM="ARM Apply <onboarding@resend.dev>"
supabase secrets set NOTIFY_EMAILS="cuichaochen@ymbot.com,omtcyang@gmail.com"
```

After setup, email subject format stays: `岗位名称 - 申请人姓名`.

## JSON Cache Versioning

Content JSON files are requested with a version query string to avoid stale browser/CDN cache on release.

- Configure version in `site-config.json` with `dataVersion` (for example: `20260503`).
- The app appends `?v=<dataVersion>` when requesting JSON data (lists, posts, joinus, config).
- On each release that updates JSON content, bump `dataVersion` so clients request a new URL and fetch fresh data.

Notes:

- If your hosting supports `ETag` or `Last-Modified`, keep them enabled to allow efficient `304` validation.
- `dataVersion` is the strongest guarantee for immediate content refresh after publish.

## Media Asset Folders

- Home media:
   - `home-posts/video/` (home hero video, expected file: `home.mp4`)
   - `home-posts/figure/`
- Research media:
   - `research-posts/video/`
   - `research-posts/figure/`
- Scenario media:
   - `scenario-posts/video/`
   - `scenario-posts/figure/`
- Tutorial media:
   - `tutorial-posts/video/`
   - `tutorial-posts/figure/`

Each post JSON should point `videoUrl` and `figureUrl` to its own folder path.

To add a post:

1. Create a new post JSON inside the corresponding `*-posts` folder.
2. Add an entry for it in that section's `*-list.json` file.
3. Reload the page.
