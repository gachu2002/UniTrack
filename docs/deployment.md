# Deployment Reference

This document stores the current recommended free deployment stack for UniTrack and the infrastructure decisions that should not be rediscovered later. For a hands-on launch checklist, use `docs/deployment-guide.md`.

## Recommended Free Stack

| Layer | Recommended service | Role | Main drawback |
| --- | --- | --- | --- |
| Frontend | Vercel Hobby | Hosts the Vite/React static app behind HTTPS and Vercel's CDN. | Separate origin from the API, so cookie auth requires exact CORS and `SameSite=None` config. |
| API | Render Free Web Service | Runs the Go HTTP API as a normal long-running service. | Free services can sleep and cold-start. |
| Database | Neon Free Postgres | Managed PostgreSQL for app data, sessions, and migrations. | Free limits and possible cold starts; watch connection limits. |
| Evidence files | Cloudflare R2 | Durable private object storage for uploaded evidence files through the API storage adapter. | Adds R2 credentials/env setup and one more provider dashboard. |
| DNS/CDN | Cloudflare Free, optional | Custom domain, DNS, and edge controls if needed. | Not required for the first launch because Vercel already serves frontend assets through a CDN. |
| Monitoring | UptimeRobot Free or Better Stack Free | Basic uptime checks for web and API endpoints. | Free checks are shallow and do not replace logs or error tracking. |

Use this stack unless a paid provider or a single-dashboard deployment becomes more important than best-fit free tiers.

## Why This Stack

| Project need | Why the chosen service fits |
| --- | --- |
| Static frontend | Vercel is a direct fit for Vite output, preview deployments, HTTPS, and CDN-backed static assets. |
| Long-running Go API | Render can run the current Go `chi` server without converting it to serverless functions or Workers. |
| PostgreSQL | Neon is purpose-built managed Postgres and is a stronger free database choice than most app-host database add-ons. |
| Private evidence files | R2 gives durable object storage; downloads should still go through the API or short-lived signed URLs so project permissions are preserved. |

## Initial Environment

API service on Render:

```env
APP_ENV=production
DATABASE_URL=<neon-postgres-url>
AUTH_BOOTSTRAP_ADMIN_EMAIL=admin@unitrack.local
AUTH_BOOTSTRAP_ADMIN_PASSWORD=<strong-random-password>
CORS_ALLOWED_ORIGINS=https://<vercel-app-domain>
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

API startup validation rejects production configs that omit `DATABASE_URL`, leave `SESSION_SECURE=false`, set `SESSION_SAME_SITE=none` without secure cookies, use wildcard or malformed CORS origins, use non-HTTPS CORS origins, or leave evidence storage on local disk while `APP_ENV=production`.

Frontend on Vercel:

```env
VITE_API_URL=https://<render-api-domain>/api/v1
```

Database migrations:

```bash
make db-up DATABASE_URL='<neon-postgres-url>'
```

Render build/start commands from the repository root:

```bash
go build -o ./apps/api/bin/server ./apps/api/cmd/server
./apps/api/bin/server
```

## Files And R2

Current implementation status:

- Evidence metadata is stored in Postgres.
- Evidence bytes use `UPLOAD_STORAGE_BACKEND=local` by default for development and tests.
- Production must use `UPLOAD_STORAGE_BACKEND=r2`; startup rejects local evidence storage when `APP_ENV=production`.
- R2 object keys use `projects/<project-id>/<stored-name>` by default, with optional `R2_OBJECT_PREFIX` prepended when set.
- Downloads remain API-proxied so project permissions and closed-project read rules stay centralized in the API.
- Do not switch a live database that already has local `storage_path` rows to R2 unless those files are copied into R2 with matching keys or a storage-migration slice adds per-file backend tracking.

R2 integration constraints:

- Keep the API responsible for upload/download authorization.
- Do not make the R2 bucket public for private evidence files.
- Prefer API-proxied downloads first; short-lived signed URLs are acceptable later if download volume requires it.
- Keep DB metadata and object-storage writes/deletes resilient to partial failure with repair or cleanup handling before production use expands.

R2 setup basics:

- Create a private R2 bucket such as `unitrack-evidence`.
- Create an R2 access key with permission for that bucket.
- Use the account endpoint `https://<cloudflare-account-id>.r2.cloudflarestorage.com` as `R2_ENDPOINT`.
- Keep the bucket private because the UniTrack API enforces project permissions.

## CDN Decision

No separate CDN is needed for the first launch.

Why:

- Vercel already serves the frontend through its CDN.
- The API is credentialed, user-specific, and cookie-authenticated, so generic edge caching is not useful for most API responses.
- Evidence downloads are permissioned; public CDN delivery should not be added unless it uses signed URLs or another authorization-preserving pattern.

Add Cloudflare DNS/CDN later when:

- A custom domain is needed.
- Basic WAF/rate-limit rules are needed at the edge.
- Static asset/domain management should live in Cloudflare.

## Load-Balancing Decision

No custom load balancer is needed for the first launch.

Why:

- Render already provides public HTTPS routing to the API service.
- The free API deployment should be a single instance to keep behavior predictable.
- Current login/rate-limit protections include bounded in-memory limits, which are weaker across multiple API instances.
- R2 makes evidence files shareable across instances, but rate limits and database connection pressure still need review before scaling out.

Consider horizontal scaling or a separate load balancer only after:

- Rate limits move to Redis, Postgres-backed counters, gateway rules, or another shared mechanism.
- Database connection pooling and connection limits are reviewed for multiple API instances.
- Traffic or uptime requirements exceed what a single managed API instance can handle.

## Provider Notes

| Provider-only option | Why it is not the default recommendation |
| --- | --- |
| Render only | Simple, but free local disk is not durable for evidence files and Neon is a stronger free Postgres fit. |
| Vercel only | Excellent frontend host, but the current Go API is a normal long-running server, not a natural Vercel serverless app. |
| Cloudflare only | Excellent Pages/R2/DNS, but Workers are not a direct host for the current Go API and D1 is not PostgreSQL. |
| Supabase only | Strong DB/storage product, but it does not host the current Go API; adopting Supabase Auth/Storage directly would be a product/backend rewrite. |
| Fly.io only | Powerful but more operationally complex; running database/storage pieces yourself is not the simplest free path. |

## Health And Readiness

| Endpoint | Purpose | Expected Behavior |
| --- | --- | --- |
| `GET /api/v1/health` | Liveness check for process/routing. | Returns `200` without requiring a database connection. Use for basic uptime routing checks. |
| `GET /api/v1/ready` | Readiness check for database availability. | Pings PostgreSQL with a short timeout and returns `503` if the database is missing or unavailable. Use for deployment validation and deeper monitoring. |

Render/UptimeRobot checks can use `/api/v1/health` for shallow uptime. Use `/api/v1/ready` after migrations and environment changes to verify the API can reach Neon.

## Launch Checklist

- Create Neon Postgres and save the connection string as `DATABASE_URL` on Render.
- Create a private Cloudflare R2 bucket and R2 access key.
- Run migrations with `make db-up DATABASE_URL='<neon-postgres-url>'`.
- Deploy the Render API with exact `CORS_ALLOWED_ORIGINS` set to the final Vercel origin and `UPLOAD_STORAGE_BACKEND=r2` plus complete R2 settings.
- Confirm the API starts without configuration validation errors; production requires `DATABASE_URL`, `SESSION_SECURE=true`, HTTPS CORS origins, and R2 evidence storage.
- Deploy the Vercel frontend with `VITE_API_URL` pointing at the Render API `/api/v1` base URL.
- Verify login and logout across the Vercel and Render HTTPS origins.
- Verify `GET /api/v1/health` and `GET /api/v1/ready` after deployment.
- Upload and download one evidence file to verify the private R2 path works through the API.
- Replace the bootstrap admin password after first successful admin login if a temporary password was used.
