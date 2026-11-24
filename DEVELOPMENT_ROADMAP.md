# Development roadmap

| Stage | Work | Acceptance evidence |
| --- | --- | --- |
| Foundation | Versioned repository, PostgreSQL migrations, verified tenant and role guards, signup, invitations and basic UI | Migrations from an empty database, negative isolation tests, onboarding and student CRUD in Chromium |
| Synthetic-data pilot | Exercise real school, college and university workflows. Add bulk attendance, imports, term rollover, stronger staff assignment and institution-level reports | Pilot acceptance per institution type, accessibility review and load test against realistic enrolment and timetable volumes |
| Privacy and operations | Verify school and guardian identities. Implement MFA, recovery, parental consent records, retention, subject request handling and incident response. Confirm hosting and processor arrangements | Account-recovery and privilege review, approved residency map, restore drill and privacy sign-off |
| Commercial launch | Extend invoices to line items, refunds and settlement. Implement subscription billing with provider enrolment, intake verification, idempotent callbacks and reconciled payouts | Contracted providers, settlement reconciliation, failed-renewal workflows and audited finance approval |
| Product depth | Add signed credentials, mature LMS and library circulation, scheduled communications, and analytics exports | Workflow acceptance tests and validated reporting |
| Mobile and scale | Kotlin Multiplatform client, secure native sign-in and institution switching, compatibility tests and low-bandwidth evaluation | Verified mobile data boundaries, telemetry, recovery exercises and performance targets |

The web application includes first-release implementations across the requested domains. Track status and specific limitations in the [Project audit](PROJECT_AUDIT.md). Live student data depends on the operational and privacy gates in [Security](SECURITY.md).
