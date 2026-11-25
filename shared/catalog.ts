export const roles = ['ADMIN', 'PRINCIPAL', 'REGISTRAR', 'ACCOUNTANT', 'TEACHER', 'STUDENT', 'GUARDIAN', 'LIBRARIAN'] as const;
export type Role = typeof roles[number];
export const reportingRoles: readonly Role[] = ['ADMIN', 'PRINCIPAL', 'REGISTRAR', 'ACCOUNTANT', 'TEACHER', 'LIBRARIAN'];
export const roleNames: Record<Role, string> = {
  ADMIN: 'Institution administrator', PRINCIPAL: 'Principal', REGISTRAR: 'Registrar',
  ACCOUNTANT: 'Accountant', TEACHER: 'Teacher', STUDENT: 'Student', GUARDIAN: 'Guardian',
  LIBRARIAN: 'Librarian',
};

export const plans = ['BASIC', 'PROFESSIONAL', 'ENTERPRISE'] as const;
export type Plan = typeof plans[number];
export const currencies = ['ZMW', 'USD', 'EUR', 'GBP', 'ZAR', 'BWP', 'MZN', 'NAD', 'MWK', 'KES', 'UGX', 'TZS', 'RWF', 'GHS', 'NGN', 'XOF', 'XAF', 'JPY'] as const;
export const institutionTypes = ['School', 'College', 'University'] as const;

export type Field = {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'time' | 'decimal' | 'email' | 'url' | 'select';
  required: boolean;
  options?: readonly string[];
};
export type Link = { name: string; label: string; kind: string; required: boolean };
export type Module = {
  label: string;
  singular: string;
  group: string;
  description: string;
  fields: Field[];
  links: Link[];
  states: readonly string[];
  readers: readonly Role[];
  writers: readonly Role[];
  minPlan?: Plan;
  memberRole?: readonly Role[];
  key?: readonly string[];
};

const administration: Role[] = ['ADMIN', 'PRINCIPAL'];
const academic: Role[] = [...administration, 'REGISTRAR'];
const instruction: Role[] = [...academic, 'TEACHER'];
const finance: Role[] = [...administration, 'ACCOUNTANT'];
const library: Role[] = [...administration, 'LIBRARIAN'];
const studentFacing: Role[] = [...instruction, 'STUDENT', 'GUARDIAN'];
const f = (name: string, label: string, type: Field['type'] = 'text', required = true, options?: readonly string[]): Field =>
  ({ name, label, type, required, options });
const l = (name: string, label: string, kind: string, required = true): Link => ({ name, label, kind, required });
const student = l('student', 'Student', 'students');
const classroom = l('class', 'Class', 'classes');
const term = l('term', 'Term', 'terms');
const subject = l('subject', 'Subject', 'subjects');
const active = ['ACTIVE', 'ARCHIVED'];
const publishing = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
const define = (
  label: string, singular: string, group: string, description: string, fields: Field[],
  links: Link[], states: readonly string[], readers: readonly Role[], writers: readonly Role[],
  extra: Pick<Module, 'minPlan' | 'memberRole' | 'key'> = {},
): Module => ({ label, singular, group, description, fields, links, states, readers, writers, ...extra });

export const modules: Readonly<Record<string, Module>> = Object.freeze({
  students: define('Students', 'student', 'People', 'Manage student profiles and admission numbers.',
    [f('number', 'Student number', 'text', false), f('email', 'Contact email', 'email', false)], [], active,
    [...studentFacing, 'ACCOUNTANT', 'LIBRARIAN'], academic, { key: ['number'], memberRole: ['STUDENT'] }),
  admissions: define('Admissions', 'application', 'People', 'Track applications and enrol accepted students.',
    [f('number', 'Application number'), f('email', 'Applicant email', 'email', false), f('submittedOn', 'Application date', 'date')],
    [l('programme', 'Programme', 'programmes', false)], ['PENDING', 'ACCEPTED', 'DECLINED', 'ENROLLED'],
    academic, academic, { key: ['number'] }),
  staff: define('Staff', 'staff member', 'People', 'Manage teachers, lecturers and institutional staff.',
    [f('number', 'Staff number'), f('jobTitle', 'Job title'), f('email', 'Work email', 'email', false)],
    [], active, instruction, academic, { key: ['number'], memberRole: ['ADMIN', 'PRINCIPAL', 'REGISTRAR', 'ACCOUNTANT', 'TEACHER', 'LIBRARIAN'] }),
  guardians: define('Guardian links', 'guardian link', 'People', 'Authorise a guardian account to access a student’s published records.',
    [f('relationship', 'Relationship')], [student], active, academic, academic, { memberRole: ['GUARDIAN'], key: ['@member', '@student'] }),
  enrolments: define('Enrolments', 'enrolment', 'People', 'Assign students to a class and term.',
    [f('startDate', 'Enrolment date', 'date')], [student, classroom, term], active, studentFacing, academic,
    { key: ['@student', '@class', '@term'] }),
  programmes: define('Programmes', 'programme', 'Academics', 'Organise academic pathways and qualifications.',
    [f('code', 'Programme code'), f('description', 'Description', 'textarea', false)], [], active, instruction, academic, { key: ['code'] }),
  years: define('Academic years', 'academic year', 'Academics', 'Set the dates for each academic year.',
    [f('startsOn', 'Start date', 'date'), f('endsOn', 'End date', 'date')], [], active, instruction, academic),
  terms: define('Terms', 'term', 'Academics', 'Set institution-specific terms or semesters.',
    [f('startsOn', 'Start date', 'date'), f('endsOn', 'End date', 'date')], [l('year', 'Academic year', 'years')], active, instruction, academic),
  classes: define('Classes', 'class', 'Academics', 'Assign class leads and organise cohorts.',
    [f('code', 'Class code')], [term, l('programme', 'Programme', 'programmes', false)], active, studentFacing, academic,
    { key: ['code', '@term'], memberRole: ['TEACHER'] }),
  subjects: define('Subjects', 'subject', 'Academics', 'Maintain the subject catalogue.',
    [f('code', 'Subject code')], [l('programme', 'Programme', 'programmes', false)], active, instruction, academic, { key: ['code'] }),
  timetable: define('Timetable', 'lesson slot', 'Academics', 'Schedule class sessions by date, time and room.',
    [f('date', 'Date', 'date'), f('startsAt', 'Start time', 'time'), f('endsAt', 'End time', 'time'), f('room', 'Room', 'text', false)],
    [classroom, subject], publishing, studentFacing, academic),
  attendance: define('Attendance', 'attendance entry', 'Academics', 'Record daily attendance by class and student.',
    [f('date', 'Date', 'date'), f('note', 'Note', 'text', false)], [student, classroom], ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'],
    studentFacing, instruction, { key: ['date', '@class', '@student'] }),
  assessments: define('Assessments', 'assessment', 'Academics', 'Schedule exams and define their maximum marks.',
    [f('date', 'Date', 'date'), f('maximum', 'Maximum marks', 'decimal')], [classroom, subject, term], publishing,
    studentFacing, instruction),
  grades: define('Grades', 'grade', 'Academics', 'Capture marks and publish grades after review.',
    [f('marks', 'Marks awarded', 'decimal'), f('feedback', 'Feedback', 'textarea', false)],
    [student, classroom, l('assessment', 'Assessment', 'assessments')], publishing, studentFacing, instruction,
    { key: ['@student', '@assessment'] }),
  'report-cards': define('Report cards', 'report card', 'Academics', 'Publish term results and remarks to students and guardians.',
    [f('remarks', 'Remarks', 'textarea', false)], [student, classroom, term], publishing, studentFacing, academic,
    { key: ['@student', '@class', '@term'] }),
  fees: define('Fee schedule', 'fee', 'Finance', 'Set standard institution fees in the configured currency.',
    [f('code', 'Fee code'), f('amount', 'Amount', 'decimal')], [l('term', 'Term', 'terms', false)], active, finance, finance, { key: ['code'] }),
  invoices: define('Invoices', 'invoice', 'Finance', 'Issue student invoices and track outstanding balances.',
    [f('number', 'Invoice number'), f('amount', 'Amount', 'decimal'), f('dueOn', 'Due date', 'date')],
    [student, l('fee', 'Fee', 'fees', false)], ['DRAFT', 'ISSUED', 'PART_PAID', 'PAID', 'VOID'],
    [...finance, 'STUDENT', 'GUARDIAN'], finance, { key: ['number'] }),
  receipts: define('Receipts', 'receipt', 'Finance', 'Record settled payments and update the invoice balance.',
    [f('number', 'Receipt number'), f('amount', 'Amount received', 'decimal'), f('paidOn', 'Payment date', 'date'),
      f('method', 'Payment method', 'select', true, ['Cash', 'Bank transfer', 'Mobile money', 'Card', 'Other'])],
    [l('invoice', 'Invoice', 'invoices')], ['POSTED'], [...finance, 'STUDENT', 'GUARDIAN'], finance, { key: ['number'] }),
  courses: define('Courses', 'course', 'Learning', 'Publish course spaces for enrolled students.',
    [f('description', 'Course overview', 'textarea', false)], [classroom, subject], publishing, studentFacing, instruction,
    { minPlan: 'PROFESSIONAL' }),
  lessons: define('Lessons', 'lesson', 'Learning', 'Publish lesson text and references within a course.',
    [f('content', 'Lesson content', 'textarea'), f('resource', 'Resource URL', 'url', false)],
    [classroom, l('course', 'Course', 'courses')], publishing, studentFacing, instruction, { minPlan: 'PROFESSIONAL' }),
  assignments: define('Assignments', 'assignment', 'Learning', 'Share coursework instructions and deadlines.',
    [f('instructions', 'Instructions', 'textarea'), f('dueOn', 'Due date', 'date')], [classroom, l('course', 'Course', 'courses')],
    publishing, studentFacing, instruction, { minPlan: 'PROFESSIONAL' }),
  submissions: define('Submissions', 'submission', 'Learning', 'Submit coursework and follow up with the assigned teacher.',
    [f('response', 'Response', 'textarea')], [classroom, student, l('assignment', 'Assignment', 'assignments')], ['SUBMITTED'],
    studentFacing, [...instruction, 'STUDENT'], { minPlan: 'PROFESSIONAL', key: ['@student', '@assignment'] }),
  books: define('Library catalogue', 'book copy', 'Library', 'Catalogue individual book copies and validate availability.',
    [f('number', 'Accession number'), f('author', 'Author'), f('isbn', 'ISBN', 'text', false)], [], active,
    [...library, 'STUDENT', 'TEACHER'], library, { minPlan: 'PROFESSIONAL', key: ['number'] }),
  loans: define('Library loans', 'loan', 'Library', 'Lend book copies and record returns.',
    [f('borrowedOn', 'Checkout date', 'date'), f('dueOn', 'Due date', 'date')],
    [l('book', 'Book copy', 'books'), student], ['OPEN', 'RETURNED'], [...library, 'STUDENT', 'GUARDIAN'], library,
    { minPlan: 'PROFESSIONAL' }),
  announcements: define('Announcements', 'announcement', 'Communications', 'Publish institution-wide notices to the workspace.',
    [f('message', 'Message', 'textarea')], [], publishing, roles, academic),
  notifications: define('Notifications', 'notification', 'Communications', 'Send targeted in-app notifications.',
    [f('message', 'Message', 'textarea')], [], ['SENT'], roles, administration, { memberRole: roles }),
  certificates: define('Certificates', 'certificate', 'Credentials', 'Issue and track numbered credentials.',
    [f('number', 'Certificate number'), f('issuedOn', 'Issue date', 'date'), f('award', 'Award')], [student], publishing,
    [...academic, 'STUDENT', 'GUARDIAN'], academic, { minPlan: 'PROFESSIONAL', key: ['number'] }),
  transcripts: define('Transcripts', 'transcript', 'Credentials', 'Publish transcript summaries to students and guardians.',
    [f('number', 'Transcript number'), f('issuedOn', 'Issue date', 'date'), f('summary', 'Academic summary', 'textarea')],
    [student, l('programme', 'Programme', 'programmes', false)], publishing,
    [...academic, 'STUDENT', 'GUARDIAN'], academic, { minPlan: 'PROFESSIONAL', key: ['number'] }),
});

export function formatState(value: string) {
  const text = value.toLowerCase().replaceAll('_', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function includedInPlan(module: Module, plan: Plan) {
  return plans.indexOf(plan) >= plans.indexOf(module.minPlan ?? 'BASIC');
}
