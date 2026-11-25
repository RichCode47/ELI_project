# Deployment and operations

## Application hosting

Serve the compiled React app and Express API behind one HTTPS origin. The container uses a non-root Node user and starts the built server on port 3001. The server defaults to loopback outside production. Set `APP_ORIGIN` to the public HTTPS origin with no trailing slash. Set `TRUST_PROXY_HOPS` only after confirming the number of trusted hops and that the service cannot be reached directly from the internet. Keep session responses private at every proxy.

| Runtime setting | Use |
| --- | --- |
| `DATABASE_URL` | Restricted runtime PostgreSQL URL. Use certificate-verified transport between the app and database |
| `MIGRATION_DATABASE_URL` | Owner URL for migration jobs only |
| `APP_ORIGIN` | Canonical external HTTPS origin |
| `PORT` | Health and application listener, default 3001 |
| `NODE_ENV` | Set to `production` for the deployed container |
| `TRUST_PROXY_HOPS` | Trusted reverse proxy distance, default 0 |

For real Zambian institution data, choose a verified deployment where the API, database, backups and relevant processing paths satisfy the residency assessment. See [Security](SECURITY.md).

Vercel can build the Vite client for a synthetic-data staging preview. Set the build command to `npm exec vite build`, output directory to `dist` and use the repository root. Configure an external rewrite for `/api/:path*` to `https://your-staging-api.example/api/:path*` and set the backend’s `APP_ORIGIN` to the preview origin. Add a same-application rewrite from `/student` to `/index.html` for the Student Portal. Assign a stable staging hostname. Verify cookie forwarding, origin protection and no-store caching. The Express API and PostgreSQL remain on separate staging services. Review Vercel edge routing and processing locations before using this arrangement with personal data. [Vercel rewrites](https://vercel.com/docs/routing/rewrites) · [Vercel regions](https://vercel.com/docs/regions)

## Release procedure

1. Provision roles with distinct credentials and permissions. Keep the schema owner outside the application runtime and grant only the privileges in `scripts/database-grants.sql`.
2. Test the migration against an approved staging copy. Take and verify a recovery point. Run `npm ci`, `npm run db:deploy` and the grant script with the migration connection from a trusted release job.
3. Merge a passing revision to `main`. Dispatch the **Release** workflow, which reruns CI and publishes a commit-tagged container to GHCR. Configure GitHub environment reviewers and branch protection in the repository.
4. Deploy that image on the approved backend. The optional workflow deployment requires repository variable `DEPLOY_ENABLED=true` and environment secret `DEPLOY_WEBHOOK_URL`. The HTTPS endpoint receives a JSON body with the image reference. Configure it to acknowledge verified deployment inputs and monitor its rollout separately.
5. Verify readiness, account sign-in, response caching, session cookie flags and a synthetic record workflow. Compare the deployed tag to the approved commit. Roll back the app image if compatible with the current schema. For incompatible schema releases, use the rehearsed recovery plan.

## Backups and recovery

Use managed PostgreSQL point-in-time recovery and encrypted backups. Keep recovery storage in the approved location and apply the institution’s reviewed retention schedule. Verify the backup identity can see forced-RLS tables. Never use the application role for complete backups.

For approved logical backups, use `pg_dump --format=custom --file /approved/encrypted/path/eli.dump eli` with a protected connection profile. Restore into a separate approved database with the necessary roles and grants, run migration status, and verify row counts, audit continuity and tenant-scoped access. Record the observed recovery time and recoverable point. Schedule the expiry cleanup in `scripts/prune-ephemeral.sql` using the migration identity, with an appropriate maintenance window.

## Monitoring

- Probe `GET /api/health/live` for the process and `GET /api/health/ready` for database policy and runtime role readiness.
- Collect structured application errors, API 5xx rate, latency, database pool and lock wait metrics, disk growth and backup age. Alert on sustained errors and missed recovery points.
- Keep the diagnostics collector and retention in the approved data path. Do not log request bodies, cookies, query strings or student records.
- Exercise health probes, restore, rollback and incident notification on staging before enrolling a real institution.
