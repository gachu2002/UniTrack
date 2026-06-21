# Deployment Guide

This guide walks through deploying UniTrack on the recommended free stack:

| Layer | Provider |
| --- | --- |
| Frontend | Vercel |
| API | Render |
| Database | Neon Postgres |
| Evidence files | Cloudflare R2 |
| Optional DNS/edge | Cloudflare |
| Optional uptime checks | UptimeRobot or Better Stack |

Use `docs/deployment.md` as the short reference. Use this file when doing the deployment step by step.

## Before You Start

You need accounts for:

- GitHub, with this repository pushed to a branch you can deploy.
- Vercel.
- Render.
- Neon.
- Cloudflare.

You also need local command-line access from the repository root for migration and verification commands.

## Deployment Values To Collect

Fill these in as you go:

| Value | Example | Final value |
| --- | --- | --- |
| Vercel frontend origin | `https://unitrack.vercel.app` |  |
| Render API origin | `https://unitrack-api.onrender.com` |  |
| API base URL | `https://unitrack-api.onrender.com/api/v1` |  |
| Neon `DATABASE_URL` | `postgresql://...` |  |
| R2 bucket | `unitrack-evidence` |  |
| R2 endpoint | `https://<account-id>.r2.cloudflarestorage.com` |  |
| Bootstrap admin email | `admin@unitrack.local` |  |

Do not write real secrets into this file. Store secrets in the provider dashboards or a password manager.

## Step 1: Local Preflight

From the repository root, verify the app is healthy before deploying.

Install dependencies:

```bash
pnpm install --frozen-lockfile
```

Validate the database migrations:

```bash
make db-validate
```

Build the API:

```bash
make api-build
```

Build the web app:

```bash
pnpm --filter @unitrack/web build
```

Optional local evidence-file check:

```bash
make db-up-local
(cd apps/api && TEST_DATABASE_URL="postgres://postgres:postgres@localhost:55432/unitrack?sslmode=disable" go test ./internal/app -run TestProgressEvidenceFileLifecycleAndPermissions -count=1)
```

Equivalent command if your shell is already in `apps/api`:

```bash
TEST_DATABASE_URL="postgres://postgres:postgres@localhost:55432/unitrack?sslmode=disable" go test ./internal/app -run TestProgressEvidenceFileLifecycleAndPermissions -count=1
```

Expected result:

- API build passes.
- Web build passes.
- DB validation passes.
- Optional evidence lifecycle test passes if local Postgres is running.

## Step 2: Create Cloudflare R2 Storage

Create private object storage before deploying the API, because production startup requires R2.

1. Open Cloudflare Dashboard.
2. Go to `R2 Object Storage`.
3. Create a bucket named `unitrack-evidence`.
4. Keep the bucket private.
5. Create an R2 API token/access key with access to this bucket.
6. Copy these values into your password manager:

```env
R2_BUCKET=unitrack-evidence
R2_ENDPOINT=https://<cloudflare-account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<r2-access-key-id>
R2_SECRET_ACCESS_KEY=<r2-secret-access-key>
R2_REGION=auto
R2_OBJECT_PREFIX=
```

Notes:

- `R2_ENDPOINT` uses your Cloudflare account ID, not the bucket name.
- `R2_OBJECT_PREFIX` can stay empty.
- If you want a folder-like prefix later, use a value such as `production`.
- Do not make the bucket public. UniTrack downloads evidence through the API after project permission checks.

## Step 3: Create Neon Postgres

1. Open Neon.
2. Create a new project for UniTrack.
3. Create or use the default production database.
4. Copy the connection string.
5. Prefer a pooled connection string for the Render app if Neon offers one.
6. Keep the direct connection string available for migrations if needed.

The connection string becomes:

```env
DATABASE_URL=<neon-postgres-url>
```

Run migrations from the repository root:

```bash
make db-up DATABASE_URL='<neon-postgres-url>'
```

Expected result:

- Goose applies all migrations successfully.
- The database has the UniTrack schema.

Do not run demo seed data unless this deployment is intentionally a demo environment.

## Step 4: Deploy The API On Render

1. Open Render Dashboard.
2. Create a new `Web Service`.
3. Connect the GitHub repository.
4. Use the repository root as the root directory.
5. Set the runtime/environment to Go if Render asks.
6. Set the build command:

```bash
go build -o ./apps/api/bin/server ./apps/api/cmd/server
```

7. Set the start command:

```bash
./apps/api/bin/server
```

8. Add these environment variables on the Render API service:

```env
APP_ENV=production
DATABASE_URL=<neon-postgres-url>
AUTH_BOOTSTRAP_ADMIN_EMAIL=admin@unitrack.local
AUTH_BOOTSTRAP_ADMIN_PASSWORD=<strong-random-password>
CORS_ALLOWED_ORIGINS=https://<temporary-or-final-vercel-domain>
SESSION_SECURE=true
SESSION_SAME_SITE=none
UPLOAD_STORAGE_BACKEND=r2
R2_BUCKET=unitrack-evidence
R2_ENDPOINT=https://<cloudflare-account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<r2-access-key-id>
R2_SECRET_ACCESS_KEY=<r2-secret-access-key>
R2_REGION=auto
R2_OBJECT_PREFIX=
```

If you do not know the final Vercel URL yet, use the URL you expect, deploy the frontend, then return to Render and update `CORS_ALLOWED_ORIGINS` exactly.

9. Deploy the Render API service.
10. Copy the Render API origin, for example:

```text
https://unitrack-api.onrender.com
```

11. Verify API health in a browser:

```text
https://<render-api-domain>/api/v1/health
```

12. Verify API readiness after migrations:

```text
https://<render-api-domain>/api/v1/ready
```

Expected result:

- `/api/v1/health` returns `200`.
- `/api/v1/ready` returns `200`.
- Render logs show the API started without configuration validation errors.

If startup fails, check the troubleshooting section before changing code.

## Step 5: Deploy The Frontend On Vercel

1. Open Vercel Dashboard.
2. Import the GitHub repository.
3. Set the project root directory to:

```text
apps/web
```

4. Use Vite defaults if Vercel detects them.
5. Set the build command:

```bash
pnpm build
```

6. Set the output directory:

```text
dist
```

7. Confirm `apps/web/vercel.json` is included in the deployment. This file rewrites deep links such as `/dashboard` and `/workspace/projects/...` back to `index.html` so browser refreshes work with React Router.

8. Add this Vercel environment variable:

```env
VITE_API_URL=https://<render-api-domain>/api/v1
```

9. Deploy the frontend.
10. Copy the final Vercel frontend origin, for example:

```text
https://unitrack.vercel.app
```

## Step 6: Finalize Cross-Origin Auth Config

The frontend and API run on separate HTTPS origins, so cookie auth depends on exact environment values.

In Render, update the API service environment variable:

```env
CORS_ALLOWED_ORIGINS=https://<final-vercel-domain>
```

The value must be the exact origin only:

```text
https://example.vercel.app
```

Do not include:

- A trailing path such as `/api/v1`.
- A wildcard such as `*`.
- An HTTP origin in production.

Redeploy the Render API after changing `CORS_ALLOWED_ORIGINS`.

Confirm Vercel still has:

```env
VITE_API_URL=https://<render-api-domain>/api/v1
```

## Step 7: Verify Login And Session Cookies

Open the Vercel frontend URL.

Login with the bootstrap admin:

```text
admin@unitrack.local
<strong-random-password>
```

Verify:

- Login succeeds.
- Dashboard loads.
- Refresh keeps you signed in.
- Logout succeeds.
- Login again succeeds.

If login loops or `/auth/me` returns `401`, check:

- Render has `SESSION_SECURE=true`.
- Render has `SESSION_SAME_SITE=none`.
- Render has exact `CORS_ALLOWED_ORIGINS=https://<final-vercel-domain>`.
- Vercel has exact `VITE_API_URL=https://<render-api-domain>/api/v1`.
- The browser is not blocking third-party cookies in a way that affects this flow.

## Step 8: Verify Evidence Uploads With R2

Use the app to create a minimal evidence-upload path:

1. Login as admin or create a teacher/student test setup.
2. Create a project.
3. Add a student member if needed.
4. Create a checkpoint and assignment.
5. Submit progress for that assignment.
6. Upload a small evidence file.
7. Download the file from the app.
8. Delete the file while it is still allowed.

Then open Cloudflare R2 and confirm:

- The object appears under a key like `projects/<project-id>/<stored-name>`.
- The object disappears after app-level delete.
- The bucket is still private.

Expected result:

- The browser never talks directly to R2.
- Upload/download/delete happen through the UniTrack API.
- Project permissions still control file access.

## Step 9: Add Uptime Checks

Use UptimeRobot or Better Stack free checks.

Recommended checks:

| URL | Purpose |
| --- | --- |
| `https://<vercel-domain>` | Frontend availability. |
| `https://<render-api-domain>/api/v1/health` | API process/routing availability. |
| `https://<render-api-domain>/api/v1/ready` | API-to-database readiness. |

Use `/health` for shallow uptime. Use `/ready` after deployments or migrations to confirm Neon is reachable.

## Step 10: Post-Launch Cleanup

After the first successful login:

- Change the bootstrap admin password through the app if the initial password was temporary.
- Store final production URLs in your project notes.
- Store provider secrets in a password manager.
- Keep R2 bucket private.
- Confirm no R2 secret keys were added to Vercel.
- Confirm no `.env` file with secrets was committed.

## Common Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Render API fails at startup | Missing production env var | Check Render logs for config validation error and fill the missing env var. |
| `SESSION_SAME_SITE=none requires SESSION_SECURE=true` | Cookie config mismatch | Set `SESSION_SECURE=true` on Render. |
| `CORS_ALLOWED_ORIGINS must list exact origins` | Wildcard CORS | Replace `*` with the exact Vercel origin. |
| Login succeeds but refresh logs out | Cookie not persisted | Check `SESSION_SECURE=true`, `SESSION_SAME_SITE=none`, exact CORS, and HTTPS frontend/API URLs. |
| Refreshing `/dashboard` or `/workspace/...` returns Vercel `404: NOT_FOUND` | Missing SPA fallback rewrite | Ensure `apps/web/vercel.json` is deployed and redeploy Vercel. |
| Frontend calls localhost API | Missing Vercel env var | Set `VITE_API_URL=https://<render-api-domain>/api/v1` and redeploy Vercel. |
| `/api/v1/ready` returns `503` | API cannot reach Neon | Check `DATABASE_URL`, Neon service status, and migrations. |
| Upload returns server error | R2 config or credentials issue | Check `UPLOAD_STORAGE_BACKEND=r2`, bucket name, endpoint, access key, secret key, and Render logs. |
| Download returns `404` after upload | Object missing from R2 | Check R2 permissions and avoid switching old local metadata to R2 without migrating objects. |
| Browser cannot directly open R2 object | Expected | Bucket should be private; download through the UniTrack API. |

## Rollback Plan

Frontend rollback:

- Use Vercel deployment history to promote the previous working frontend deployment.

API rollback:

- Use Render deployment history to redeploy the previous working API version.

Database rollback:

- Do not run destructive migration rollback commands casually.
- If a migration fails, stop and inspect the error before retrying.
- Prefer fixing forward unless you have a fresh backup and a clear rollback path.

R2 rollback:

- Do not delete the bucket during an incident.
- If credentials are exposed, rotate the R2 access key.
- If uploads fail, keep the API deployed but block or avoid evidence-upload workflows until credentials/config are fixed.

## First-Launch Limits

Expect these limits on the free stack:

- Render free API services can sleep and cold-start.
- Neon free tier has usage and connection limits.
- R2 is durable, but retention, malware scanning, MIME policy, quotas, and backup decisions still need hardening.
- API rate limits are in-memory, so keep the API single-instance until a shared rate-limit mechanism exists.
- No custom CDN or load balancer is needed for the first launch.

## Final Checklist

- Local build passed.
- R2 bucket created and private.
- Neon database created.
- Migrations applied to Neon.
- Render API deployed with production env vars.
- Render `/api/v1/health` returns `200`.
- Render `/api/v1/ready` returns `200`.
- Vercel frontend deployed with `VITE_API_URL`.
- Render `CORS_ALLOWED_ORIGINS` matches final Vercel origin exactly.
- Admin login works from the Vercel app.
- Refresh keeps the user signed in.
- Logout works.
- Evidence upload/download works through the app.
- R2 object appears in the private bucket.
- Uptime checks are configured.
- Temporary admin password is changed or stored securely.
