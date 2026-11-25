import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { modules } from '../shared/catalog.js';
import type { Module } from '../shared/catalog.js';
import { toMinor } from '../shared/money.js';
import type { Prisma, Record as Entry } from '../generated/prisma/client.js';
import type { TenantAccess } from './access.js';
import { requireModule, visibility } from './access.js';
import type { Transaction } from './db.js';
import { deny, email, HttpError, invalid, isoDate, missing, uuid } from './security.js';

export const bodySchema = z.object({
  title: z.string().trim().min(1).max(160), status: z.string().max(24),
  data: z.record(z.string().max(40), z.string().trim().max(10000)),
  links: z.record(z.string().max(40), uuid),
  memberId: uuid.nullish(),
}).strict();
export const changeSchema = bodySchema.extend({ version: z.int().min(1) });
type RecordBody = z.infer<typeof bodySchema>;
type Related = Record<string, Entry>;
export const contents = (record: Pick<Entry, 'data'>) => record.data as Record<string, string | number | object>;
export const relatedTo = (purpose: string, targetId: string): Prisma.RecordWhereInput =>
  ({ links: { some: { purpose, targetId } } });

export function moduleFor(kind: string): Module {
  if (!Object.hasOwn(modules, kind)) missing();
  return modules[kind];
}

export function statesFor(kind: string, definition: Module, old?: string) {
  if (kind === 'invoices') {
    if (!old) return ['DRAFT', 'ISSUED'];
    if (old === 'DRAFT') return ['DRAFT', 'ISSUED', 'VOID'];
    if (old === 'ISSUED') return ['ISSUED', 'VOID'];
    return [old];
  }
  if (kind === 'admissions') {
    if (!old || old === 'PENDING') return ['PENDING', 'ACCEPTED', 'DECLINED'];
    return [old];
  }
  if (kind === 'loans') return old ? old === 'RETURNED' ? ['RETURNED'] : ['OPEN', 'RETURNED'] : ['OPEN'];
  return definition.states;
}

const decimal = /^\d{1,9}(?:\.\d{1,3})?$/;
function validateField(field: Module['fields'][number], value: string) {
  let valid = value.length <= (field.type === 'textarea' ? 10000 : 254);
  if (field.type === 'date') valid &&= isoDate.safeParse(value).success;
  if (field.type === 'time') valid &&= /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (field.type === 'decimal') valid &&= decimal.test(value);
  if (field.type === 'email') valid &&= email.safeParse(value).success;
  if (field.type === 'url') valid &&= z.url({ protocol: /^https$/ }).safeParse(value).success;
  if (field.type === 'select') valid &&= !!field.options?.includes(value);
  if (!valid) invalid(field.label + ' has an invalid value.');
}

async function validateTargets(tx: Transaction, context: TenantAccess, module: Module, body: RecordBody) {
  const tenantId = context.tenant.id;
  const related: Related = {};
  if (Object.keys(body.links).some((key) => !module.links.some((link) => link.name === key))) invalid('Unknown record relationship.');
  for (const link of module.links) {
    const id = body.links[link.name];
    if (!id) {
      if (link.required) invalid(link.label + ' is required.');
      continue;
    }
    const target = await tx.record.findFirst({
      where: { id, tenantId, kind: link.kind, AND: [visibility(context, link.kind)] },
    });
    if (!target) missing();
    related[link.name] = target;
  }
  const memberId = body.memberId || null;
  if (memberId && !module.memberRole) invalid('This module does not support a member link.');
  if (memberId) {
    const member = await tx.membership.findFirst({
      where: { id: memberId, tenantId, role: { in: [...module.memberRole!] }, active: true }, select: { id: true },
    });
    if (!member) missing();
  }
  return { related, memberId };
}

async function checkRoster(tx: Transaction, tenantId: string, related: Related, assessmentTerm?: Entry) {
  if (!related.student || !related.class) return;
  if (related.student.status !== 'ACTIVE' || related.class.status !== 'ACTIVE') invalid('Use an active student and class.');
  const enrolment = await tx.record.findFirst({
    where: { tenantId, kind: 'enrolments', status: 'ACTIVE',
      AND: [relatedTo('student', related.student.id), relatedTo('class', related.class.id),
        ...(assessmentTerm ? [relatedTo('term', assessmentTerm.id)] : [])] },
    select: { id: true },
  });
  if (!enrolment) invalid('The student must have an active enrolment in this class.');
}

async function targetLink(tx: Transaction, tenantId: string, entry: Entry, purpose: string) {
  const relation = await tx.recordLink.findUnique({
    where: { tenantId_sourceId_purpose: { tenantId, sourceId: entry.id, purpose } }, include: { target: true },
  });
  if (!relation) invalid('A required relationship is missing.');
  return relation.target;
}

function priced(data: Record<string, string>, key: string, currency: string) {
  const amount = toMinor(data[key], currency);
  if (amount === null) invalid('Enter a positive amount with the correct decimal places for ' + currency + '.');
  return amount;
}

async function resolveStudentNumber(tx: Transaction, tenantId: string, requested?: string, previous?: Entry) {
  // Student creation, edits and enrolment hold the same tenant transaction lock.
  const findNumber = (number: string) => tx.record.findUnique({
    where: { tenantId_kind_key: { tenantId, kind: 'students', key: JSON.stringify([number.toLowerCase()]) } },
    select: { id: true },
  });
  if (requested) {
    const match = await findNumber(requested);
    if (match && match.id !== previous?.id) {
      throw new HttpError(409, 'STUDENT_NUMBER_IN_USE', 'This student number is already in use at your institution.');
    }
    return requested;
  }

  const existing = previous && contents(previous).number;
  if (typeof existing === 'string' && existing) return existing;
  for (let attempt = 0; attempt < 5; attempt++) {
    const generated = 'STU-' + randomInt(0, 10_000_000_000).toString().padStart(10, '0');
    if (!await findNumber(generated)) return generated;
  }
  throw new HttpError(503, 'STUDENT_NUMBER_UNAVAILABLE', 'A student number could not be generated. Please try again.');
}

export async function validatedRecord(tx: Transaction, context: TenantAccess, kind: string, body: RecordBody, previous?: Entry) {
  const module = moduleFor(kind);
  requireModule(context, module, 'write');
  const tenantId = context.tenant.id;
  if (!statesFor(kind, module, previous?.status).includes(body.status)) invalid('This status transition is unavailable.');
  if (Object.keys(body.data).some((key) => !module.fields.some((field) => field.name === key))) invalid('Unknown record field.');
  if (context.member.role === 'TEACHER' && kind === 'grades' && body.status !== 'DRAFT') deny('A registrar must publish grades.');
  if (context.member.role === 'TEACHER' && kind === 'grades' && previous?.status !== undefined && previous.status !== 'DRAFT') deny();
  const data: Record<string, string> = {};
  for (const field of module.fields) {
    const value = body.data[field.name];
    if (value) { validateField(field, value); data[field.name] = value; }
    else if (field.required) invalid(field.label + ' is required.');
  }
  const { related, memberId } = await validateTargets(tx, context, module, body);
  if (['guardians', 'notifications'].includes(kind) && !memberId) invalid('An active account is required.');
  if (memberId && (kind === 'students' || kind === 'staff')) {
    const duplicate = await tx.record.findFirst({
      where: { tenantId, kind, memberId, id: { not: previous?.id } }, select: { id: true },
    });
    if (duplicate) throw new HttpError(409, 'PROFILE_LINKED', 'This account already has a profile.');
  }
  if (data.endsOn && data.endsOn < data.startsOn) invalid('End date must be on or after the start date.');
  if (related.year) {
    const year = contents(related.year);
    if (data.startsOn < String(year.startsOn) || data.endsOn > String(year.endsOn)) invalid('The term must fall within the academic year.');
  }
  if (kind === 'timetable') {
    if (data.endsAt <= data.startsAt) invalid('End time must be later than the start time.');
    if (body.status === 'PUBLISHED') {
      const conflict = await tx.record.findFirst({
        where: { tenantId, kind, status: 'PUBLISHED', id: { not: previous?.id },
          AND: [
            { data: { path: ['date'], equals: data.date } },
            { data: { path: ['startsAt'], lt: data.endsAt } },
            { data: { path: ['endsAt'], gt: data.startsAt } },
            { OR: [relatedTo('class', related.class.id), ...(data.room ? [{ data: { path: ['room'], equals: data.room } }] : [])] },
          ] },
        select: { id: true },
      });
      if (conflict) throw new HttpError(409, 'TIMETABLE_CONFLICT', 'The class or room is already booked during this slot.');
    }
  }
  if (related.class && related.term) {
    const classTerm = await targetLink(tx, tenantId, related.class, 'term');
    if (classTerm.id !== related.term.id) invalid('The class belongs to a different term.');
  }
  if (kind === 'classes' && previous) {
    const classTerm = await targetLink(tx, tenantId, previous, 'term');
    if (classTerm.id !== related.term.id) invalid('Create a separate class for a new term.');
  }
  if (kind === 'enrolments') {
    if (body.status === 'ACTIVE') {
      const term = contents(related.term);
      if (related.student.status !== 'ACTIVE' || related.class.status !== 'ACTIVE' || related.term.status !== 'ACTIVE') {
        invalid('Use an active student, class and term.');
      }
      if (data.startDate < String(term.startsOn) || data.startDate > String(term.endsOn)) invalid('The enrolment date must fall within the term.');
    }
  }
  if (kind === 'assessments' && Number(data.maximum) <= 0) invalid('Maximum marks must be positive.');
  if (related.assessment) {
    if (Number(data.marks) > Number(contents(related.assessment).maximum)) invalid('Marks exceed the assessment maximum.');
    if (body.status === 'PUBLISHED' && related.assessment.status !== 'PUBLISHED') invalid('Publish the assessment before publishing marks.');
  }
  if (related.course && body.status === 'PUBLISHED' && related.course.status !== 'PUBLISHED') invalid('Publish the course first.');
  if (related.assignment && related.assignment.status !== 'PUBLISHED') invalid('Publish the assignment first.');
  for (const [purpose, target] of Object.entries(related)) {
    if (['assessment', 'course', 'assignment'].includes(purpose)) {
      const owner = await targetLink(tx, tenantId, target, 'class');
      if (owner.id !== related.class.id) invalid('This item belongs to a different class.');
    }
  }
  if (['attendance', 'timetable', 'assessments'].includes(kind)) {
    const classTerm = related.term ?? await targetLink(tx, tenantId, related.class, 'term');
    const term = contents(classTerm);
    if (data.date < String(term.startsOn) || data.date > String(term.endsOn)) invalid('The date must fall within the class term.');
  }
  if (previous && ['assessments', 'courses', 'assignments'].includes(kind)) {
    const oldClass = await targetLink(tx, tenantId, previous, 'class');
    if (oldClass.id !== related.class.id) invalid('Create a separate record for a different class.');
    if (kind === 'assignments') {
      const oldCourse = await targetLink(tx, tenantId, previous, 'course');
      if (oldCourse.id !== related.course.id) invalid('Create a separate assignment for a different course.');
    }
  }
  if (['attendance', 'grades', 'report-cards', 'submissions'].includes(kind)) {
    const targetTerm = related.assessment ? await targetLink(tx, tenantId, related.assessment, 'term') : related.term;
    await checkRoster(tx, tenantId, related, targetTerm);
  }
  if (kind === 'loans') {
    if (data.dueOn < data.borrowedOn) invalid('Due date must follow the checkout date.');
    if (previous) {
      if (previous.status === 'OPEN' && body.status === 'RETURNED') {
        return { title: previous.title, status: 'RETURNED', data: previous.data as Prisma.InputJsonValue, key: previous.key, memberId: null, preserveLinks: true };
      }
      deny('Recorded loans can only be returned.');
    }
    if (body.status === 'OPEN') {
      const loan = await tx.record.findFirst({
        where: { tenantId, kind, status: 'OPEN', AND: [relatedTo('book', related.book.id)] },
        select: { id: true },
      });
      if (loan || related.book.status !== 'ACTIVE') throw new HttpError(409, 'BOOK_UNAVAILABLE', 'This copy is unavailable.');
    }
  }
  if (['invoices', 'fees', 'receipts'].includes(kind)) {
    if (kind === 'receipts' && previous) deny('Posted receipts are final.');
    if (kind === 'invoices' && previous && previous.status !== 'DRAFT') {
      if (previous.status === 'ISSUED' && body.status === 'VOID') {
        return { title: previous.title, status: body.status, data: previous.data as Prisma.InputJsonValue, key: previous.key, memberId,
          preserveLinks: true };
      }
      deny('Issued invoices can only be voided before payment.');
    }
    const invoiceData = related.invoice ? contents(related.invoice) : null;
    const currency = invoiceData ? String(invoiceData.currency) : String(previous ? contents(previous).currency : context.tenant.currency);
    const amountMinor = priced(data, 'amount', currency);
    if (invoiceData) {
      const outstanding = Number(invoiceData.amountMinor) - Number(invoiceData.paidMinor);
      if (!['ISSUED', 'PART_PAID'].includes(related.invoice.status) || amountMinor > outstanding) invalid('Payment exceeds the outstanding balance or the invoice is closed.');
      const paidMinor = Number(invoiceData.paidMinor) + amountMinor;
      await tx.record.update({ where: { tenantId_id: { tenantId, id: related.invoice.id } },
        data: { status: paidMinor === Number(invoiceData.amountMinor) ? 'PAID' : 'PART_PAID',
          data: { ...invoiceData, paidMinor } as Prisma.InputJsonValue, version: { increment: 1 } } });
    }
    Object.assign(data, { currency, amountMinor, ...(kind === 'invoices' ? { paidMinor: 0 } : {}) });
  }
  if (kind === 'students') data.number = await resolveStudentNumber(tx, tenantId, data.number, previous);
  const key = module.key?.map((part) => {
    if (part === '@member') return memberId;
    if (part.startsWith('@')) return related[part.slice(1)]?.id;
    return data[part]?.toLowerCase();
  });
  return {
    title: body.title, status: body.status, data: data as Prisma.InputJsonValue,
    key: key ? JSON.stringify(key) : null, memberId, preserveLinks: false,
  };
}
