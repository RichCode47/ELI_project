import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, ArrowRight, ChevronRight, Download, Plus, Printer, Search, Trash2 } from 'lucide-react';
import { formatState, modules, reportingRoles } from '../shared/catalog.js';
import type { Field as FieldSpec } from '../shared/catalog.js';
import { money } from '../shared/money.js';
import { api, dateLabel, scope, useLoad } from './api.js';
import type { Entry, Paginated, Tenant } from './api.js';
import { iconFor } from './navigation.js';
import { Badge, Dialog, Empty, ErrorMessage, Field, getError, Loading } from './ui.js';

type Choice = { id: string; title: string };
export function Relationship({ label, name, path, selected, required, members }: {
  label: string; name: string; path: string; selected?: Choice; required?: boolean; members?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [choice, setChoice] = useState(selected?.id ?? '');
  const [remembered, setRemembered] = useState(selected);
  const { data, error } = useLoad<{ items: (Choice & { user?: { name: string } })[] }>(path + (path.includes('?') ? '&' : '?') + 'q=' + encodeURIComponent(query));
  const choices = (data?.items ?? []).map((item) => ({ id: item.id, title: members ? item.user?.name ?? '' : item.title }));
  if (remembered && !choices.some((item) => item.id === remembered.id)) choices.unshift(remembered);
  return <div className="relation">
    <Field label={label}><select name={name} value={choice} required={required} onChange={(event) => {
      setChoice(event.target.value); setRemembered(choices.find((item) => item.id === event.target.value));
    }}><option value="">Select {label.toLowerCase()}</option>{choices.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
    <div className="relation-search"><input aria-label={'Search ' + label.toLowerCase() + ' choices'} maxLength={100} placeholder="Find by name" value={search}
      onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); setQuery(search); } }}/>
      <button type="button" className="button subtle" onClick={() => setQuery(search)}><Search size={15}/> Find</button></div>
    {error && <ErrorMessage error={error}/>}
  </div>;
}

function StudentNumberField({ name, existing }: { name: string; existing?: string | number }) {
  const hintId = useId();
  const generating = existing === undefined;
  return <div>
    <Field label="Student number"><input name={name} defaultValue={existing} maxLength={254}
      required={!generating} aria-describedby={generating ? hintId : undefined}/></Field>
    {generating && <small id={hintId} className="mt-1 block">Leave blank to generate a number, or enter your school’s existing number.</small>}
  </div>;
}

function RecordField({ spec, value }: { spec: FieldSpec; value?: string | number }) {
  const defaultValue = value === undefined ? '' : String(value);
  const name = 'data.' + spec.name;
  return <Field label={spec.label}>{spec.type === 'select'
    ? <select name={name} defaultValue={defaultValue} required={spec.required}><option value="">Select an option</option>{spec.options?.map((option) => <option key={option}>{option}</option>)}</select>
    : spec.type === 'textarea' ? <textarea name={name} defaultValue={defaultValue} required={spec.required} maxLength={10000} rows={4}/>
      : <input name={name} type={spec.type === 'decimal' ? 'text' : spec.type} inputMode={spec.type === 'decimal' ? 'decimal' : undefined} defaultValue={defaultValue} required={spec.required} maxLength={254}/>}</Field>;
}

function Editor({ kind, tenant, previous, statuses, onClose, onSaved }: {
  kind: string; tenant: Tenant; previous?: Entry; statuses: string[]; onClose: () => void; onSaved: () => void;
}) {
  const module = modules[kind];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error>();
  const choices = tenant.role === 'TEACHER' && kind === 'grades' ? ['DRAFT'] : statuses;
  const base = scope(tenant);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(undefined);
    const form = new FormData(event.currentTarget);
    const data = Object.fromEntries(module.fields.map((item) => [item.name, form.get('data.' + item.name)]).filter(([, value]) => !!value));
    const links = Object.fromEntries(module.links.map((item) => [item.name, form.get('link.' + item.name)]).filter(([, value]) => !!value));
    const body = { title: form.get('title'), status: form.get('status'), memberId: form.get('memberId') || null, data, links,
      ...(previous ? { version: previous.version } : {}) };
    try {
      await api(base + '/records/' + kind + (previous ? '/' + previous.id : ''), { method: previous ? 'PATCH' : 'POST', body });
      onSaved();
    } catch (failure) { setError(getError(failure)); }
    finally { setBusy(false); }
  }
  return <Dialog title={(previous ? 'Edit ' : 'Add ') + module.singular} onClose={onClose} wide>
    <form className="dialog-body stack" onSubmit={save}>
      {error && <ErrorMessage error={error}/>}
      <div className="form-grid">
        <Field label={['students', 'staff', 'admissions'].includes(kind) ? 'Full name' : 'Title'}><input name="title" required maxLength={160} defaultValue={previous?.title} autoFocus/></Field>
        <Field label="Status"><select name="status" defaultValue={previous?.status ?? choices[0]}>{choices.map((option) => <option value={option} key={option}>{formatState(option)}</option>)}</select></Field>
        {module.fields.map((spec) => kind === 'students' && spec.name === 'number'
          ? <StudentNumberField key={spec.name} name="data.number" existing={previous?.data.number}/>
          : <RecordField key={spec.name} spec={spec} value={previous?.data[spec.name]}/>)}
        {module.links.map((link) => <Relationship key={link.name} label={link.label} name={'link.' + link.name} path={base + '/records/' + link.kind}
          selected={previous?.links[link.name]} required={link.required}/>)}
        {module.memberRole && <Relationship label={kind === 'classes' ? 'Class lead' : 'Linked account'} name="memberId"
          path={base + '/members?module=' + kind} selected={previous?.memberId ? { id: previous.memberId, title: previous.memberName ?? 'Linked account' } : undefined}
          required={['notifications', 'guardians'].includes(kind)} members/>}
      </div>
      <div className="dialog-actions"><button className="button outline" type="button" onClick={onClose}>Cancel</button>
        <button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save record'}</button></div>
    </form>
  </Dialog>;
}

function Enrolment({ tenant, id, onClose, onSaved }: { tenant: Tenant; id: string; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error>();
  const base = scope(tenant);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(undefined);
    try {
      await api(base + '/admissions/' + id + '/enrol', { method: 'POST', body: Object.fromEntries(new FormData(event.currentTarget)) });
      onSaved();
    } catch (failure) { setError(getError(failure)); }
    finally { setBusy(false); }
  }
  return <Dialog title="Enrol accepted applicant" onClose={onClose}><form className="dialog-body stack" onSubmit={submit}>
    {error && <ErrorMessage error={error}/>}
    <Relationship label="Class" name="classId" path={base + '/records/classes'} required/>
    <Relationship label="Term" name="termId" path={base + '/records/terms'} required/>
    <StudentNumberField name="studentNumber"/>
    <Field label="Enrolment date"><input name="startDate" type="date" required/></Field>
    <div className="dialog-actions"><button type="button" className="button outline" onClick={onClose}>Cancel</button>
      <button className="button primary" disabled={busy}>{busy ? 'Enrolling…' : 'Create enrolment'}</button></div>
  </form></Dialog>;
}

function Detail({ tenant, kind, id, onClose, onEdit, onEnrol, onDeleted, writable }: {
  tenant: Tenant; kind: string; id: string; onClose: () => void; onEdit: (item: Entry) => void; onEnrol: () => void; onDeleted: () => void; writable: boolean;
}) {
  const path = scope(tenant) + '/records/' + kind + '/' + id;
  const { data, error } = useLoad<{ item: Entry }>(path);
  const grades = useLoad<{ grades: { assessment: string; marks: string }[] }>(kind === 'report-cards' ? scope(tenant) + '/report-cards/' + id + '/results' : null);
  const [failure, setFailure] = useState<Error>();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const item = data?.item;
  const module = modules[kind];
  const cannotEdit = ['receipts', 'submissions'].includes(kind) || tenant.role === 'STUDENT' ||
    (kind === 'invoices' && !['DRAFT', 'ISSUED'].includes(item?.status ?? '')) ||
    (kind === 'grades' && tenant.role === 'TEACHER' && item?.status !== 'DRAFT') || (kind === 'loans' && item?.status === 'RETURNED');
  const canDelete = writable && !['TEACHER', 'STUDENT'].includes(tenant.role) && !['receipts', 'loans', 'submissions'].includes(kind) &&
    !(kind === 'invoices' && item?.status !== 'DRAFT') && !(kind === 'admissions' && item?.status === 'ENROLLED') &&
    !(['grades', 'report-cards', 'certificates', 'transcripts'].includes(kind) && item?.status !== 'DRAFT');
  const printable = ['invoices', 'receipts', 'report-cards', 'certificates', 'transcripts'].includes(kind);
  async function remove(entry: Entry) {
    setBusy(true); setFailure(undefined);
    try { await api(path + '?version=' + entry.version, { method: 'DELETE' }); onDeleted(); }
    catch (why) { setFailure(getError(why)); }
    finally { setBusy(false); }
  }
  const currency = String(item?.data.currency ?? tenant.institution.currency);
  return <Dialog title={item?.title ?? module.label} onClose={onClose} wide>
    <div className="dialog-body detail">
      {error ? <ErrorMessage error={error}/> : !item ? <Loading/> : <>
        <div className="print-brand">{tenant.institution.name} · {module.label}</div>
        <Badge status={item.status}/>
        <dl className="detail-grid">
          {module.fields.map((field) => <div key={field.name}><dt>{field.label}</dt><dd>{field.name === 'amount' && typeof item.data.amountMinor === 'number'
            ? money(item.data.amountMinor, currency)
            : field.type === 'date' && item.data[field.name] ? dateLabel(String(item.data[field.name]))
              : field.type === 'url' && /^https:\/\//i.test(String(item.data[field.name])) ? <a href={String(item.data[field.name])} target="_blank" rel="noreferrer">Open resource</a>
                : item.data[field.name] ?? '—'}</dd></div>)}
          {module.links.map((link) => <div key={link.name}><dt>{link.label}</dt><dd>{item.links[link.name]?.title ?? '—'}</dd></div>)}
          {item.memberName && <div><dt>Linked account</dt><dd>{item.memberName}</dd></div>}
          {kind === 'invoices' && <div><dt>Outstanding</dt><dd>{money(item.status === 'VOID' ? 0 : Number(item.data.amountMinor) - Number(item.data.paidMinor), currency)}</dd></div>}
        </dl>
        {kind === 'report-cards' && <div className="result-list"><h3>Published grades</h3>
          {grades.error ? <ErrorMessage error={grades.error}/> : !grades.data ? <Loading/> : grades.data.grades.length ?
            grades.data.grades.map((grade, index) => <p key={index}><span>{grade.assessment}</span><strong>{grade.marks}</strong></p>) : <p>No marks published yet.</p>}</div>}
        {failure && <ErrorMessage error={failure}/>}
        <div className="dialog-actions">
          {confirm && <span className="delete-confirm">Delete this record?</span>}
          {canDelete && <button className="button danger" onClick={() => confirm ? void remove(item) : setConfirm(true)} disabled={busy}><Trash2 size={16}/>{confirm ? 'Confirm deletion' : 'Delete'}</button>}
          {printable && <button className="button outline" onClick={() => window.print()}><Printer size={16}/> Print</button>}
          {writable && !cannotEdit && <button className="button outline" onClick={() => onEdit(item)}>Edit</button>}
          {writable && kind === 'admissions' && item.status === 'ACCEPTED' && <button className="button primary" onClick={onEnrol}>Enrol student</button>}
        </div>
      </>}
    </div>
  </Dialog>;
}

export function Records({ tenant, kind, selected, create, navigate }: { tenant: Tenant; kind: string; selected?: string; create?: boolean; navigate: (kind: string, id?: string, create?: boolean) => void }) {
  const [revision, setRevision] = useState(0);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Entry>();
  const [enrolment, setEnrolment] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<Error>();
  const module = modules[kind];
  const Icon = iconFor(kind);
  const writable = module.writers.includes(tenant.role);
  const path = scope(tenant) + '/records/' + kind;
  const params = new URLSearchParams({ q: query, page: String(page), ...(status ? { status } : {}) });
  const { data, error } = useLoad<Paginated>(path + '?' + params, revision);
  const close = () => { setEditing(undefined); setEnrolment(false); navigate(kind); };
  const saved = () => { setRevision((n) => n + 1); setPage(1); close(); };
  async function exportCsv() {
    setExporting(true); setExportError(undefined);
    try {
      const response = await fetch('/api/v1' + scope(tenant) + '/reports/export', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ELI-Request': '1' },
        body: JSON.stringify({ kind, q: query, ...(status ? { status } : {}) }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error?.message ?? 'The report could not be exported.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = kind + '.csv'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (why) { setExportError(getError(why)); }
    finally { setExporting(false); }
  }
  return <div>
    <header className="page-title"><div><h1>{module.label}</h1><p>{module.description}</p></div>
      <div className="page-actions">{reportingRoles.includes(tenant.role) && <button className="button outline" disabled={exporting || !data?.total} onClick={() => void exportCsv()}><Download size={17}/>{exporting ? 'Exporting…' : 'Export CSV'}</button>}
        {writable && <button className="button primary" onClick={() => navigate(kind, undefined, true)}><Plus size={17}/> Add {module.singular}</button>}</div></header>
    {exportError && <ErrorMessage error={exportError}/>}
    <section className="panel record-panel">
      <form className="filter-bar" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(q.trim()); }}>
        <div className="search-field"><Search size={17}/><input aria-label={'Search ' + module.label.toLowerCase()} placeholder="Search by name or title" value={q}
          maxLength={100} onChange={(event) => { setQ(event.target.value); if (!event.target.value) { setQuery(''); setPage(1); } }}/></div>
        <button className="button outline">Search</button>
        <select aria-label="Filter by status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="">All statuses</option>{module.states.map((option) => <option key={option} value={option}>{formatState(option)}</option>)}</select>
      </form>
      {error ? <ErrorMessage error={error} retry={() => setRevision((n) => n + 1)}/> : !data ? <Loading/> : data.items.length ?
        <>
          <div className="table-scroll"><table className="table"><thead><tr><th>Name or title</th>{kind === 'students' && <th>Student number</th>}<th>Status</th><th>Last updated</th><th><span className="sr-only">Open</span></th></tr></thead>
            <tbody>{data.items.map((item) => <tr key={item.id}>
              <td><button className="table-title" onClick={() => navigate(kind, item.id)}><span className="metric-icon color-1"><Icon size={17}/></span>{item.title}</button></td>
              {kind === 'students' && <td>{item.data.number}</td>}
              <td><Badge status={item.status}/></td><td><time dateTime={item.updatedAt}>{dateLabel(item.updatedAt, tenant.institution.timeZone)}</time></td>
              <td><button className="icon-button" aria-label={'Open ' + item.title} onClick={() => navigate(kind, item.id)}><ChevronRight size={17}/></button></td>
            </tr>)}</tbody></table></div>
          <div className="pagination"><span>{data.total} {data.total === 1 ? 'record' : 'records'} · Page {data.page} of {Math.ceil(data.total / data.pageSize)}</span>
            <div><button className="button outline" onClick={() => setPage((n) => n - 1)} disabled={page === 1}><ArrowLeft size={15}/> Previous</button>
              <button className="button outline" onClick={() => setPage((n) => n + 1)} disabled={page * data.pageSize >= data.total}>Next <ArrowRight size={15}/></button></div></div>
        </> : <Empty title={query || status ? 'No matching records' : 'No ' + module.label.toLowerCase() + ' yet'}>
          {query || status ? 'Try another search or status.' : writable ? 'Use the add button to create the first record.' : 'Records will appear when they’re available.'}</Empty>}
    </section>
    {create && writable && <Editor kind={kind} tenant={tenant} statuses={data?.statuses ?? (kind === 'invoices' ? ['DRAFT', 'ISSUED'] : kind === 'admissions' ? ['PENDING', 'ACCEPTED', 'DECLINED'] : kind === 'loans' ? ['OPEN'] : [...module.states])} onClose={close} onSaved={saved}/>}
    {selected && !editing && !enrolment && <Detail tenant={tenant} kind={kind} id={selected} onClose={close} onEdit={setEditing} onEnrol={() => setEnrolment(true)} onDeleted={saved} writable={writable}/>}
    {editing && <Editor kind={kind} tenant={tenant} previous={editing} statuses={editing.statuses} onClose={() => setEditing(undefined)} onSaved={saved}/>}
    {enrolment && selected && <Enrolment tenant={tenant} id={selected} onClose={() => setEnrolment(false)} onSaved={saved}/>}
  </div>;
}
