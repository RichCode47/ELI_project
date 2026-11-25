import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

test('students sign in and see their own timetable, grades, attendance and finances', async ({ page, playwright, baseURL }) => {
  const suffix = randomBytes(5).toString('hex');
  const slug = 'student-test-' + suffix;
  const adminEmail = 'admin-' + suffix + '@example.test';
  const studentEmail = 'learner-' + suffix + '@example.test';
  const password = 'A local test passphrase ' + suffix;
  const headers = { Origin: baseURL!, 'X-ELI-Request': '1' };
  const admin = await playwright.request.newContext({ baseURL, extraHTTPHeaders: headers });
  const learner = await playwright.request.newContext({ baseURL, extraHTTPHeaders: headers });
  async function create(client: APIRequestContext, path: string, body: object) {
    const response = await client.post('/api/v1' + path, { data: body });
    expect(response.status(), await response.text()).toBe(201);
    return response.json();
  }
  try {
    const { institution } = await create(admin, '/auth/register', {
      institution: 'Lusaka Learning Academy', slug, type: 'School', name: 'Chanda Administrator', email: adminEmail, password,
    });
    const route = '/institutions/' + institution.id;
    const invite = await create(admin, route + '/invitations', { email: studentEmail, role: 'STUDENT' });
    const [tenantId, token] = new URL(invite.url).hash.slice(8).split('.');
    const join = await learner.post('/api/v1/auth/accept-invite', { data: { tenantId, token, name: 'Mutinta Hamoonga', password } });
    expect(join.status()).toBe(204);
    const me = await (await learner.get('/api/v1/auth/me')).json();
    const pending = await (await learner.get('/api/v1' + route + '/student-portal')).json();
    expect(pending.profile).toBeNull();
    const createRecord = async (kind: string, title: string, status: string, data: object = {}, links: object = {}, memberId?: string) =>
      (await create(admin, route + '/records/' + kind, { title, status, data, links, memberId })).item.id as string;
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lusaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const start = date.slice(0, 4) + '-01-01';
    const end = date.slice(0, 4) + '-12-31';
    const year = await createRecord('years', 'Academic year', 'ACTIVE', { startsOn: start, endsOn: end });
    const term = await createRecord('terms', 'Current term', 'ACTIVE', { startsOn: start, endsOn: end }, { year });
    const classroom = await createRecord('classes', 'Grade 9A', 'ACTIVE', { code: 'G9A' }, { term });
    const subject = await createRecord('subjects', 'Mathematics', 'ACTIVE', { code: 'MATH' });
    const student = await createRecord('students', 'Mutinta Hamoonga', 'ACTIVE', { number: 'LA-104' }, {}, me.memberId);
    const unrelated = await createRecord('students', 'Another student', 'ACTIVE', { number: 'LA-105' });
    for (const member of [student, unrelated]) {
      await createRecord('enrolments', 'Grade 9 enrolment', 'ACTIVE', { startDate: start }, { student: member, class: classroom, term });
    }
    await createRecord('timetable', 'Algebra lesson', 'PUBLISHED', { date, startsAt: '09:00', endsAt: '10:00', room: 'Room 4' }, { class: classroom, subject });
    await createRecord('timetable', 'Unpublished timetable slot', 'DRAFT', { date, startsAt: '11:00', endsAt: '12:00' }, { class: classroom, subject });
    const assessment = await createRecord('assessments', 'Algebra quiz', 'PUBLISHED', { date, maximum: '100' }, { class: classroom, subject, term });
    await createRecord('grades', 'Algebra quiz result', 'PUBLISHED', { marks: '88' }, { student, class: classroom, assessment });
    await createRecord('grades', 'Another student’s mark', 'PUBLISHED', { marks: '91' }, { student: unrelated, class: classroom, assessment });
    await createRecord('report-cards', 'Mathematics report', 'PUBLISHED', {}, { student, class: classroom, term });
    await createRecord('attendance', 'Morning register', 'PRESENT', { date }, { student, class: classroom });
    await createRecord('courses', 'Mathematics · Grade 9A', 'PUBLISHED', { description: 'Algebra and geometry.' }, { class: classroom, subject });
    await createRecord('announcements', 'Library opens at 08:00', 'PUBLISHED', { message: 'Visit the library before class.' });
    await createRecord('invoices', 'Term tuition', 'ISSUED', { number: 'INV-100', amount: '850', dueOn: end }, { student });
    await createRecord('invoices', 'Another student’s invoice', 'ISSUED', { number: 'INV-101', amount: '900', dueOn: end }, { student: unrelated });
  } finally {
    await admin.dispose();
    await learner.dispose();
  }

  await page.goto('/');
  await page.getByRole('link', { name: 'Student portal', exact: true }).click();
  await expect(page).toHaveURL(/\/student$/);
  await expect(page).toHaveTitle('Student portal · ELI EdTech');
  await expect(page.getByRole('heading', { name: 'Student portal sign-in' })).toBeVisible();
  await page.getByLabel('Workspace ID').fill(slug);
  await page.getByLabel('Email address').fill(adminEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('The workspace, email or password is incorrect.');
  await page.getByLabel('Email address').fill(studentEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Student portal', exact: true })).toBeVisible();
  await expect(page.getByText('LA-104', { exact: true })).toBeVisible();
  await expect(page.getByText('Algebra lesson', { exact: true })).toBeVisible();
  await expect(page.getByText('Algebra quiz result', { exact: true })).toBeVisible();
  await expect(page.getByText('Morning register', { exact: true })).toBeVisible();
  await expect(page.getByText('Library opens at 08:00', { exact: true })).toBeVisible();
  await expect(page.getByText('Unpublished timetable slot', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Another student’s mark', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Admissions', exact: true })).toHaveCount(0);

  if (process.env.PORTAL_SCREENSHOT_PATH) await page.screenshot({ path: process.env.PORTAL_SCREENSHOT_PATH, fullPage: true });
  await page.getByRole('link', { name: 'Fees and invoices', exact: false }).click();
  await page.getByRole('button', { name: 'Term tuition', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('ZMW 850.00', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Another student’s invoice', { exact: true })).toHaveCount(0);
  await page.goto('/');
  await expect(page).toHaveURL(/\/student\/?$/);
  await expect(page.getByRole('heading', { name: 'Student portal', exact: true })).toBeVisible();
});
