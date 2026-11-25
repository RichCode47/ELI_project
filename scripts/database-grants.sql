-- Run as the migration owner with psql -v runtime_role=eli_app -f scripts/database-grants.sql.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO :"runtime_role";
GRANT USAGE ON TYPE "Role", "Plan", "BillingInterval", "SubscriptionStatus" TO :"runtime_role";
GRANT SELECT, INSERT ON "Institution", "Subscription", "Membership", "Invitation" TO :"runtime_role";
GRANT UPDATE ("name", "currency", "timeZone", "brand", "whiteLabel") ON "Institution" TO :"runtime_role";
GRANT UPDATE ON "Subscription" TO :"runtime_role";
GRANT UPDATE ("active") ON "Membership" TO :"runtime_role";
GRANT UPDATE ("acceptedAt", "revokedAt") ON "Invitation" TO :"runtime_role";
GRANT SELECT, INSERT ON "StudentRegistration" TO :"runtime_role";
GRANT UPDATE ("status", "studentId", "reviewedAt") ON "StudentRegistration" TO :"runtime_role";
GRANT SELECT ON "User" TO :"runtime_role";
GRANT INSERT ("id", "email", "name", "passwordHash", "createdAt") ON "User" TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON "Session", "Record", "RecordLink", "RateBucket" TO :"runtime_role";
GRANT SELECT, INSERT ON "AuditEvent" TO :"runtime_role";
