# Database design

The Prisma schema is `prisma/schema.prisma`. Review the SQL migrations alongside it when changing policies, constraints or indexes.

| Table | Purpose and constraints |
| --- | --- |
| `Institution` | UUID, unique workspace slug, name, institution type, currency, time zone and branding |
| `Subscription` | One current plan per institution, billing interval, status, period end and onboarding fee in minor units |
| `User` | Globally unique normalized email, name, password hash and separately managed platform privilege |
| `Membership` | Unique tenant/user pair. Carries role and active flag. Composite tenant/id uniqueness supports tenant-safe references |
| `Session` | Digest of a random session token, user, optional institution and expiry. Null tenant is reserved for platform sessions |
| `Invitation` | Digest of single-use membership token with tenant, intended email, role, expiry, outcome timestamps and optional registration reference |
| `StudentRegistration` | One request per normalized email in an institution. Tracks the review status and school-selected student profile |
| `Record` | Tenant, kind, title, status, version, validated module payload and optional member reference. Unique per-kind keys encode natural identifiers |
| `RecordLink` | Purpose-named reference between records. Both endpoints are checked by composite tenant/id foreign keys |
| `AuditEvent` | Tenant or platform scope, actor ID, action, target reference and time |
| `RateBucket` | Hashed request key, hit count and expiry for shared rate limiting |

Forced RLS covers `Record`, `RecordLink`, `Invitation` and `AuditEvent`, plus `StudentRegistration`. Without a matching transaction setting, policies expose zero protected rows. Identity metadata has explicit application predicates and restricted SQL column privileges. In particular, the runtime role cannot assign the platform administrator flag.

Class records are tied to a term. Enrolments, assessments and report cards must use the same term as the class. Teachers manage only classes they lead. Guardian relationships connect an active membership to a student record.

Module fields and permitted statuses live in the shared catalogue, with relationship and invariant checks applied before writes. Admission conversion adds a student and enrolment, changes application status and records the change in one transaction. A posted receipt changes the linked invoice balance in the same transaction. Invoice and receipt amounts are integer minor units with a currency snapshot. Receipt mutation is disabled. Published grade lookup is currently live, so report cards reflect any later published mark corrections.

Apply versioned migrations using the schema owner, then grant access with `scripts/database-grants.sql`. The runtime identity must be a non-owner login with `NOSUPERUSER` and `NOBYPASSRLS`. Use the CI checks to verify migrations on an empty, disposable database. Review custom policies explicitly during schema changes. [PostgreSQL row security](https://www.postgresql.org/docs/18/ddl-rowsecurity.html)
