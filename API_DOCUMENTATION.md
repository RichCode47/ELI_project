# API documentation

The REST API is served under `/api/v1`. Fetch `/api/v1/openapi.json` for the live OpenAPI 3.1 contract and the record catalogue. The catalogue defines record kinds, editable fields, relationships, roles and plan requirements. Health endpoints live at `/api/health/live` and `/api/health/ready`.

## Sessions and tenancy

Call `POST /auth/register` or `POST /auth/login` to receive the session cookie. The login body is `{ "slug": "workspace-id", "email": "user@example.test", "password": "…" }`. Authorised platform administrators use an empty slug for their separate platform session. `GET /auth/me` returns the selected institution and role. Use that institution’s UUID in scoped routes. To require a Student membership at sign-in, include `"portal": "student"` with the workspace slug.

For writes, send `Origin` equal to `APP_ORIGIN` and `X-ELI-Request: 1`. Send JSON bodies with `Content-Type: application/json`. The browser supplies the origin and handles the cookie on normal same-origin requests. Sign out with `POST /auth/logout`.

## Main endpoints

Paths below are relative to `/api/v1`. Replace `{tenantId}` with the UUID returned by `/auth/me`.

| Method and path | Purpose |
| --- | --- |
| `POST /auth/register` | Create an institution, its administrator membership and trial |
| `POST /auth/login` | Sign in to the specified workspace or platform |
| `POST /auth/accept-invite` | Consume a tenant UUID and single-use invitation token |
| `GET /auth/me` | Active identity and workspace scope |
| `POST /auth/logout` | Revoke and clear the current session |
| `PATCH /institutions/{tenantId}` | Update workspace branding and locale |
| `GET /institutions/{tenantId}/members` | List or search members. Use `?module=...` for assignable member choices |
| `PATCH /institutions/{tenantId}/members/{id}` | Enable or disable an eligible membership |
| `POST /institutions/{tenantId}/invitations` | Create or replace a role invitation |
| `GET /institutions/{tenantId}/student-portal` | Student-only summary with profile number, timetable, published grades, attendance and announcements |
| `GET /institutions/{tenantId}/dashboard` | Role-scoped counts, weekly attendance and activity |
| `POST /institutions/{tenantId}/reports/export` | Download up to 5,000 visible records as CSV, with optional `q` and `status` filters |
| `GET /institutions/{tenantId}/audit` | Most recent institution audit events |
| `GET, POST /institutions/{tenantId}/records/{kind}` | Search, list or create records |
| `GET, PATCH, DELETE /institutions/{tenantId}/records/{kind}/{id}` | Fetch, update or delete an eligible record |
| `POST /institutions/{tenantId}/admissions/{id}/enrol` | Convert an accepted application in one transaction |
| `GET /institutions/{tenantId}/report-cards/{id}/results` | Fetch published grades associated with the report |
| `GET /platform/institutions` | List institution subscription metadata |
| `PATCH /platform/institutions/{tenantId}/subscription` | Set plan, billing period, status, period end and onboarding fee |

## Record example

Create a student with `POST /institutions/{tenantId}/records/students`.

```json
{
  "title": "Memory Banda",
  "status": "ACTIVE",
  "data": { "number": "ST-104" },
  "links": {},
  "memberId": null
}
```

Omit `data.number` or send an empty string to generate a student number on creation. For admissions, `studentNumber` is also optional. Updates with a blank or omitted number retain the saved number. Schools can supply their own numbers, which must be unique within the institution regardless of case.

Create returns `201` and an `item` with its ID and version. For an update, send the full editable payload plus the version. For deletion, pass the version as a query parameter. The API refuses stale operations with `409`. Foreign IDs and inaccessible records return `404`.

Lists accept `q` for a title search, `status` and a one-based `page`. Responses contain `items`, `total`, `page` and `pageSize`. Date-only fields use YYYY-MM-DD. Decimal input uses strings with a period. Financial amounts returned as minor units use the record’s currency field.

Errors have the form `{ "error": { "code": "INVALID_INPUT", "message": "…", "requestId": "…" } }`. Common statuses are 401 for unauthenticated requests, 403 for access or plan denials, 404 for unavailable resources, 409 for conflicts, 422 for invalid data, and 429 for rate limits.
