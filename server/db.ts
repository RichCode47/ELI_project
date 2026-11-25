import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client.js';

export type Transaction = Prisma.TransactionClient;

export function database(url: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 10, connectionTimeoutMillis: 5000 }) });
}

export function inContext<T>(db: PrismaClient, tenantId: string | null, work: (tx: Transaction) => Promise<T>, platform = false) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('eli.tenant_id', ${tenantId ?? ''}, true),
      set_config('eli.platform', ${platform ? 'true' : 'false'}, true)`;
    return work(tx);
  }, { maxWait: 5000, timeout: 15000 });
}

export async function lockTenantRecords(tx: Transaction, tenantId: string) {
  // One lock for writes that depend on other records in the same institution.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId}, 0))`;
}

export async function checkDatabase(db: PrismaClient) {
  const [row] = await db.$queryRaw<{ safe: boolean }[]>`
    SELECT NOT me.rolsuper AND NOT me.rolbypassrls
      AND NOT has_schema_privilege(current_user, 'public', 'CREATE')
      AND count(att.oid) = 5
      AND coalesce(bool_and(att.relrowsecurity AND att.relforcerowsecurity
        AND NOT pg_has_role(current_user, att.relowner, 'MEMBER')), false) AS safe
    FROM pg_roles me
    LEFT JOIN pg_class att ON att.relname IN ('Record', 'RecordLink', 'AuditEvent', 'Invitation', 'StudentRegistration')
      AND att.relnamespace = 'public'::regnamespace
    WHERE me.rolname = current_user GROUP BY me.rolsuper, me.rolbypassrls`;
  if (!row?.safe) throw new Error('Database runtime role or tenant policies are incorrectly configured.');
}
