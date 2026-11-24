import { Router } from 'express';
import { z } from 'zod';
import { currencies, institutionTypes, modules, roles } from '../shared/catalog.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { inContext } from './db.js';
import { session, tenantAccess, tenantAdmin, platformAdmin, requireModule } from './access.js';
import {
  HttpError, deny, clearSession, day, digest, email, hashPassword, missing, name, password,
  requestToken, secureToken, slug, token, uuid, verifyPassword, writeSession,
} from './security.js';
import type { Config } from './security.js';

const signup = z.object({ institution: name, slug, type: z.enum(institutionTypes), name, email, password }).strict();
const signIn = z.object({ slug: z.union([slug, z.literal('')]), email, password: z.string().min(1).max(128) }).strict();
const accept = z.object({ tenantId: uuid, token: secureToken, name, password }).strict();
const appearance = z.object({
  name, currency: z.enum(currencies), whiteLabel: z.boolean().default(false),
  brand: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  timeZone: z.string().max(70).refine((zone) => {
    try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true; }
    catch { return false; }
  }, 'Use a valid IANA time zone.'),
}).strict();
const subscribe = z.object({
  plan: z.enum(['BASIC', 'PROFESSIONAL', 'ENTERPRISE']),
  interval: z.enum(['MONTHLY', 'ANNUAL']),
  status: z.enum(['TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED']),
  endsAt: z.iso.datetime({ offset: true }),
  onboardingFeeMinor: z.int().min(0).max(2_000_000_000),
  currency: z.enum(currencies),
}).strict().refine(({ status, endsAt }) => !['TRIAL', 'ACTIVE'].includes(status) || Date.parse(endsAt) > Date.now(), {
  message: 'An active period must end in the future.', path: ['endsAt'],
});
const institutionFields = { id: true, name: true, slug: true, type: true, currency: true, timeZone: true, brand: true, whiteLabel: true } as const;
const badLogin = () => new HttpError(401, 'INVALID_LOGIN', 'The workspace, email or password is incorrect.');

export function identityRoutes(db: PrismaClient, config: Config) {
  const router = Router();
  async function openSession(userId: string, tenantId: string | null, previous: string | null) {
    const secret = token();
    await db.$transaction(async (tx) => {
      if (previous) await tx.session.deleteMany({ where: { tokenHash: previous } });
      await tx.session.create({ data: { tokenHash: digest(secret), userId, tenantId, expiresAt: new Date(Date.now() + day) } });
    });
    return secret;
  }

  router.post('/auth/register', async (req, res) => {
    const body = signup.parse(req.body);
    const old = await db.user.findUnique({ where: { email: body.email } });
    if (old && !await verifyPassword(body.password, old.passwordHash)) throw badLogin();
    const passwordHash = old ? old.passwordHash : await hashPassword(body.password);
    const tenant = await db.$transaction(async (tx) => {
      const user = old ?? await tx.user.create({ data: { email: body.email, name: body.name, passwordHash } });
      const institution = await tx.institution.create({
        data: { name: body.institution, slug: body.slug, type: body.type },
        select: institutionFields,
      });
      await tx.membership.create({ data: { tenantId: institution.id, userId: user.id, role: 'ADMIN' } });
      await tx.subscription.create({
        data: { tenantId: institution.id, plan: 'PROFESSIONAL', interval: 'MONTHLY', status: 'TRIAL', endsAt: new Date(Date.now() + 14 * day) },
      });
      await tx.$queryRaw`SELECT set_config('eli.tenant_id', ${institution.id}, true)`;
      await tx.auditEvent.create({ data: { tenantId: institution.id, actorId: user.id, action: 'institution.registered' } });
      return { institution, userId: user.id };
    });
    writeSession(res, config, await openSession(tenant.userId, tenant.institution.id, requestToken(req, config)));
    res.status(201).json({ institution: tenant.institution });
  });

  router.post('/auth/login', async (req, res) => {
    const body = signIn.parse(req.body);
    const user = await db.user.findUnique({ where: { email: body.email } });
    if (!await verifyPassword(body.password, user?.passwordHash) || !user) throw badLogin();
    let tenantId = null;
    if (body.slug) {
      const member = await db.membership.findFirst({
        where: { userId: user.id, active: true, tenant: { slug: body.slug } }, select: { tenantId: true },
      });
      if (!member) throw badLogin();
      tenantId = member.tenantId;
    } else if (!user.platformAdmin) throw badLogin();
    writeSession(res, config, await openSession(user.id, tenantId, requestToken(req, config)));
    res.sendStatus(204);
  });

  router.post('/auth/accept-invite', async (req, res) => {
    const body = accept.parse(req.body);
    const tokenHash = digest(body.token);
    const userId = await inContext(db, body.tenantId, async (tx) => {
      const invite = await tx.invitation.findUnique({ where: { tokenHash } });
      if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt < new Date()) missing();
      const existing = await tx.user.findUnique({ where: { email: invite.email } });
      if (existing && !await verifyPassword(body.password, existing.passwordHash)) throw badLogin();
      const user = existing ?? await tx.user.create({ data: { email: invite.email, name: body.name, passwordHash: await hashPassword(body.password) } });
      const consumed = await tx.invitation.updateMany({
        where: { tokenHash, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, data: { acceptedAt: new Date() },
      });
      if (consumed.count !== 1) missing();
      await tx.membership.create({ data: { tenantId: body.tenantId, userId: user.id, role: invite.role } });
      await tx.auditEvent.create({ data: { tenantId: body.tenantId, actorId: user.id, action: 'invitation.accepted' } });
      return user.id;
    });
    writeSession(res, config, await openSession(userId, body.tenantId, requestToken(req, config)));
    res.sendStatus(204);
  });

  router.post('/auth/logout', async (req, res) => {
    const tokenHash = requestToken(req, config);
    if (tokenHash) await db.session.deleteMany({ where: { tokenHash } });
    clearSession(res, config);
    res.sendStatus(204);
  });

  router.get('/auth/me', async (req, res) => {
    const active = await session(db, requestToken(req, config));
    const { id, name, email } = active.user;
    if (!active.tenantId) {
      platformAdmin(active);
      res.json({ user: { id, name, email }, platform: true });
      return;
    }
    const tenantId = active.tenantId;
    const context = await inContext(db, tenantId, (tx) => tenantAccess(tx, active, tenantId));
    const institution = Object.fromEntries(Object.keys(institutionFields).map((key) => [key, context.tenant[key as keyof typeof institutionFields]]));
    res.json({ user: { id, name, email }, platform: false, institution, memberId: context.member.id,
      role: context.member.role, subscription: context.subscription, operational: context.operational });
  });

  router.patch('/institutions/:tenantId', async (req, res) => {
    const tenantId = uuid.parse(req.params.tenantId);
    const body = appearance.parse(req.body);
    const active = await session(db, requestToken(req, config));
    const institution = await inContext(db, tenantId, async (tx) => {
      const context = await tenantAccess(tx, active, tenantId);
      tenantAdmin(context.member.role);
      if (body.whiteLabel && context.subscription.plan !== 'ENTERPRISE') deny('White-label branding requires the Enterprise plan.');
      const result = await tx.institution.update({ where: { id: tenantId }, data: body, select: institutionFields });
      await tx.auditEvent.create({ data: { tenantId, actorId: active.user.id, action: 'institution.settings_updated' } });
      return result;
    });
    res.json({ institution });
  });

  router.get('/institutions/:tenantId/members', async (req, res) => {
    const tenantId = uuid.parse(req.params.tenantId);
    const active = await session(db, requestToken(req, config));
    const items = await inContext(db, tenantId, async (tx) => {
      const context = await tenantAccess(tx, active, tenantId);
      const role = context.member.role;
      const requested = req.query.module ? z.string().parse(req.query.module) : null;
      if (!requested) tenantAdmin(role);
      const module = requested && Object.hasOwn(modules, requested) ? modules[requested] : undefined;
      if (requested && (!module?.memberRole || !module.writers?.includes(role))) missing();
      if (module) requireModule(context, module, 'write');
      return tx.membership.findMany({
        where: { tenantId, ...(module ? { active: true, role: { in: [...module.memberRole!] } } : {}),
          ...(typeof req.query.q === 'string' && req.query.q.trim() ? { user: { name: { contains: req.query.q.trim().slice(0, 100), mode: 'insensitive' } } } : {}) },
        select: { id: true, role: true, active: true, user: { select: { name: true } } },
        orderBy: [{ user: { name: 'asc' } }, { id: 'asc' }], take: 100,
      });
    });
    res.json({ items });
  });

  router.patch('/institutions/:tenantId/members/:id', async (req, res) => {
    const tenantId = uuid.parse(req.params.tenantId);
    const id = uuid.parse(req.params.id);
    const { active: enabled } = z.object({ active: z.boolean() }).strict().parse(req.body);
    const active = await session(db, requestToken(req, config));
    await inContext(db, tenantId, async (tx) => {
      const context = await tenantAccess(tx, active, tenantId);
      tenantAdmin(context.member.role);
      const result = await tx.membership.updateMany({ where: { tenantId, id, role: { not: 'ADMIN' } }, data: { active: enabled } });
      if (result.count !== 1) missing();
      const member = await tx.membership.findUniqueOrThrow({ where: { id } });
      if (!enabled) await tx.session.deleteMany({ where: { tenantId, userId: member.userId } });
      await tx.auditEvent.create({ data: { tenantId, actorId: active.user.id, action: enabled ? 'member.enabled' : 'member.disabled', targetId: id } });
    });
    res.sendStatus(204);
  });

  router.post('/institutions/:tenantId/invitations', async (req, res) => {
    const tenantId = uuid.parse(req.params.tenantId);
    const body = z.object({ email, role: z.enum(roles).exclude(['ADMIN']) }).strict().parse(req.body);
    const active = await session(db, requestToken(req, config));
    const secret = token();
    const expiresAt = new Date(Date.now() + 3 * day);
    await inContext(db, tenantId, async (tx) => {
      const context = await tenantAccess(tx, active, tenantId);
      tenantAdmin(context.member.role);
      if (!context.operational) throw new HttpError(403, 'SUBSCRIPTION_INACTIVE', 'This institution’s subscription is inactive.');
      await tx.$queryRaw`SELECT id FROM "Institution" WHERE id = ${tenantId}::uuid FOR UPDATE`;
      const member = await tx.membership.findFirst({ where: { tenantId, user: { email: body.email } }, select: { id: true } });
      if (member) throw new HttpError(409, 'ALREADY_MEMBER', 'This account already belongs to your institution.');
      await tx.invitation.updateMany({
        where: { tenantId, email: body.email, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() },
      });
      await tx.invitation.create({ data: { ...body, tenantId, tokenHash: digest(secret), expiresAt } });
      await tx.auditEvent.create({ data: { tenantId, actorId: active.user.id, action: 'invitation.created' } });
    });
    res.status(201).json({ url: config.origin + '/#invite=' + tenantId + '.' + secret, expiresAt });
  });

  router.get('/institutions/:tenantId/audit', async (req, res) => {
    const tenantId = uuid.parse(req.params.tenantId);
    const active = await session(db, requestToken(req, config));
    const items = await inContext(db, tenantId, async (tx) => {
      tenantAdmin((await tenantAccess(tx, active, tenantId)).member.role);
      return tx.auditEvent.findMany({ where: { tenantId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100 });
    });
    res.json({ items });
  });

  router.get('/platform/institutions', async (req, res) => {
    const active = await session(db, requestToken(req, config));
    platformAdmin(active);
    const page = z.coerce.number().int().min(1).max(100000).default(1).parse(req.query.page);
    const where = typeof req.query.q === 'string' && req.query.q.trim()
      ? { name: { contains: req.query.q.trim().slice(0, 100), mode: 'insensitive' as const } } : {};
    const [items, total] = await db.$transaction([
      db.institution.findMany({ where, select: { ...institutionFields, createdAt: true, subscription: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 50, take: 50 }),
      db.institution.count({ where }),
    ]);
    res.json({ items, total });
  });

  router.patch('/platform/institutions/:tenantId/subscription', async (req, res) => {
    const tenantId = uuid.parse(req.params.tenantId);
    const body = subscribe.parse(req.body);
    const active = await session(db, requestToken(req, config));
    platformAdmin(active);
    const subscription = await inContext(db, null, async (tx) => {
      const updated = await tx.subscription.update({ where: { tenantId }, data: { ...body, endsAt: new Date(body.endsAt) } });
      await tx.auditEvent.create({ data: { actorId: active.user.id, action: 'subscription.updated', kind: 'institution', targetId: tenantId } });
      return updated;
    }, true);
    res.json({ subscription });
  });

  return router;
}
