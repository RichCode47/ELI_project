-- Run as the migration owner on a regular schedule.
DELETE FROM "Session" WHERE "expiresAt" < CURRENT_TIMESTAMP;
DELETE FROM "RateBucket" WHERE "resetAt" < CURRENT_TIMESTAMP;
DO $$
DECLARE institution_id uuid;
BEGIN
  FOR institution_id IN SELECT id FROM "Institution" LOOP
    PERFORM set_config('eli.tenant_id', institution_id::text, true);
    DELETE FROM "Invitation" WHERE "expiresAt" < CURRENT_TIMESTAMP - interval '30 days';
  END LOOP;
END $$;
