import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Copy } from 'lucide-react';
import { formatState } from '../shared/catalog.js';
import { registrationStatuses } from '../shared/student-registration.js';
import type { RegistrationReview, RegistrationStatus, StudentRegistrationRequest } from '../shared/student-registration.js';
import { api, dateLabel, scope, useLoad } from './api.js';
import type { Tenant } from './api.js';
import { AuthLayout } from './auth.js';
import { Relationship, StudentNumberField } from './records.js';
import { Badge, Dialog, Empty, ErrorMessage, Field, getError, Loading } from './ui.js';

export function StudentRegistrationForm() {
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await api('/auth/student-registration', { method: 'POST', body: Object.fromEntries(new FormData(event.currentTarget)) });
      setSubmitted(true);
    } catch (failure) { setError(getError(failure)); }
    finally { setBusy(false); }
  }

  return <AuthLayout studentPortal>
    {submitted ? <div role="status">
      <CheckCircle2 size={32}/>
      <h1>Registration request submitted</h1>
      <p>If your school approves the request, it will share an invitation link so you can set up your student account.</p>
    </div> : <>
      <h1>Student registration</h1>
      <p>Request a Student Portal account from your school.</p>
      <form className="stack" onSubmit={submit}>
        {error && <ErrorMessage error={error}/>}
        <Field label="Workspace ID"><input name="slug" required minLength={3} maxLength={48}
          placeholder="e.g. lusaka-academy" autoCapitalize="none" spellCheck={false}/></Field>
        <Field label="Full name"><input name="name" autoComplete="name" required minLength={2} maxLength={120}/></Field>
        <Field label="Email address"><input name="email" type="email" autoComplete="email" required maxLength={254}/></Field>
        <Field label="Student number (optional)"><input name="studentNumber" maxLength={254} aria-describedby="registration-student-number"/></Field>
        <small id="registration-student-number">Enter the number your school gave you, if you have one.</small>
        <button className="button primary auth-submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit registration request'}<ArrowRight size={17}/></button>
      </form>
    </>}
    <div className="auth-links"><a className="text-button" href="/student">Back to Student Portal sign-in</a></div>
  </AuthLayout>;
}

type InvitationResult = { status: 'INVITED'; url: string; expiresAt: string } | { status: 'DECLINED' };

function RegistrationDecision({ tenant, item, onClose, onChange }: {
  tenant: Tenant; item: StudentRegistrationRequest; onClose: () => void; onChange: () => void;
}) {
  const [profileKind, setProfileKind] = useState<'existing' | 'new'>('existing');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error>();
  const [invitation, setInvitation] = useState<Extract<InvitationResult, { status: 'INVITED' }>>();
  const [copied, setCopied] = useState(false);
  const base = scope(tenant) + '/student-registrations';
  const reissue = item.status === 'INVITED';
  async function decide(body: RegistrationReview) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await api<InvitationResult>(base + '/' + item.id + '/review', { method: 'POST', body });
      onChange();
      if (result.status === 'INVITED') setInvitation(result);
      else onClose();
    } catch (failure) { setError(getError(failure)); }
    finally { setBusy(false); }
  }
  function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    if (reissue) return void decide({ action: 'reissue' });
    void decide({ action: 'approve', profile: profileKind === 'existing'
      ? { kind: 'existing', studentId: String(fields.get('studentId') ?? '') }
      : { kind: 'new', studentNumber: String(fields.get('studentNumber') ?? '') } });
  }
  async function copy() {
    if (!invitation) return;
    try { await navigator.clipboard.writeText(invitation.url); setCopied(true); }
    catch (failure) { setError(getError(failure)); }
  }

  return <Dialog title={invitation ? 'Student invitation ready' : 'Review student registration'} onClose={onClose}>
    <div className="dialog-body stack">
      {error && <ErrorMessage error={error}/>}
      {invitation ? <>
        <p>Share this single-use invitation privately with {item.email}. It expires on {dateLabel(invitation.expiresAt, tenant.institution.timeZone)}.</p>
        <Field label="Student invitation link"><input readOnly value={invitation.url} onFocus={(event) => event.target.select()}/></Field>
        <div className="dialog-actions">
          <button className="button outline" onClick={onClose}>Done</button>
          <button className="button primary" onClick={() => void copy()}><Copy size={16}/>{copied ? 'Copied' : 'Copy invitation link'}</button>
        </div>
      </> : <>
        <dl className="detail-grid">
          <div><dt>Full name</dt><dd>{item.name}</dd></div>
          <div><dt>Email address</dt><dd>{item.email}</dd></div>
          <div><dt>Student number submitted</dt><dd>{item.studentNumber || 'Not provided'}</dd></div>
        </dl>
        <p>{reissue ? 'A new invitation will replace the previous link.' : 'Verify the student’s identity and email before approving the request.'}</p>
        <form className="stack" onSubmit={approve}>
          {!reissue && <>
            <Field label="Student profile"><select value={profileKind} onChange={(event) => setProfileKind(event.target.value as typeof profileKind)}>
              <option value="existing">Link an existing profile</option>
              <option value="new">Create a new student profile</option>
            </select></Field>
            {profileKind === 'existing'
              ? <Relationship label="Existing student" name="studentId" path={base + '/students'} searchPlaceholder="Name or exact student number" required/>
              : <StudentNumberField name="studentNumber"/>}
          </>}
          <div className="dialog-actions">
            {item.status !== 'DECLINED' && <button className="button outline" type="button" disabled={busy}
              onClick={() => void decide({ action: 'decline' })}>Decline request</button>}
            <button className="button primary" disabled={busy}>{busy ? 'Saving…' : reissue ? 'Reissue invitation' : 'Approve and create invitation'}</button>
          </div>
        </form>
      </>}
    </div>
  </Dialog>;
}

export function StudentRegistrations({ tenant }: { tenant: Tenant }) {
  const [status, setStatus] = useState<RegistrationStatus>('PENDING');
  const [page, setPage] = useState(1);
  const [revision, refresh] = useState(0);
  const [selected, setSelected] = useState<StudentRegistrationRequest>();
  const { data, error } = useLoad<{ items: StudentRegistrationRequest[]; hasMore: boolean }>(
    scope(tenant) + '/student-registrations?status=' + status + '&page=' + page, revision,
  );
  return <>
    <header className="page-title"><div><h1>Student registrations</h1><p>Review requests for Student Portal access.</p></div></header>
    <section className="panel record-panel">
      <div className="filter-bar"><select aria-label="Registration status" value={status}
        onChange={(event) => { setStatus(event.target.value as RegistrationStatus); setPage(1); }}>
        {registrationStatuses.map((value) => <option value={value} key={value}>{formatState(value)}</option>)}
      </select></div>
      {error ? <ErrorMessage error={error} retry={() => refresh((value) => value + 1)}/> : !data ? <Loading/> : <>
        {data.items.length ? <div className="table-scroll"><table className="table">
          <thead><tr><th>Student</th><th>Email address</th><th>Submitted number</th><th>Status</th><th>Received</th><th>Action</th></tr></thead>
          <tbody>{data.items.map((item) => <tr key={item.id}>
            <td>{item.name}</td><td>{item.email}</td><td>{item.studentNumber || '—'}</td><td><Badge status={item.status}/></td>
            <td>{dateLabel(item.createdAt, tenant.institution.timeZone)}</td>
            <td>{tenant.operational && item.status !== 'REGISTERED'
              ? <button className="button outline" onClick={() => setSelected(item)}>Review request</button> : '—'}</td>
          </tr>)}</tbody>
        </table></div> : <Empty title="No registration requests"/>}
        {(page > 1 || data.hasMore) && <div className="pagination"><span>Page {page}</span><div>
          <button className="button outline" disabled={page === 1} onClick={() => setPage(page - 1)}><ArrowLeft size={15}/> Previous</button>
          <button className="button outline" disabled={!data.hasMore} onClick={() => setPage(page + 1)}>Next <ArrowRight size={15}/></button>
        </div></div>}
      </>}
    </section>
    {selected && <RegistrationDecision tenant={tenant} item={selected} onClose={() => setSelected(undefined)} onChange={() => refresh((value) => value + 1)}/>}
  </>;
}
