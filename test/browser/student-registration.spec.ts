import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('student requests registration, school approves, and invitation links the student profile', async ({ page, browser, baseURL }) => {
  const suffix = randomBytes(5).toString('hex');
  const slug = 'registration-test-' + suffix;
  const adminEmail = 'registration-admin-' + suffix + '@example.test';
  const studentEmail = 'registration-student-' + suffix + '@example.test';
  const password = 'A student registration test passphrase';
  const staff = await browser.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL!, 'X-ELI-Request': '1' } });
  try {
    const api = staff.request;
    const account = await api.post('/api/v1/auth/register', { data: {
      institution: 'Registration Test School', slug, type: 'School', name: 'Chanda Administrator', email: adminEmail, password,
    } });
    expect(account.status(), await account.text()).toBe(201);
    const { institution } = await account.json();
    const student = await api.post('/api/v1/institutions/' + institution.id + '/records/students', { data: {
      title: 'Mutinta Test Learner', status: 'ACTIVE', data: { number: '000792' }, links: {},
    } });
    expect(student.status(), await student.text()).toBe(201);

    await page.goto('/student');
    await page.getByRole('link', { name: 'Register as a student' }).click();
    await expect(page.getByRole('heading', { name: 'Student registration', exact: true })).toBeVisible();
    await page.getByLabel('Workspace ID').fill(slug);
    await page.getByLabel('Full name').fill('Mutinta Test Learner');
    await page.getByLabel('Email address').fill(studentEmail);
    await page.getByLabel('Student number (optional)').fill('000792');
    await page.getByRole('button', { name: 'Submit registration request' }).click();
    await expect(page.getByRole('heading', { name: 'Registration request submitted' })).toBeVisible();

    const reviewer = await staff.newPage();
    await reviewer.goto('/');
    await reviewer.getByRole('link', { name: 'Student registrations', exact: true }).click();
    await expect(reviewer.getByRole('heading', { name: 'Student registrations', exact: true })).toBeVisible();
    await reviewer.getByRole('row').filter({ hasText: studentEmail }).getByRole('button', { name: 'Review request' }).click();
    const dialog = reviewer.getByRole('dialog');
    await dialog.locator('select[name="studentId"]').selectOption({ label: 'Mutinta Test Learner · 000792' }, { timeout: 8000 });
    await dialog.getByRole('button', { name: 'Approve and create invitation' }).click();
    await expect(dialog.getByRole('heading', { name: 'Student invitation ready' })).toBeVisible();
    const invitation = await dialog.getByLabel('Student invitation link').inputValue();

    await page.goto(invitation);
    await page.getByLabel('Full name').fill('Mutinta Test Learner');
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Join workspace' }).click();
    await expect(page.getByRole('heading', { name: 'Student portal', exact: true })).toBeVisible();
    await expect(page.getByText('000792', { exact: true })).toBeVisible();

    await dialog.getByRole('button', { name: 'Done' }).click();
    await reviewer.getByLabel('Registration status').selectOption('REGISTERED');
    await expect(reviewer.getByRole('row').filter({ hasText: studentEmail })).toContainText('Registered');
  } finally {
    await staff.close();
  }
});
