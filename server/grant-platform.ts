import 'dotenv/config';
import { database } from './db.js';
import { email } from './security.js';

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error('Set MIGRATION_DATABASE_URL to the schema owner’s connection string.');
const account = email.parse(process.argv[2]);
const enabled = process.argv[3] !== '--revoke';
const db = database(url);
try {
  await db.$transaction(async (tx) => {
    const user = await tx.user.update({ where: { email: account }, data: { platformAdmin: enabled }, select: { id: true } });
    await tx.session.deleteMany({ where: { userId: user.id, tenantId: null } });
    await tx.$queryRaw`SELECT set_config('eli.platform', 'true', true)`;
    await tx.auditEvent.create({ data: { action: enabled ? 'platform.administrator_granted' : 'platform.administrator_revoked', targetId: user.id } });
  });
  console.info(enabled ? 'Platform access granted.' : 'Platform access revoked.');
} finally {
  await db.$disconnect();
}
