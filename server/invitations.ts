import type { Role } from '../shared/catalog.js';
import type { Transaction } from './db.js';
import { day, digest, HttpError, token } from './security.js';

export async function issueInvitation(tx: Transaction, origin: string, input: {
  tenantId: string; actorId: string; email: string; role: Role; registrationId?: string;
}) {
  const { tenantId, actorId, email, role, registrationId } = input;
  await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${tenantId}::uuid FOR UPDATE`;
  const member = await tx.membership.findFirst({ where: { tenantId, user: { email } }, select: { id: true } });
  if (member) throw new HttpError(409, 'ALREADY_MEMBER', 'This account already belongs to your institution.');

  if (!registrationId && await tx.studentRegistration.findFirst({ where: { tenantId, email, status: 'INVITED' }, select: { id: true } })) {
    throw new HttpError(409, 'REGISTRATION_INVITATION', 'Manage this invitation under Student registrations.');
  }
  const now = new Date();
  const outstanding = await tx.invitation.findFirst({
    where: { tenantId, email, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
    select: { role: true, registrationId: true },
  });
  if (outstanding?.registrationId && outstanding.registrationId !== registrationId) {
    throw new HttpError(409, 'REGISTRATION_INVITATION', 'Manage this invitation under Student registrations.');
  }
  if (registrationId && outstanding && outstanding.role !== role) {
    throw new HttpError(409, 'INVITATION_EXISTS', 'An active invitation already exists for this email with a different role.');
  }

  const secret = token();
  const expiresAt = new Date(now.getTime() + 3 * day);
  await tx.invitation.updateMany({
    where: { tenantId, email, acceptedAt: null, revokedAt: null }, data: { revokedAt: now },
  });
  await tx.invitation.create({ data: { tenantId, email, role, registrationId, tokenHash: digest(secret), expiresAt } });
  await tx.auditEvent.create({ data: { tenantId, actorId, action: 'invitation.created', targetId: registrationId } });
  return { url: origin + (registrationId ? '/student' : '/') + '#invite=' + tenantId + '.' + secret, expiresAt };
}
