import 'dotenv/config';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createApp } from './app.js';
import { checkDatabase, database } from './db.js';
import { email, password, slug } from './security.js';

const url = process.env.DATABASE_URL;
if (process.env.NODE_ENV === 'production' || !url || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) {
  throw new Error('The demo seed requires a local disposable database.');
}
const demoEmail = email.parse(process.env.DEMO_EMAIL);
const demoPassword = password.parse(process.env.DEMO_PASSWORD);
const demoSlug = slug.parse(process.env.DEMO_SLUG ?? 'lusaka-demo');
const origin = 'http://127.0.0.1:5173';
const db = database(url);
await checkDatabase(db);
const server = createApp(db, { origin, secure: false, trustProxy: 1 }).listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
if (!address || typeof address === 'string') throw new Error('The demo server could not start.');
const root = 'http://127.0.0.1:' + address.port + '/api/v1';
const ip = '198.19.' + randomBytes(1)[0] + '.' + randomBytes(1)[0];
let cookie = '';
const date = (value: Date) => value.toISOString().slice(0, 10);
const today = new Date();
const year = today.getUTCFullYear();
const first = year + '-01-01';
const last = year + '-12-31';

async function send(path: string, body: object, method = 'POST') {
  const response = await fetch(root + path, {
    method, headers: { Cookie: cookie, Origin: origin, 'X-ELI-Request': '1', 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => null);
    throw new Error('Demo seed stopped at ' + path + ': ' + (problem?.error?.code ?? response.status));
  }
  return { cookie: response.headers.get('set-cookie')?.split(';', 1)[0] ?? '', data: response.status === 204 ? null : await response.json() };
}

try {
  const signUp = await send('/auth/register', {
    institution: 'Lusaka Learning Academy', slug: demoSlug, type: 'School', name: 'Chanda Phiri', email: demoEmail, password: demoPassword,
  });
  cookie = signUp.cookie;
  const base = '/institutions/' + signUp.data.institution.id;
  async function add(kind: string, title: string, data: Record<string, string>, links: Record<string, string> = {}, status = 'ACTIVE') {
    return (await send(base + '/records/' + kind, { title, status, data, links })).data.item.id as string;
  }
  const yearId = await add('years', year + ' Academic Year', { startsOn: first, endsOn: last });
  const term = await add('terms', 'School Term', { startsOn: first, endsOn: last }, { year: yearId });
  const programme = await add('programmes', 'Secondary Education', { code: 'SEC' });
  const classes = [];
  for (const code of ['9A', '9B', '10A', '10B']) {
    classes.push(await add('classes', 'Grade ' + code, { code }, { programme, term }));
  }
  const subject = await add('subjects', 'Mathematics', { code: 'MATH', }, { programme });
  const studentNames = [
    'Mutinta Hamoonga', 'Mulenga Chileshe', 'Leya Mwale', 'Natasha Zulu', 'Joshua Lungu', 'Tendai Banda',
    'Chileshe Tembo', 'Kondwani Phiri', 'Mwila Nkonde', 'Musonda Bwalya', 'Chipo Mulenga', 'Tionenji Mumba',
    'Mwansa Chanda', 'Lombe Mwewa', 'Tadala Nyirenda', 'Misozi Chibwe', 'Ntanda Nasilele', 'Mwaka Sakala',
  ];
  for (const [index, title] of studentNames.entries()) {
    const classroom = classes[index % classes.length];
    const student = await add('students', title, { number: 'LA-' + String(index + 1).padStart(3, '0') });
    await add('enrolments', title, { startDate: first }, { student, class: classroom, term });
    for (let offset = 6; offset >= 0; offset--) {
      const dateOfEntry = date(new Date(today.getTime() - offset * 86400000));
      if (dateOfEntry < first) continue;
      const present = (index * 2 + offset * offset + 3 * offset) % (8 + offset % 3) !== 0;
      await add('attendance', title, { date: dateOfEntry }, { student, class: classroom }, present ? 'PRESENT' : 'ABSENT');
    }
    if (index < 4) {
      await add('invoices', 'Tuition · ' + title, { number: 'INV-00' + (index + 1), amount: '1250', dueOn: last }, { student }, 'ISSUED');
    }
  }
  for (const [index, [title, jobTitle]] of [
    ['Lillian Mbewe', 'Registrar'], ['Vincent Zulu', 'Mathematics teacher'], ['Esther Banda', 'Principal'],
    ['Mercy Kapambwe', 'Administrator'], ['Peter Simukonda', 'Librarian'], ['Misozi Mbewe', 'Accountant'],
  ].entries()) await add('staff', title, { number: 'ST-00' + (index + 1), jobTitle });
  for (const [index, title] of ['Tamara Mwansa', 'Joseph Siame', 'Luwi Banda'].entries()) {
    await add('admissions', title, { number: 'APP-00' + (index + 1), submittedOn: date(today) }, { programme }, 'PENDING');
  }
  const course = await add('courses', 'Mathematics · Grade 9A', { description: 'Number skills, algebra and geometry.' }, { class: classes[0], subject }, 'PUBLISHED');
  await add('lessons', 'Introduction to algebra', { content: 'Work through the examples and practise solving linear equations.' },
    { class: classes[0], course }, 'PUBLISHED');
  await add('announcements', 'School office hours', { message: 'The school office is open Monday to Friday, 08:00 to 16:00.' }, {}, 'PUBLISHED');
  console.info('Demo workspace created. Sign in with workspace ID ' + demoSlug + ' and the email and password you supplied.');
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.$disconnect();
}
