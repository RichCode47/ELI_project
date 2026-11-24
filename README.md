# ELI EdTech

Multi-tenant school management for schools, colleges and universities in Zambia and across Africa. ELI EdTech uses React, TypeScript, Vite and Tailwind CSS for the web app, with Express, Prisma and PostgreSQL on the server.

This repository contains the first runnable release. Institutions can trial the workspace, invite members, manage school operations and see data according to their role. Platform administrators can manage plans and subscriptions from a separate session. The default time zone is Africa/Lusaka and the default currency is ZMW.

## Run locally

Install Node.js 24 LTS and PostgreSQL 18 with `psql`. Use an isolated local PostgreSQL cluster. The provisioning SQL below creates two local-only roles and two databases. If these roles or databases already exist, use their connection details in `.env`.

```sh
psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f scripts/provision-dev.sql
npm ci
npm run generate
```

Copy `.env.example` to `.env` and set the two PostgreSQL URLs. Apply migrations as the database owner and grant access to the runtime role. Substitute the migration connection details in the following command. Use a password prompt or a protected PostgreSQL password file for `psql`.

```sh
npm run db:deploy
psql -h 127.0.0.1 -U eli_owner -d eli -v ON_ERROR_STOP=1 -v runtime_role=eli_app -f scripts/database-grants.sql
npm run dev
```

Open [the local workspace](http://127.0.0.1:5173) and choose **Create a workspace**. Use the checkout’s `.env` only for local settings. Keep real institution data out of local and preview environments.

For a synthetic demo, set `DEMO_EMAIL` and `DEMO_PASSWORD` in the ignored local `.env`, then run `npm run db:seed` against a fresh local database. The workspace ID defaults to `lusaka-demo`. The seed uses the same API as the browser.

To grant platform access to an existing account, use the owner connection on a trusted machine and run `npm run platform:grant -- name@example.test`. Use **Platform sign-in** on the sign-in screen. To revoke it, append `--revoke`.

## Verification

- `npm run check` checks the client and server types.
- `npm test` runs unit tests and runs the API and migration checks when `TEST_DATABASE_URL` is set.
- `npm run build` builds the web and server assets. Run `npm start` from the repository root to serve them together.
- `npx playwright install chromium` installs the browser for `npm run test:e2e`. Build first and set `TEST_DATABASE_URL` to the migrated, disposable database.
- Set `TEST_MIGRATION_DATABASE_URL` to the disposable database’s owner connection for the platform administrator tests. To prepare it, run `db:deploy` with `MIGRATION_DATABASE_URL` set to the owner URL for `eli_test`, then apply `database-grants.sql` to that database.

## Project documentation

| Document | Description |
| --- | --- |
| [Project audit](PROJECT_AUDIT.md) | Starting commit, implemented scope and technical debt |
| [Architecture](ARCHITECTURE.md) | Request boundaries, modules, roles and plans |
| [Development roadmap](DEVELOPMENT_ROADMAP.md) | Pilot and commercial release milestones |
| [Database design](DATABASE_DESIGN.md) | Data model, isolation and migration strategy |
| [Security](SECURITY.md) | Implemented controls and Zambian privacy assessment |
| [API documentation](API_DOCUMENTATION.md) | REST paths, request formats and OpenAPI |
| [Deployment](DEPLOYMENT.md) | Hosting, CI/CD, health checks and backups |

The repository retains its [license](LICENSE).
