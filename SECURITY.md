# Security and data protection

## Implemented controls

| Control | Implementation |
| --- | --- |
| Password protection | Individually salted scrypt with N=32,768, r=8 and p=3. Login with an unknown account performs the same password derivation. [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) |
| Sessions | 256-bit opaque tokens. PostgreSQL stores SHA-256 digests with a 24-hour expiry. Cookies are HttpOnly, SameSite=Lax and Secure under HTTPS. Sign-in replaces the current cookie and sign-out revokes it. Suspended memberships lose tenant sessions. |
| Browser protection | API writes require the configured origin and X-ELI-Request header. Helmet sets CSP and other security headers. React renders record text as text. Lesson links accept HTTPS only. |
| Input and query safety | Strict Zod request schemas, domain validation, bounded list queries, and parameterized Prisma and SQL statements |
| Abuse controls | Database-backed fixed-window request limits, with a stricter window for sign-in, onboarding and invitation acceptance |
| Isolation | Selected session tenant, active membership, role and plan checks, record-ownership filters, PostgreSQL RLS and composite tenant foreign keys. A separate platform role stays outside institution data routes. |
| Secrets and logs | Environment files and private key and dump patterns are ignored. API responses disable caching. Error logs carry request IDs and omit payloads and credentials. Audit rows contain IDs and event metadata. |
| Verification | API tests cover missing CSRF headers, cross-tenant reads and relationships, database policies, role restrictions, unpublished grades and concurrent receipt writes. |

## Zambia assessment

| Area | Launch work |
| --- | --- |
| Responsibilities and registration | Confirm which organizations are controllers and processors for each activity. Verify registration requirements and maintain processor agreements and a record of processing. See sections 20, 45 and 52. [Data Protection Act, 2021](https://www.parliament.gov.zm/node/8853) · [DPC registration guidance](https://www.dataprotection.gov.zm/registration/) |
| Children and vulnerable persons | Section 17 addresses parental or representative consent, reasonable verification efforts and mechanisms for age verification and parental consent. Add evidence collection, retrievable consent history and revocation. A guardian account link controls access in ELI. Consent and identity verification need their own evidence. [Data Protection Act, 2021, section 17](https://www.parliament.gov.zm/sites/default/files/documents/acts/Act%20No.%203%20The%20Data%20Protection%20Act%202021_0.pdf) |
| Residency and transfers | Map locations for API processing, databases, backups, proxy traffic, logs, support access and subprocessors. Sections 70 and 71 set local processing and storage requirements and conditions for overseas transfers. Use a verified Zambian data path by default and obtain any required approval before transferring real data. [Data Protection Act, 2021, sections 70–71](https://www.parliament.gov.zm/sites/default/files/documents/acts/Act%20No.%203%20The%20Data%20Protection%20Act%202021_0.pdf) · [DPC registration form](https://www.dataprotection.gov.zm/wp-content/uploads/2025/03/Form-I_Application-Controllers-and-Processors.pdf) |
| Rights and retention | Document legal basis, privacy notices, subject request procedures and retention rules. Add tenant-scoped exports, correction workflows, legally reviewed retention and deletion, and legal holds when needed. Confirm sections 51 and 58–66 against each record category. [Data Protection Act, 2021](https://www.parliament.gov.zm/node/8853) |
| Governance and incidents | Assess whether a DPIA is required under section 46, confirm data protection officer obligations, and nominate incident owners. Build a procedure around section 49’s 24-hour controller-to-Commissioner notification requirement and prompt processor and data subject notices as applicable. [Data Protection Act, 2021, sections 46–49](https://www.parliament.gov.zm/sites/default/files/documents/acts/Act%20No.%203%20The%20Data%20Protection%20Act%202021_0.pdf) |

Before admitting live personal data, confirm the assessment with the institution and qualified local counsel or its data protection officer. Record approvals for hosting, backup storage and subprocessors. Test restores and exercise breach response. Verify institution ownership and guardian evidence, implement MFA and recovery for privileged users, and review audit retention. Pilot with synthetic data until these gates are met.

## Reporting security issues

Report suspected exposure privately to the system operator. Share the request ID, time and affected workspace through an approved channel. Keep classroom records, session tokens, passwords and invite links out of public issues.
