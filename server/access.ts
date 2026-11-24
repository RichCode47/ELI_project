import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import type { Module, Role } from '../shared/catalog.js';
import { includedInPlan } from '../shared/catalog.js';
import { HttpError, deny, missing } from './security.js';
import type { Transaction } from './db.js';

export async function session(db: PrismaClient, tokenHash: string | null) {
  if (!tokenHash) throw new HttpError(401, 'SIGN_IN_REQUIRED', 'Sign in to continue.');
  const active = await db.session.findFirst({
    where: { tokenHash, expiresAt: { gt: new Date() } },
    select: { tenantId: true, user: { select: { id: true, name: true, email: true, platformAdmin: true } } },
  });
  if (!active) throw new HttpError(401, 'SIGN_IN_REQUIRED', 'Sign in to continue.');
  return active;
}
export type ActiveSession = Awaited<ReturnType<typeof session>>;

export async function tenantAccess(tx: Transaction, active: ActiveSession, tenantId: string) {
  if (active.tenantId !== tenantId) missing();
  const member = await tx.membership.findFirst({
    where: { tenantId, userId: active.user.id, active: true },
    include: { tenant: { include: { subscription: true } } },
  });
  if (!member || !member.tenant.subscription) missing();
  const { tenant } = member;
  const subscription = member.tenant.subscription;
  const expired = subscription.endsAt.getTime() <= Date.now();
  return {
    tenant, member, subscription,
    operational: !expired && (subscription.status === 'ACTIVE' || subscription.status === 'TRIAL'),
    user: active.user,
  };
}
export type TenantAccess = Awaited<ReturnType<typeof tenantAccess>>;

export function requireModule(context: TenantAccess, module: Module, mode: 'read' | 'write') {
  if (!context.operational) throw new HttpError(403, 'SUBSCRIPTION_INACTIVE', 'This institution’s subscription is inactive.');
  const allowed = mode === 'read' ? module.readers : module.writers;
  if (!allowed.includes(context.member.role)) deny();
  if (!includedInPlan(module, context.subscription.plan)) {
    throw new HttpError(403, 'UPGRADE_REQUIRED', 'This module requires the Professional plan or higher.');
  }
}
export const tenantAdmin = (role: Role) => {
  if (role !== 'ADMIN') deny();
};
export const platformAdmin = (active: ActiveSession) => {
  if (!active.user.platformAdmin || active.tenantId !== null) deny();
};

type Filter = Prisma.RecordWhereInput;
const via = (purpose: string, target: Filter): Filter => ({ links: { some: { purpose, target } } });
const back = (purpose: string, source: Filter): Filter => ({ referencedBy: { some: { purpose, source } } });
const publishedKinds = new Set([
  'timetable', 'assessments', 'grades', 'report-cards', 'courses', 'lessons', 'assignments',
  'announcements', 'certificates', 'transcripts',
]);
const classKinds = new Set(['timetable', 'assessments', 'courses', 'lessons', 'assignments']);
const teacherClassKinds = new Set([...classKinds, 'enrolments', 'attendance', 'grades', 'report-cards', 'submissions']);
const statusForInvoice: Filter = { kind: 'invoices', status: { in: ['ISSUED', 'PART_PAID', 'PAID', 'VOID'] } };

export function visibility(context: TenantAccess, kind: string): Filter {
  const { role, id: memberId } = context.member;
  if (kind === 'notifications') {
    return role === 'ADMIN' || role === 'PRINCIPAL' ? {} : { memberId };
  }

  if (role === 'STUDENT' || role === 'GUARDIAN') {
    const linkedStudents: Filter = role === 'STUDENT'
      ? { kind: 'students', memberId }
      : { kind: 'students', ...back('student', { kind: 'guardians', memberId, status: 'ACTIVE' }) };
    const activeClasses: Filter = {
      kind: 'classes', status: 'ACTIVE',
      ...back('class', { kind: 'enrolments', status: 'ACTIVE', ...via('student', linkedStudents) }),
    };
    const publication: Filter = publishedKinds.has(kind) ? { status: 'PUBLISHED' } : {};
    if (kind === 'students') return linkedStudents;
    if (kind === 'classes') return activeClasses;
    if (kind === 'announcements') return publication;
    if (kind === 'books') return { status: 'ACTIVE' };
    if (kind === 'invoices') return { ...statusForInvoice, ...via('student', linkedStudents) };
    if (kind === 'receipts') return via('invoice', { ...statusForInvoice, ...via('student', linkedStudents) });
    if (kind === 'lessons' || kind === 'assignments') {
      return { AND: [publication, via('class', activeClasses),
        via('course', { kind: 'courses', status: 'PUBLISHED', ...via('class', activeClasses) })] };
    }
    if (classKinds.has(kind)) return { AND: [publication, via('class', activeClasses)] };
    if (kind === 'grades') return { AND: [publication, via('student', linkedStudents), via('assessment', { status: 'PUBLISHED' })] };
    return { AND: [publication, via('student', linkedStudents)] };
  }

  if (role === 'TEACHER') {
    const ownClasses = { kind: 'classes', memberId };
    if (kind === 'classes' || kind === 'staff') return { memberId };
    if (kind === 'students') return back('student', { kind: 'enrolments', status: 'ACTIVE', ...via('class', ownClasses) });
    if (teacherClassKinds.has(kind)) return via('class', ownClasses);
    if (kind === 'announcements') return { status: 'PUBLISHED' };
  }
  return {};
}
