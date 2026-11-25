import { modules, plans, roles, currencies, institutionTypes } from '../shared/catalog.js';
import { registrationStatuses } from '../shared/student-registration.js';
import type { Config } from './security.js';

const str = { type: 'string' };
const id = { type: 'string', format: 'uuid' };
const date = { type: 'string', format: 'date' };
const time = { type: 'string', format: 'date-time' };
const text = (values: readonly string[]) => ({ ...str, enum: values });
const object = (properties: object, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const dict = (schema: object) => ({ type: 'object', additionalProperties: schema });
const list = (schema: object) => ({ type: 'array', items: schema });
const parameter = (name: string, schema: object = id, location = 'path', required = location === 'path') => ({ name, in: location, required, schema });
const json = (schema: object) => ({ 'application/json': { schema } });
const version = { type: 'integer', minimum: 1 };
const page = parameter('page', version, 'query');
const query = parameter('q', str, 'query');
const institution = parameter('tenantId');
const kind = parameter('kind', text(Object.keys(modules)));
const recordId = parameter('id');
const csrf = parameter('X-ELI-Request', { const: '1' }, 'header', true);
const record = object({
  title: { ...str, minLength: 1, maxLength: 160 }, status: str, data: dict(str), links: dict(id), memberId: { anyOf: [id, { type: 'null' }] },
}, ['title', 'status', 'data', 'links']);
const readRecord = object({
  id, kind: text(Object.keys(modules)), title: str, status: str, updatedAt: time, version,
  data: dict({}), links: dict(object({ id, title: str })), memberId: {}, memberName: {}, statuses: list(str),
});
const credentials = { email: { ...str, format: 'email' }, password: { ...str, format: 'password' } };
const sub = object({
  plan: text(plans), interval: text(['MONTHLY', 'ANNUAL']), status: text(['TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED']),
  endsAt: time, onboardingFeeMinor: { type: 'integer', minimum: 0 }, currency: text(currencies),
});

function operation(summary: string, options: {
  write?: boolean; public?: boolean; status?: number; parameters?: object[]; body?: object; response?: object; mediaType?: string;
} = {}) {
  const { write, status = 200, parameters = [], body, response = { type: 'object' }, mediaType = 'application/json' } = options;
  return {
    summary, security: options.public ? [] : [{ session: [] }],
    parameters: [...parameters, ...(write ? [csrf] : [])],
    ...(body ? { requestBody: { required: true, content: json(body) } } : {}),
    responses: {
      [String(status)]: status === 204 ? { description: 'Success' } : { description: 'Success', content: { [mediaType]: { schema: response } } },
      default: { description: 'Failed request', content: json(object({ error: object({ code: str, message: str, requestId: id }) })) },
    },
  };
}

export function openapi(config: Config) {
  const scope = '/v1/institutions/{tenantId}';
  const records = scope + '/records/{kind}';
  return {
    openapi: '3.1.0',
    info: { title: 'ELI EdTech API', version: '0.1.0', description: 'Include the workspace-origin Origin header on writes. Records enforce membership, role, entitlement and row scope.' },
    servers: [{ url: '/api' }],
    components: { securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: config.secure ? '__Host-eli_session' : 'eli_session' } } },
    'x-record-catalogue': modules,
    paths: {
      '/health/live': { get: operation('Liveness', { public: true }) },
      '/health/ready': { get: operation('Database and isolation readiness', { public: true }) },
      '/v1/openapi.json': { get: operation('OpenAPI document', { public: true }) },
      '/v1/auth/register': { post: operation('Register an institution and start a trial', { write: true, public: true, status: 201,
        body: object({ institution: str, slug: str, type: text(institutionTypes), name: str, ...credentials }) }) },
      '/v1/auth/student-registration': { post: operation('Request student access to a school workspace', {
        write: true, public: true, status: 202,
        body: object({ slug: str, name: str, email: credentials.email, studentNumber: { ...str, maxLength: 254 } }, ['slug', 'name', 'email']),
      }) },
      '/v1/auth/login': { post: operation('Create a workspace or platform session', { write: true, public: true, status: 204,
        body: object({ slug: str, ...credentials, portal: { const: 'student' } }, ['slug', 'email', 'password']) }) },
      '/v1/auth/accept-invite': { post: operation('Accept a single-use membership invitation', { write: true, public: true, status: 204,
        body: object({ tenantId: id, token: str, name: str, password: credentials.password }) }) },
      '/v1/auth/logout': { post: operation('Revoke the session', { write: true, status: 204, public: true }) },
      '/v1/auth/me': { get: operation('Get active workspace and role') },
      [scope]: { patch: operation('Update institution branding and defaults', { write: true, parameters: [institution],
        body: object({ name: str, brand: str, currency: text(currencies), timeZone: str, whiteLabel: { type: 'boolean' } }) }) },
      [scope + '/members']: { get: operation('List members or choices for a writable module', { parameters: [institution, parameter('module', str, 'query'), query] }) },
      [scope + '/members/{id}']: { patch: operation('Enable or disable a membership', { write: true, status: 204,
        parameters: [institution, recordId], body: object({ active: { type: 'boolean' } }) }) },
      [scope + '/invitations']: { post: operation('Create or replace a role invitation', { write: true, status: 201,
        parameters: [institution], body: object({ email: credentials.email, role: text(roles.filter((role) => role !== 'ADMIN')) }) }) },
      [scope + '/audit']: { get: operation('List the 100 most recent institution audit events', { parameters: [institution] }) },
      [scope + '/reports/export']: { post: operation('Export up to 5,000 role-visible records as CSV', {
        write: true, parameters: [institution], response: str, mediaType: 'text/csv',
        body: object({ kind: text(Object.keys(modules)), q: str, status: str }, ['kind']),
      }) },
      [scope + '/student-registrations']: { get: operation('List registration requests as an institution administrator', {
        parameters: [institution, page, parameter('status', text(registrationStatuses), 'query')],
      }) },
      [scope + '/student-registrations/students']: { get: operation('Find unlinked student profiles for registration review', {
        parameters: [institution, query],
      }) },
      [scope + '/student-registrations/{id}/review']: { post: operation('Approve, decline or renew a student registration invitation', {
        write: true, parameters: [institution, recordId], body: { oneOf: [
          object({ action: { const: 'decline' } }), object({ action: { const: 'reissue' } }),
          object({ action: { const: 'approve' }, profile: { oneOf: [
            object({ kind: { const: 'existing' }, studentId: id }),
            object({ kind: { const: 'new' }, studentNumber: { ...str, maxLength: 254 } }, ['kind']),
          ] } }),
        ] },
      }) },
      [scope + '/student-portal']: { get: operation('Get the signed-in student’s timetable, published grades, attendance and announcements', { parameters: [institution] }) },
      [scope + '/dashboard']: { get: operation('Get role-filtered metrics, attendance and activity', { parameters: [institution] }) },
      [records]: {
        get: operation('Search or list visible records', { parameters: [institution, kind, query, page, parameter('status', str, 'query')],
          response: object({ items: list(readRecord), page: version, pageSize: version, total: { type: 'integer' }, statuses: list(str) }) }),
        post: operation('Create a record', { write: true, parameters: [institution, kind], body: record, status: 201, response: object({ item: readRecord }) }),
      },
      [records + '/{id}']: {
        get: operation('Read a visible record', { parameters: [institution, kind, recordId], response: object({ item: readRecord }) }),
        patch: operation('Update a record using its current version', { write: true, parameters: [institution, kind, recordId],
          body: { ...record, properties: { ...record.properties, version }, required: [...record.required, 'version'] }, response: object({ item: readRecord }) }),
        delete: operation('Delete an eligible record', { write: true, parameters: [institution, kind, recordId, parameter('version', version, 'query', true)], status: 204 }),
      },
      [scope + '/admissions/{id}/enrol']: { post: operation('Enrol an accepted applicant', { write: true, status: 201,
        parameters: [institution, recordId], body: object({ classId: id, termId: id, studentNumber: { ...str, maxLength: 254, description: 'Omit or leave blank to generate a student number.' }, startDate: date }, ['classId', 'termId', 'startDate']) }) },
      [scope + '/report-cards/{id}/results']: { get: operation('Get published marks for the report card’s student, term and class', { parameters: [institution, recordId] }) },
      '/v1/platform/institutions': { get: operation('List platform institution metadata', { parameters: [page, query] }) },
      '/v1/platform/institutions/{tenantId}/subscription': { patch: operation('Set plan, status, billing interval and renewal date', {
        write: true, parameters: [institution], body: sub,
      }) },
    },
  };
}
