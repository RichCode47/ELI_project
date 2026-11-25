import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import { modules, reportingRoles } from '../shared/catalog.js';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { requireModule, session, tenantAccess, visibility } from './access.js';
import type { TenantAccess } from './access.js';
import { inContext } from './db.js';
import { csv } from './csv.js';
import type { Transaction } from './db.js';
import { bodySchema, changeSchema, contents, moduleFor, relatedTo, statesFor, validatedRecord } from './record-rules.js';
import { deny, HttpError, invalid, missing, requestToken, uuid } from './security.js';
import type { Config } from './security.js';

const include = { links: { select: { purpose: true, target: { select: { id: true, title: true } } } },
  member: { select: { user: { select: { name: true } } } } } as const;
type WithLinks = Prisma.RecordGetPayload<{ include: typeof include }>;
const short = { id: true, title: true, kind: true, status: true, updatedAt: true } as const;
const pageSchema = z.object({
  q: z.string().trim().max(100).default(''), page: z.coerce.number().int().min(1).max(100000).default(1),
  status: z.string().max(24).optional(),
});

function present(entry: WithLinks, context: TenantAccess) {
  const data = { ...contents(entry) };
  if (['TEACHER', 'LIBRARIAN', 'ACCOUNTANT', 'GUARDIAN'].includes(context.member.role) && ['students', 'staff'].includes(entry.kind)) delete data.email;
  const maySeeAccount = ['ADMIN', 'PRINCIPAL', 'REGISTRAR'].includes(context.member.role) || entry.memberId === context.member.id;
  return {
    ...Object.fromEntries(Object.keys(short).map((key) => [key, entry[key as keyof typeof short]])),
    version: entry.version, data,
    memberId: maySeeAccount ? entry.memberId : null,
    memberName: maySeeAccount ? entry.member?.user.name ?? null : null,
    links: Object.fromEntries(entry.links.map(({ purpose, target }) => [purpose, target])),
    statuses: statesFor(entry.kind, modules[entry.kind], entry.status),
  };
}

function scoped(context: TenantAccess, kind: string): Prisma.RecordWhereInput {
  return { tenantId: context.tenant.id, kind, AND: [visibility(context, kind)] };
}
async function fetchOne(tx: Transaction, context: TenantAccess, kind: string, id: string) {
  const entry = await tx.record.findFirst({ where: { ...scoped(context, kind), id }, include });
  if (!entry) missing();
  return entry;
}
async function versionLock(tx: Transaction, tenantId: string) {
  // A tenant-local lock keeps relationship checks and ledger updates consistent with concurrent writes.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId}, 0))`;
}
async function audit(tx: Transaction, context: TenantAccess, action: string, kind: string, id: string) {
  await tx.auditEvent.create({ data: { tenantId: context.tenant.id, actorId: context.user.id, action, kind, targetId: id } });
}
const createLinks = (tenantId: string, id: string, links: Record<string, string>) =>
  Object.entries(links).map(([purpose, targetId]) => ({ tenantId, sourceId: id, targetId, purpose }));

async function createRecord(tx: Transaction, context: TenantAccess, kind: string, body: z.infer<typeof bodySchema>) {
  const tenantId = context.tenant.id;
  const { preserveLinks: _ignored, ...data } = await validatedRecord(tx, context, kind, body);
  const created = await tx.record.create({ data: { ...data, tenantId, kind } });
  await tx.recordLink.createMany({ data: createLinks(tenantId, created.id, body.links) });
  await audit(tx, context, 'record.created', kind, created.id);
  return tx.record.findUniqueOrThrow({ where: { tenantId_id: { tenantId, id: created.id } }, include });
}

export function recordRoutes(db: PrismaClient, config: Config) {
  const router = Router();
  const path = '/institutions/:tenantId/records/:kind';
  async function run<T>(req: Request, work: (tx: Transaction, context: TenantAccess) => Promise<T>) {
    const tenantId = uuid.parse(req.params.tenantId);
    const active = await session(db, requestToken(req, config));
    return inContext(db, tenantId, async (tx) => work(tx, await tenantAccess(tx, active, tenantId)));
  }

  router.get(path, async (req, res) => {
    const kind = z.string().parse(req.params.kind);
    const definition = moduleFor(kind);
    const { q, page, status } = pageSchema.parse(req.query);
    const result = await run(req, async (tx, context) => {
      requireModule(context, definition, 'read');
      const where = { ...scoped(context, kind), ...(q ? { title: { contains: q, mode: 'insensitive' as const } } : {}), ...(status ? { status } : {}) };
      const total = await tx.record.count({ where });
      const items = await tx.record.findMany({ where, include, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 25, take: 25 });
      return { items: items.map((item) => present(item, context)), total, page, pageSize: 25, statuses: statesFor(kind, definition) };
    });
    res.json(result);
  });

  router.get(path + '/:id', async (req, res) => {
    const kind = z.string().parse(req.params.kind);
    const item = await run(req, async (tx, context) => {
      requireModule(context, moduleFor(kind), 'read');
      return present(await fetchOne(tx, context, kind, uuid.parse(req.params.id)), context);
    });
    res.json({ item });
  });

  router.post(path, async (req, res) => {
    const kind = z.string().parse(req.params.kind);
    const body = bodySchema.parse(req.body);
    const item = await run(req, async (tx, context) => {
      requireModule(context, moduleFor(kind), 'write');
      await versionLock(tx, context.tenant.id);
      return present(await createRecord(tx, context, kind, body), context);
    });
    res.status(201).json({ item });
  });

  router.patch(path + '/:id', async (req, res) => {
    const kind = z.string().parse(req.params.kind);
    const { version, ...body } = changeSchema.parse(req.body);
    const item = await run(req, async (tx, context) => {
      requireModule(context, moduleFor(kind), 'write');
      if (context.member.role === 'STUDENT') deny();
      const tenantId = context.tenant.id;
      await versionLock(tx, tenantId);
      const previous = await fetchOne(tx, context, kind, uuid.parse(req.params.id));
      if (previous.version !== version) throw new HttpError(409, 'STALE_RECORD', 'This record changed. Refresh and try again.');
      const { preserveLinks, ...data } = await validatedRecord(tx, context, kind, body, previous);
      const sourceId = previous.id;
      const where = { tenantId_id: { tenantId, id: sourceId } };
      await tx.record.update({ where, data: { ...data, version: { increment: 1 } } });
      if (!preserveLinks) {
        await tx.recordLink.deleteMany({ where: { tenantId, sourceId } });
        await tx.recordLink.createMany({ data: createLinks(tenantId, sourceId, body.links) });
      }
      await audit(tx, context, 'record.updated', kind, sourceId);
      return present(await tx.record.findUniqueOrThrow({ where, include }), context);
    });
    res.json({ item });
  });

  router.delete(path + '/:id', async (req, res) => {
    const kind = z.string().parse(req.params.kind);
    const version = z.coerce.number().int().min(1).parse(req.query.version);
    await run(req, async (tx, context) => {
      requireModule(context, moduleFor(kind), 'write');
      if (!['ADMIN', 'REGISTRAR', 'PRINCIPAL', 'ACCOUNTANT', 'LIBRARIAN'].includes(context.member.role)) deny();
      const tenantId = context.tenant.id;
      await versionLock(tx, tenantId);
      const entry = await fetchOne(tx, context, kind, uuid.parse(req.params.id));
      if (entry.version !== version) throw new HttpError(409, 'STALE_RECORD', 'This record changed. Refresh and try again.');
      if (['receipts', 'loans', 'submissions'].includes(kind)
        || (kind === 'invoices' && entry.status !== 'DRAFT')
        || (kind === 'admissions' && entry.status === 'ENROLLED')
        || (['grades', 'report-cards', 'certificates', 'transcripts'].includes(kind) && entry.status !== 'DRAFT')) {
        deny('This item is part of the permanent record.');
      }
      await tx.record.delete({ where: { tenantId_id: { tenantId, id: entry.id } } });
      await audit(tx, context, 'record.deleted', kind, entry.id);
    });
    res.sendStatus(204);
  });

  router.post('/institutions/:tenantId/admissions/:id/enrol', async (req, res) => {
    const body = z.object({ classId: uuid, termId: uuid, studentNumber: z.string().trim().max(254).optional(), startDate: z.iso.date() }).strict().parse(req.body);
    const items = await run(req, async (tx, context) => {
      requireModule(context, moduleFor('admissions'), 'write');
      const tenantId = context.tenant.id;
      await versionLock(tx, tenantId);
      const application = await fetchOne(tx, context, 'admissions', uuid.parse(req.params.id));
      if (application.status !== 'ACCEPTED') invalid('Only an accepted application can be enrolled.');
      const contact = contents(application).email;
      const student = await createRecord(tx, context, 'students', {
        title: application.title, status: 'ACTIVE', data: { ...(body.studentNumber ? { number: body.studentNumber } : {}), ...(contact ? { email: String(contact) } : {}) }, links: {},
      });
      const enrolment = await createRecord(tx, context, 'enrolments', {
        title: application.title, status: 'ACTIVE', data: { startDate: body.startDate },
        links: { student: student.id, class: body.classId, term: body.termId },
      });
      await tx.record.update({ where: { tenantId_id: { tenantId, id: application.id } },
        data: { status: 'ENROLLED', version: { increment: 1 } } });
      await audit(tx, context, 'application.enrolled', 'admissions', application.id);
      return { student: present(student, context), enrolment: present(enrolment, context) };
    });
    res.status(201).json(items);
  });

  router.get('/institutions/:tenantId/report-cards/:id/results', async (req, res) => {
    const grades = await run(req, async (tx, context) => {
      requireModule(context, moduleFor('report-cards'), 'read');
      const card = await fetchOne(tx, context, 'report-cards', uuid.parse(req.params.id));
      const targets = Object.fromEntries(card.links.map((link) => [link.purpose, link.target.id]));
      const results = await tx.record.findMany({
        where: { ...scoped(context, 'grades'), status: 'PUBLISHED', AND: [
          visibility(context, 'grades'), relatedTo('student', targets.student), relatedTo('class', targets.class),
          { links: { some: { purpose: 'assessment', target: { AND: [relatedTo('term', targets.term)] } } } },
        ] }, include, orderBy: [{ title: 'asc' }, { id: 'asc' }],
      });
      return results.map((item) => ({ assessment: item.links.find((link) => link.purpose === 'assessment')?.target.title, marks: contents(item).marks }));
    });
    res.json({ grades });
  });

  router.post('/institutions/:tenantId/reports/export', async (req, res) => {
    const { kind, q, status } = z.object({
      kind: z.string().max(40), q: z.string().trim().max(100).default(''), status: z.string().max(24).optional(),
    }).strict().parse(req.body);
    const definition = moduleFor(kind);
    const output = await run(req, async (tx, context) => {
      requireModule(context, definition, 'read');
      if (!reportingRoles.includes(context.member.role)) deny();
      const where = { ...scoped(context, kind), ...(q ? { title: { contains: q, mode: 'insensitive' as const } } : {}), ...(status ? { status } : {}) };
      const items = await tx.record.findMany({ where, include, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 5001 });
      if (items.length > 5000) invalid('Narrow the report filters to export 5,000 records or fewer.');
      const rows: unknown[][] = [['Title', 'Status', ...definition.fields.map((field) => field.label),
        ...definition.links.map((link) => link.label), 'Currency', 'Updated UTC']];
      for (const record of items) {
        const item = present(record, context);
        rows.push([record.title, record.status, ...definition.fields.map((field) => item.data[field.name]),
          ...definition.links.map((link) => item.links[link.name]?.title), item.data.currency, record.updatedAt.toISOString()]);
      }
      await tx.auditEvent.create({ data: { tenantId: context.tenant.id, actorId: context.user.id, action: 'report.exported', kind } });
      return csv(rows);
    });
    res.attachment(kind + '.csv').type('text/csv; charset=utf-8').send(output);
  });

  router.get('/institutions/:tenantId/dashboard', async (req, res) => {
    const result = await run(req, async (tx, context) => {
      const { member, operational, tenant, subscription } = context;
      if (!operational) return { metrics: {}, attendance: [], recent: [], notices: [] };
      const types = ['students', 'staff', 'classes', 'admissions', 'attendance', 'invoices', 'enrolments', 'courses', 'books', 'loans', 'notifications', 'announcements'];
      const allowed = types.filter((kind) => modules[kind].readers.includes(member.role)
        && (kind !== 'courses' && kind !== 'books' && kind !== 'loans' || subscription.plan !== 'BASIC'));
      const metrics: Record<string, number> = {};
      for (const kind of allowed) metrics[kind] = await tx.record.count({ where: scoped(context, kind) });
      const now = new Date();
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: tenant.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
      const utcMidnight = Date.parse(today + 'T00:00:00Z');
      const dates = Array.from({ length: 7 }, (_, index) => new Date(utcMidnight - (6 - index) * 86400000).toISOString().slice(0, 10));
      const attendance = [];
      if (allowed.includes('attendance')) {
        for (const date of dates) {
          const where = { ...scoped(context, 'attendance'), data: { path: ['date'], equals: date } };
          const groups = await tx.record.groupBy({ by: ['status'], where, _count: { _all: true } });
          const total = groups.reduce((sum, group) => sum + group._count._all, 0);
          attendance.push({ date, total, present: groups.filter((group) => ['PRESENT', 'LATE'].includes(group.status)).reduce((sum, group) => sum + group._count._all, 0) });
        }
      }
      const recent = [];
      for (const kind of allowed.filter((type) => !['announcements', 'attendance'].includes(type))) {
        recent.push(...await tx.record.findMany({ where: scoped(context, kind), select: short,
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 4 }));
      }
      recent.sort((a, b) => b.updatedAt.valueOf() - a.updatedAt.valueOf());
      const notices = await tx.record.findMany({
        where: { ...scoped(context, 'announcements'), status: 'PUBLISHED' }, select: short,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 3,
      });
      return { metrics, attendance, recent: recent.slice(0, 6), notices };
    });
    res.json(result);
  });

  return router;
}
