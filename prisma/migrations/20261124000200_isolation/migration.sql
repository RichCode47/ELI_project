BEGIN;

ALTER TABLE "Record" ADD CONSTRAINT "record_payload_object" CHECK (jsonb_typeof(data) = 'object');
ALTER TABLE "Record" ADD CONSTRAINT "record_positive_version" CHECK (version > 0);
ALTER TABLE "Subscription" ADD CONSTRAINT "subscription_fee_nonnegative" CHECK ("onboardingFeeMinor" >= 0);
CREATE UNIQUE INDEX "Record_unique_student_or_staff_profile" ON "Record" ("tenantId", kind, "memberId")
  WHERE "memberId" IS NOT NULL AND kind IN ('students', 'staff');
CREATE INDEX "Record_attendance_by_date" ON "Record" ("tenantId", (data->>'date'))
  WHERE kind = 'attendance';

ALTER TABLE "Record" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Record" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_records ON "Record"
  USING ("tenantId" = nullif(current_setting('eli.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('eli.tenant_id', true), '')::uuid);

ALTER TABLE "RecordLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecordLink" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_links ON "RecordLink"
  USING ("tenantId" = nullif(current_setting('eli.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('eli.tenant_id', true), '')::uuid);

ALTER TABLE "Invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invitation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_invitations ON "Invitation"
  USING ("tenantId" = nullif(current_setting('eli.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('eli.tenant_id', true), '')::uuid);

ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY scoped_audit ON "AuditEvent"
  USING ("tenantId" = nullif(current_setting('eli.tenant_id', true), '')::uuid
    OR ("tenantId" IS NULL AND current_setting('eli.platform', true) = 'true'))
  WITH CHECK ("tenantId" = nullif(current_setting('eli.tenant_id', true), '')::uuid
    OR ("tenantId" IS NULL AND current_setting('eli.platform', true) = 'true'));

COMMIT;
