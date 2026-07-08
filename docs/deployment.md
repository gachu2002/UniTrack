# Deployment

Purpose: record the first-launch stack, deployment decisions, launch steps, troubleshooting, rollback, and known limits.

Scope: keep hosted stack, env, preflight, launch, rollback, and operational limits here; keep product behavior in `docs/features/`, auth policy in `docs/security-auth.md`, and test strategy in `docs/testing.md`.

## Stack

| Layer | Default | Why | Watch |
| --- | --- | --- | --- |
| Frontend | Vercel Hobby | Vite static hosting, HTTPS, CDN. | Separate API origin needs exact cookie/CORS config. |
| API | Render Free Web Service | Runs the Go `chi` server as a long-running process. | Cold starts, single instance. |
| Database | Neon Free Postgres | Managed PostgreSQL for app/session data. | Connection limits, free-tier constraints. |
| Evidence | Cloudflare R2 | Durable private object storage. | Needs credentials, quotas, retention, scan/backup policy. |
| Monitoring | UptimeRobot/Better Stack free | Basic uptime checks. | Not a replacement for logs/metrics/alerting. |

No custom CDN or load balancer is needed for first launch. Vercel already handles frontend CDN; Render handles HTTPS routing. Review shared rate limits and DB connections before horizontal API scaling.

## Required Env

API:

```env
APP_ENV=production
DATABASE_URL=<neon-postgres-url>
# First launch / empty DB only; use a 16+ character secret with upper/lower/digit/symbol.
# Clear or rotate after the initial admin is established.
AUTH_BOOTSTRAP_ADMIN_EMAIL=<admin-email>
AUTH_BOOTSTRAP_ADMIN_PASSWORD=<strong-random-password>
CORS_ALLOWED_ORIGINS=https://<vercel-app-domain>
# Comma-separated trusted Render/proxy/load-balancer CIDRs or IPs.
TRUSTED_PROXY_CIDRS=<trusted-proxy-cidrs-or-ips>
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

Frontend:

```env
VITE_API_URL=https://<render-api-domain>/api/v1
```

Startup validation rejects missing production `DATABASE_URL`, insecure production cookies, malformed/wildcard/HTTP production CORS origins, malformed `TRUSTED_PROXY_CIDRS`, `SameSite=None` without secure cookies, weak bootstrap-admin secrets, malformed config values, and local evidence storage in production. Production startup also fails if neither bootstrap credentials nor an existing active admin account is available.

## Preflight

- Run `pnpm install` if dependencies are missing.
- Run `pnpm --filter @unitrack/web build`.
- Run `make api-build`.
- Run `make db-validate`.
- For first launch or an empty production DB, set a strong non-default bootstrap admin password and final frontend/API domains.
- Collect the trusted proxy/load-balancer CIDRs or IPs for the hosted API path and set `TRUSTED_PROXY_CIDRS` before relying on source-IP rate limiting or session IP audit data.

## Values To Collect

| Value | Example |
| --- | --- |
| Frontend origin | `https://unitrack.vercel.app` |
| API origin | `https://unitrack-api.onrender.com` |
| API base URL | `https://unitrack-api.onrender.com/api/v1` |
| Neon URL | `postgresql://...` |
| R2 bucket | `unitrack-evidence` |
| R2 endpoint | `https://<account-id>.r2.cloudflarestorage.com` |
| Trusted proxy CIDRs | `<provider-proxy-cidr>,<provider-proxy-ip>` |

## Launch Steps

### 1. Create R2

- Create a private bucket.
- Create bucket-scoped access keys.
- Save bucket, endpoint, key ID, secret, region `auto`, and optional prefix.
- Do not make evidence public.

### 2. Create Neon

- Create a Postgres database.
- Save `DATABASE_URL`.
- Run migrations from repo root:

```bash
make db-up DATABASE_URL='<neon-postgres-url>'
```

### 3. Deploy API On Render

- Root directory: repo root.
- Render provides `PORT`; leave `HTTP_PORT` unset unless deliberately overriding local behavior.

Build command:

```bash
make api-build
```

`make api-build` creates `apps/api/bin` before compiling the server.

Start command:

```bash
./apps/api/bin/server
```

Set API env from `Required Env`, especially `APP_ENV=production`, exact `CORS_ALLOWED_ORIGINS`, `TRUSTED_PROXY_CIDRS`, secure `SESSION_*`, database URL, and R2 values.

Verify:

```bash
curl https://<render-api-domain>/api/v1/health
curl https://<render-api-domain>/api/v1/ready
```

### 4. Deploy Frontend On Vercel

- Root directory: repo root.
- Build command: `pnpm --filter @unitrack/web build`.
- Output directory: `apps/web/dist`.
- Set `VITE_API_URL=https://<render-api-domain>/api/v1`.
- Redeploy after the final API domain is known.

### 5. Verify Auth And Evidence

- Open the Vercel app and sign in as bootstrap admin.
- Confirm `/auth/me` returns the current user in browser devtools.
- Confirm session IP audit/rate-limit source IPs use the client address when requests pass through the configured trusted proxy.
- Create or seed demo data only in intentional demo environments.
- Upload and download one evidence file; confirm bytes are in the private R2 bucket and download goes through the API.
- Change the bootstrap admin password after first login if a temporary password was used, and clear or rotate bootstrap credentials after the initial admin account is established.

## Evidence Storage

- Development/tests default to local files under `UPLOAD_STORAGE_DIR`.
- Production must use `UPLOAD_STORAGE_BACKEND=r2`.
- Keep the R2 bucket private; downloads stay API-proxied so project permissions remain centralized.
- Upload/delete object cleanup is backed by `uploaded_file_object_cleanup_jobs`; pending jobs are retried at API startup.
- Do not switch a live DB with local `storage_path` rows to R2 unless files are copied or a migration adds per-file backend tracking.
- Hardening still needed: retention, backup, MIME policy, malware scanning, quotas, and cost monitoring.

## Health Checks

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/health` | Liveness; does not require DB. |
| `GET /api/v1/ready` | Readiness; pings PostgreSQL and returns `503` on DB failure. |

Use `/health` for shallow uptime and `/ready` after env/migration changes.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Login works but session disappears | `SESSION_SECURE=true`, `SESSION_SAME_SITE=none`, exact HTTPS `CORS_ALLOWED_ORIGINS`, frontend `VITE_API_URL`. |
| Source-IP limits or session audit show proxy IPs | Set `TRUSTED_PROXY_CIDRS` to the direct trusted proxy/load-balancer CIDRs or IPs; do not trust forwarded headers from arbitrary remotes. |
| Unsafe writes return origin errors | Frontend origin must exactly match API trusted origin. |
| API fails on startup | Read config validation log; production rejects unsafe DB/CORS/cookie/proxy/storage/bootstrap config and empty-DB startup without an admin path. |
| `/ready` fails | Neon URL, migrations, network access, DB availability. |
| Evidence upload fails | R2 endpoint/bucket/keys, private bucket, `UPLOAD_STORAGE_BACKEND=r2`, object prefix. |
| Stored evidence cleanup remains queued | Inspect `uploaded_file_object_cleanup_jobs.last_error`; fix R2/local storage access and restart the API or run focused cleanup processing. |

## Rollback

- Frontend: redeploy the previous Vercel deployment.
- API: redeploy previous Render commit/build.
- Database: avoid destructive down migrations in production unless a rollback plan was tested.
- Evidence: keep R2 bucket private and do not delete objects during rollback unless metadata/object repair is planned.

## First-Launch Limits

- Single API instance only until shared rate limits and DB connection pressure are reviewed.
- Keep `TRUSTED_PROXY_CIDRS` aligned with the direct hosted proxy/load-balancer topology; forwarded headers are ignored when the direct remote is not trusted.
- Evidence storage still needs retention, backup, MIME policy, malware scanning, quotas, and cost monitoring.
- Observability is basic; add metrics/alerting before serious usage.

## Provider Alternatives

- Render-only is simpler but free disk is not durable for evidence.
- Vercel-only does not naturally host the current long-running Go API.
- Cloudflare-only would require changing API hosting architecture.
- Supabase-only would imply auth/storage/backend rewrites.
- Fly.io is powerful but higher ops burden for this first launch.
