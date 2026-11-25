BEGIN;

CREATE TABLE "StudentRegistration" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "studentNumber" TEXT,
  "studentId" UUID,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "StudentRegistration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentRegistration_status_check" CHECK ("status" IN ('PENDING', 'INVITED', 'REGISTERED', 'DECLINED')),
  CONSTRAINT "StudentRegistration_linked_profile_check" CHECK ("status" NOT IN ('INVITED', 'REGISTERED') OR "studentId" IS NOT NULL)
);
CREATE UNIQUE INDEX "StudentRegistration_tenantId_id_key" ON "StudentRegistration"("tenantId", "id");
CREATE UNIQUE INDEX "StudentRegistration_tenantId_email_key" ON "StudentRegistration"("tenantId", "email");
CREATE INDEX "StudentRegistration_tenantId_status_createdAt_id_idx" ON "StudentRegistration"("tenantId", "status", "createdAt", "id");
CREATE INDEX "StudentRegistration_tenantId_studentId_status_idx" ON "StudentRegistration"("tenantId", "studentId", "status");

ALTER TABLE "StudentRegistration" ADD CONSTRAINT "StudentRegistration_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentRegistration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentRegistration" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_registrations ON "StudentRegistration"
  USING ("tenantId" = nullif(current_setting('eli.tenant_id', true), '')::uuid)
  WITH CHECK ("tenantId" = nullif(current_setting('eli.tenant_id', true), '')::uuid);

ALTER TABLE "Invitation" ADD COLUMN "registrationId" UUID;
CREATE INDEX "Invitation_tenantId_registrationId_idx" ON "Invitation"("tenantId", "registrationId");
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_tenantId_registrationId_fkey"
  FOREIGN KEY ("tenantId", "registrationId") REFERENCES "StudentRegistration"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
