# Project audit

## Starting point

The supplied workspace contained a project brief. The supplied GitHub repository had one commit, `317683fda1c32992270bdb6fcd9b823f4102105a`, on `main`. It contained `LICENSE`. The repository exposed no other branches or tags. There was no frontend, backend, schema, dependency manifest, authentication code, or test suite in that commit. The project owner confirmed a new implementation. [Initial commit](https://github.com/RichCode47/ELI_project/commit/317683fda1c32992270bdb6fcd9b823f4102105a)

The new application is based on that commit. The checkout uses the supplied repository as `origin` and the working branch is `codex/eli-edtech`. The ignore rules cover local environment files, key material, common database dumps, build output and browser test artifacts.

## Implemented scope

| Area | First release | Further work |
| --- | --- | --- |
| Platform administration | Separate sign-in, institution list, plan, billing interval, fee and expiry controls | Usage analytics, invoicing ELI subscriptions, identity provider integration |
| School administration | Registration, trial, settings, roles, invitations, membership suspension, audit log | Verified institutional ownership, admin succession, multiple staff roles per membership |
| Student and staff information | Profiles, unique identifiers and optional linked accounts | Bulk import, field-level retention, staff assignments beyond class leads |
| Admissions and enrolment | Application decisions, transactional enrolment and class rosters | Applicant self-service, document review and enrolment reconciliation |
| Classes, subjects, programmes and calendars | Academic years, terms, classes, class leads, subjects and programme catalogue | Campuses, subject-specific staff allocation and historical cohort analytics |
| Timetable and attendance | Scheduled slots with class and room overlap checks. Individual attendance and weekly dashboard | Recurring schedules, bulk registers and closure exceptions |
| Assessments and grading | Assessment maximums, marks validation, publish permissions and term report rendering | Weighting, moderation, approved grade snapshots and assessment accommodations |
| Fees, invoices and receipts | Fee schedules, issuance, balances, manual payments and printable receipts | Invoice line items, credits, refunds, journal, reconciliation and provider integrations |
| Student, guardian and teacher portals | One responsive app with role and record-specific views | Guardian custody review, stronger account recovery and richer teacher assignments |
| LMS | Published courses, text lessons, external references, assignments and text submissions | Object storage, marking rubrics, deadlines and course completion tracking |
| Library | Copy-level catalogue and checkout, overdue dates and manual returns | Fines, renewals, barcodes, reservations and circulation reports |
| Communications | Published notices and targeted in-app messages | Delivery receipts, preferences, email and SMS delivery |
| Credentials | Numbered, printable certificate and transcript records | Signed PDF generation, public verification and immutable issued artifacts |
| Analytics | Role-scoped dashboard counts, activity, weekly attendance and CSV exports | Cohort and finance reports and performance benchmarking |
| Deployment | Container build, health endpoints, GitHub Actions and hosting runbook | Production environment and operational evidence |

## Recovery verification

A logical backup of the synthetic demo restored into an isolated PostgreSQL 18 database. The runtime role saw zero protected records without tenant context and 186 correctly scoped records from the restored workspace.

## Technical debt

- The school record catalogue uses shared tables and JSONB payloads with runtime validation. Move domains that need high-volume aggregates or enforceable accounting invariants into dedicated tables when their product rules are settled.
- Each tenant’s record mutations are serialized to prevent conflicting timetable, admissions, library and financial writes. Measure peak write load and tighten lock scope when larger institutions need parallel bulk operations.
- Record lists use offset pagination and title search. Add cursor pagination, normalized search and purpose-built indexes once realistic distributions are available.
- Sessions use password-based sign-in and invitations are manually delivered. Add verified signup, MFA, self-service recovery and fully audited privileged access before wide release.
- Operator workflows for approved retention, legal holds, subject requests, restore drills and incident response still need live deployment validation. See [Security](SECURITY.md) and [Deployment](DEPLOYMENT.md).
