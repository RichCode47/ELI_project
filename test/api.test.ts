import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { createApp } from '../server/app.js';
import { checkDatabase, database, inContext } from '../server/db.js';

const url = process.env.TEST_DATABASE_URL;
const ownerUrl = process.env.TEST_MIGRATION_DATABASE_URL;
const suffix = randomBytes(5).toString('hex');
const sample = 'A much longer test passphrase';
const origin = 'http://127.0.0.1:5173';
const ip = '198.18.' + randomBytes(1)[0] + '.' + randomBytes(1)[0];

test('PostgreSQL, API, role/record isolation and transactional workflows', { skip: !url }, async (t) => {
  const db = database(url!);
  const app = createApp(db, { origin, secure: false, trustProxy: 1 });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.$disconnect();
  });
  const address = server.address();
  assert(address && typeof address === 'object');
  const root = 'http://127.0.0.1:' + address.port;
  let tenantA: string, tenantB: string, studentA: string, studentB: string, otherA: string;
  let adminA: string, adminB: string, studentAccount: string, guardianAccount: string, teacherAccount: string;
  let year: string, term: string, classId: string, otherClassId: string;
  const aSlug = 'a-' + suffix;
  const bSlug = 'b-' + suffix;

  async function call(path: string, expected: number, opts: { method?: string; cookie?: string; body?: object; csrf?: boolean } = {}) {
    const headers = new Headers({ 'X-Forwarded-For': ip });
    if (opts.cookie) headers.set('Cookie', opts.cookie);
    if (opts.method && opts.csrf !== false) { headers.set('Origin', origin); headers.set('X-ELI-Request', '1'); }
    if (opts.body) headers.set('Content-Type', 'application/json');
    const res = await fetch(root + path, { method: opts.method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const text = await res.text();
    assert.equal(res.status, expected, path + ' ' + text);
    return { json: text && res.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : undefined, text, cookie: res.headers.get('set-cookie')?.split(';', 1)[0] ?? '' };
  }
  const prefix = '/api/v1';
  const path = (tenantId: string) => prefix + '/institutions/' + tenantId;
  const rec = (tenantId: string, kind: string, id = '') => path(tenantId) + '/records/' + kind + (id ? '/' + id : '');
  const payload = (title: string, status: string, data: object = {}, links: object = {}, memberId?: string) =>
    ({ title, status, data, links, ...(memberId ? { memberId } : {}) });
  const date = '2026-09-15';
  const post = (uri: string, cookie: string, body: object, expected = 201) => call(uri, expected, { method: 'POST', cookie, body });
  const get = (uri: string, cookie: string, expected = 200) => call(uri, expected, { cookie });
  async function register(slug: string) {
    return post(prefix + '/auth/register', '', { institution: 'Test ' + slug, slug, type: 'School', name: 'Test Administrator', email: slug + '@example.test', password: sample });
  }
  async function create(kind: string, body: object) {
    return (await post(rec(tenantA, kind), adminA, body)).json.item.id as string;
  }
  async function invite(role: string) {
    const created = await post(path(tenantA) + '/invitations', adminA, { email: role.toLowerCase() + suffix + '@example.test', role });
    const invited = new URL(created.json.url).hash.slice(8).split('.');
    const data = { tenantId: invited[0], token: invited[1], name: 'Test ' + role, password: sample };
    const joined = await post(prefix + '/auth/accept-invite', '', data, 204);
    await post(prefix + '/auth/accept-invite', '', data, 404);
    return { memberId: (await get(prefix + '/auth/me', joined.cookie)).json.memberId as string, cookie: joined.cookie };
  }

  await t.test('migrations enable forced policies with a restricted runtime identity', async () => {
    await checkDatabase(db);
    assert.equal(await db.record.count(), 0);
    if (ownerUrl) {
      const owner = database(ownerUrl);
      try { await assert.rejects(checkDatabase(owner)); }
      finally { await owner.$disconnect(); }
    }
    const openapi = (await call(prefix + '/openapi.json', 200)).json;
    assert.equal(openapi.openapi, '3.1.0');
    assert(Object.keys(openapi.paths).length >= 20);
  });
  await t.test('register two institutions and reject CSRF, forged scopes and cross-tenant links', async () => {
    await call(prefix + '/auth/register', 403, { method: 'POST', csrf: false, body: {} });
    const a = await register(aSlug);
    const b = await register(bSlug);
    tenantA = a.json.institution.id; tenantB = b.json.institution.id;
    adminA = a.cookie; adminB = b.cookie;
    studentA = await create('students', payload('Visible student', 'ACTIVE', { number: 'A001' }));
    otherA = await create('students', payload('Unrelated student', 'ACTIVE', { number: 'A002' }));
    studentB = (await post(rec(tenantB, 'students'), adminB, payload('Private student', 'ACTIVE', { number: 'A001' }))).json.item.id;
    assert.equal((await get(rec(tenantA, 'students'), adminA)).json.total, 2);
    await get(rec(tenantB, 'students'), adminA, 404);
    await get(rec(tenantA, 'students', studentB), adminA, 404);
    await call(rec(tenantA, 'students', studentB) + '?version=1', 404, { method: 'DELETE', cookie: adminA });
    assert.deepEqual(await inContext(db, tenantA, async (tx) => (await tx.record.findMany()).map(({ id }) => id).sort()), [studentA, otherA].sort());
    assert.equal(await db.record.count({ where: { tenantId: tenantA } }), 0);
    await assert.rejects(inContext(db, tenantA, (tx) => tx.recordLink.create({
      data: { tenantId: tenantA, sourceId: studentA, targetId: studentB, purpose: 'forbidden' },
    })));
    await assert.rejects(inContext(db, tenantA, (tx) => tx.record.create({
      data: { tenantId: tenantB, kind: 'students', title: 'Forbidden', status: 'ACTIVE', data: {} },
    })));
    year = await create('years', payload('2026 Academic Year', 'ACTIVE', { startsOn: '2026-01-01', endsOn: '2026-12-31' }));
    term = await create('terms', payload('Term 3', 'ACTIVE', { startsOn: '2026-09-01', endsOn: '2026-12-01' }, { year }));
    classId = await create('classes', payload('Grade 9 A', 'ACTIVE', { code: 'G9A' }, { term }));
    otherClassId = await create('classes', payload('Grade 9 B', 'ACTIVE', { code: 'G9B' }, { term }));
    await post(rec(tenantA, 'enrolments'), adminA, payload('Invalid relationship', 'ACTIVE', { startDate: date }, { class: classId, term, student: studentB }), 404);
    assert.equal((await get(rec(tenantA, 'enrolments'), adminA)).json.total, 0);
  });
  await t.test('teach, study and guardian access follow class assignments and verified links', async () => {
    const learner = await invite('STUDENT');
    const guardian = await invite('GUARDIAN');
    const teacher = await invite('TEACHER');
    studentAccount = learner.cookie; guardianAccount = guardian.cookie; teacherAccount = teacher.cookie;
    await call(rec(tenantA, 'students', studentA), 200, { method: 'PATCH', cookie: adminA,
      body: { ...payload('Visible student', 'ACTIVE', { number: 'A001', email: 'learner@example.test' }, {}, learner.memberId), version: 1 } });
    await call(rec(tenantA, 'students', studentA), 409, { method: 'PATCH', cookie: adminA,
      body: { ...payload('Stale', 'ACTIVE', { number: 'A001' }), version: 1 } });
    await call(rec(tenantA, 'classes', classId), 200, { method: 'PATCH', cookie: adminA,
      body: { ...payload('Grade 9 A', 'ACTIVE', { code: 'G9A' }, { term }, teacher.memberId), version: 1 } });
    await create('guardians', payload('Learner guardian', 'ACTIVE', { relationship: 'Parent' }, { student: studentA }, guardian.memberId));
    await create('enrolments', payload('Current enrolment', 'ACTIVE', { startDate: date }, { student: studentA, class: classId, term }));
    await create('enrolments', payload('Other class enrolment', 'ACTIVE', { startDate: date }, { student: otherA, class: otherClassId, term }));
    for (const cookie of [studentAccount, guardianAccount, teacherAccount]) {
      assert.equal((await get(rec(tenantA, 'students'), cookie)).json.total, 1);
      await get(rec(tenantA, 'students', otherA), cookie, 404);
      await get(rec(tenantA, 'classes', otherClassId), cookie, 404);
      await post(rec(tenantA, 'students'), cookie, payload('Unauthorized', 'ACTIVE', { number: 'X' }), 403);
    }
    assert.equal((await get(rec(tenantA, 'students', studentA), teacherAccount)).json.item.data.email, undefined);
    await post(rec(tenantA, 'attendance'), teacherAccount, payload('Daily register', 'PRESENT', { date }, { class: classId, student: studentA }));
    await post(rec(tenantA, 'attendance'), teacherAccount, payload('Other class register', 'PRESENT', { date }, { class: otherClassId, student: otherA }), 404);
    const subject = await create('subjects', payload('Mathematics', 'ACTIVE', { code: 'MATH' }));
    const assessment = await create('assessments', payload('Term exam', 'PUBLISHED', { date, maximum: '100' }, { class: classId, subject, term }));
    const grade = payload('Term exam mark', 'DRAFT', { marks: '88' }, { assessment, student: studentA, class: classId });
    const draft = (await post(rec(tenantA, 'grades'), teacherAccount, grade)).json.item;
    await get(rec(tenantA, 'grades', draft.id), studentAccount, 404);
    await post(rec(tenantA, 'grades'), teacherAccount, { ...grade, status: 'PUBLISHED' }, 403);
    await call(rec(tenantA, 'grades', draft.id), 200, { method: 'PATCH', cookie: adminA, body: { ...grade, status: 'PUBLISHED', version: 1 } });
    await get(rec(tenantA, 'grades', draft.id), guardianAccount);
    const report = await create('report-cards', payload('Term results', 'PUBLISHED', {}, { student: studentA, class: classId, term }));
    assert.deepEqual((await get(path(tenantA) + '/report-cards/' + report + '/results', studentAccount)).json.grades, [{ assessment: 'Term exam', marks: '88' }]);
  });
  await t.test('accepted applications enrol once, and concurrent receipts cannot overpay an invoice', async () => {
    const application = await create('admissions', payload('Test Applicant', 'ACCEPTED', { number: 'APP-001', submittedOn: date }));
    const enrollment = { classId, termId: term, studentNumber: 'A100', startDate: date };
    const enrolled = await post(path(tenantA) + '/admissions/' + application + '/enrol', adminA, enrollment);
    assert.equal(enrolled.json.student.title, 'Test Applicant');
    await post(path(tenantA) + '/admissions/' + application + '/enrol', adminA, enrollment, 422);
    const invoice = await create('invoices', payload('Term tuition', 'ISSUED', { number: 'I100', amount: '100', dueOn: date }, { student: studentA }));
    const outcomes = await Promise.all([1, 2].map(async (i) => fetch(root + rec(tenantA, 'receipts'), {
      method: 'POST', headers: { Cookie: adminA, Origin: origin, 'X-ELI-Request': '1', 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
      body: JSON.stringify(payload('Tuition payment', 'POSTED', { number: 'R' + i, amount: '65', paidOn: date, method: 'Cash' }, { invoice })),
    })));
    assert.deepEqual(outcomes.map((response) => response.status).sort(), [201, 422]);
    for (const response of outcomes) await response.text();
    const paid = (await get(rec(tenantA, 'invoices', invoice), guardianAccount)).json.item;
    assert.equal(paid.data.paidMinor, 6500);
    assert.equal(paid.status, 'PART_PAID');
    assert.equal((await get(rec(tenantA, 'receipts'), studentAccount)).json.total, 1);
    await get(rec(tenantB, 'invoices', invoice), adminB, 404);
    await get(path(tenantA) + '/audit', teacherAccount, 403);
    assert((await get(path(tenantA) + '/audit', adminA)).json.items.some((event: { action: string }) => event.action === 'application.enrolled'));
  });
  await t.test('reports, timetables, LMS and lending use the same scoped records', async () => {
    const exportPath = path(tenantA) + '/reports/export';
    const report = await post(exportPath, teacherAccount, { kind: 'students' }, 200);
    assert.match(report.text, /Visible student/);
    assert.doesNotMatch(report.text, /Unrelated student|Private student|learner@example/);
    await post(exportPath, guardianAccount, { kind: 'students' }, 403);
    await post(path(tenantB) + '/reports/export', adminA, { kind: 'students' }, 404);
    const subject = await create('subjects', payload('Physics', 'ACTIVE', { code: 'PHYS' }));
    const slot = { date, startsAt: '09:00', endsAt: '10:00', room: 'Room 12' };
    await create('timetable', payload('Physics period', 'PUBLISHED', slot, { class: classId, subject }));
    await post(rec(tenantA, 'timetable'), adminA, payload('Double-booked room', 'PUBLISHED', { ...slot, startsAt: '09:30' },
      { class: otherClassId, subject }), 409);
    const course = await create('courses', payload('Physics course', 'PUBLISHED', {}, { class: classId, subject }));
    const assignment = await create('assignments', payload('Read chapter 1', 'PUBLISHED', { dueOn: date, instructions: 'Solve one problem.' }, { class: classId, course }));
    await get(rec(tenantA, 'assignments', assignment), studentAccount);
    await post(rec(tenantA, 'submissions'), studentAccount, payload('Homework', 'SUBMITTED', { response: 'My answer' },
      { class: classId, student: studentA, assignment }));
    await post(rec(tenantA, 'submissions'), studentAccount, payload('Unauthorised', 'SUBMITTED', { response: 'My answer' },
      { class: classId, student: otherA, assignment }), 404);
    const book = await create('books', payload('English reader', 'ACTIVE', { number: 'LIB-001', author: 'Test Author' }));
    const details = { borrowedOn: date, dueOn: '2026-10-15' };
    const loan = await create('loans', payload('Checkout', 'OPEN', details, { book, student: studentA }));
    await post(rec(tenantA, 'loans'), adminA, payload('Duplicate checkout', 'OPEN', details, { book, student: otherA }), 409);
    await call(rec(tenantA, 'loans', loan), 200, { method: 'PATCH', cookie: adminA,
      body: { ...payload('Checkout', 'RETURNED', details, { book, student: studentA }), version: 1 } });
    await create('loans', payload('New checkout', 'OPEN', details, { book, student: otherA }));
  });
  await t.test('platform access stays separate and entitlement changes are enforced', { skip: !ownerUrl }, async () => {
    const platformDb = database(ownerUrl!);
    try { await platformDb.user.update({ where: { email: aSlug + '@example.test' }, data: { platformAdmin: true } }); }
    finally { await platformDb.$disconnect(); }
    await get(prefix + '/platform/institutions', adminA, 403);
    const login = await post(prefix + '/auth/login', '', { slug: '', email: aSlug + '@example.test', password: sample }, 204);
    assert.equal((await get(prefix + '/auth/me', login.cookie)).json.platform, true);
    await get(rec(tenantA, 'students'), login.cookie, 404);
    const subscription = { plan: 'BASIC', interval: 'ANNUAL', status: 'ACTIVE', endsAt: new Date(Date.now() + 86400000).toISOString(),
      onboardingFeeMinor: 25000, currency: 'ZMW' };
    const uri = prefix + '/platform/institutions/' + tenantA + '/subscription';
    await call(uri, 200, { method: 'PATCH', cookie: login.cookie, body: subscription });
    await get(rec(tenantA, 'courses'), adminA, 403);
    await call(uri, 200, { method: 'PATCH', cookie: login.cookie, body: { ...subscription, status: 'EXPIRED' } });
    await get(rec(tenantA, 'students'), adminA, 403);
    await post(prefix + '/auth/logout', adminA, {}, 204);
    await get(prefix + '/auth/me', adminA, 401);
  });
});
