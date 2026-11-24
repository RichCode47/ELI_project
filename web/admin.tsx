import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Building2, Check, Copy, Search, UserPlus } from 'lucide-react';
import { currencies, formatState, plans, roleNames, roles } from '../shared/catalog.js';
import type { Role } from '../shared/catalog.js';
import { money } from '../shared/money.js';
import { api, dateLabel, scope, useLoad } from './api.js';
import type { Institution, Subscription, Tenant } from './api.js';
import { Badge, Dialog, Empty, ErrorMessage, Field, getError, Loading } from './ui.js';

export function Settings({ tenant, refresh }: { tenant: Tenant; refresh: () => void }) {
  const { institution } = tenant;
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<Error>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(undefined); setSaved(false);
    const form = new FormData(event.currentTarget);
    try {
      await api(scope(tenant), { method: 'PATCH', body: { ...Object.fromEntries(form), whiteLabel: form.has('whiteLabel') } });
      setSaved(true); refresh();
    }
    catch (why) { setError(getError(why)); }
    finally { setBusy(false); }
  }
  return <><header className="page-title"><div><h1>Institution settings</h1><p>Manage identity, locale and branding for your workspace.</p></div></header>
    <form className="panel settings-panel stack" onSubmit={submit}>
      <div><h2>Workspace profile</h2><p>Workspace ID <strong>{institution.slug}</strong></p></div>
      {error && <ErrorMessage error={error}/>}
      {saved && <p className="success-message" role="status"><Check size={17}/> Settings saved</p>}
      <div className="form-grid">
        <Field label="Institution name"><input name="name" required maxLength={120} defaultValue={institution.name}/></Field>
        <Field label="Time zone"><input name="timeZone" defaultValue={institution.timeZone} required maxLength={70}/></Field>
        <Field label="Default currency"><select name="currency" defaultValue={institution.currency}>{currencies.map((code) => <option key={code}>{code}</option>)}</select></Field>
        <Field label="Brand colour"><input name="brand" type="color" defaultValue={institution.brand}/></Field>
      </div>
      {tenant.subscription.plan === 'ENTERPRISE' && <label className="checkbox"><input type="checkbox" name="whiteLabel" defaultChecked={institution.whiteLabel}/> Show institution branding in the workspace header</label>}
      <div><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button></div>
    </form></>;
}
export function SubscriptionPage({ value, tenant }: { value: Subscription; tenant: Tenant }) {
  const status = tenant.operational ? value.status : value.status === 'SUSPENDED' ? 'SUSPENDED' : 'EXPIRED';
  return <><header className="page-title"><div><h1>Subscription</h1><p>View the workspace’s plan and billing period.</p></div></header>
    <section className="panel settings-panel stack">
      <div className="panel-head no-padding"><div><h2>{formatState(value.plan)} plan</h2><p>{formatState(value.interval)} billing</p></div><Badge status={status}/></div>
      <dl className="detail-grid"><div><dt>Current period ends</dt><dd>{dateLabel(value.endsAt, tenant.institution.timeZone)}</dd></div>
        <div><dt>Onboarding fee</dt><dd>{money(value.onboardingFeeMinor, value.currency)}</dd></div></dl>
      <p>Contact your ELI EdTech platform administrator to renew or change plans.</p>
    </section></>;
}

type Member = { id: string; role: Role; active: boolean; user: { name: string } };
function Invite({ tenant, close }: { tenant: Tenant; close: () => void }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<Error>();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(undefined);
    try { setUrl((await api<{ url: string }>(scope(tenant) + '/invitations', { method: 'POST', body: Object.fromEntries(new FormData(event.currentTarget)) })).url); }
    catch (why) { setError(getError(why)); }
    finally { setBusy(false); }
  }
  return <Dialog title="Invite a member" onClose={close}><div className="dialog-body stack">
    {error && <ErrorMessage error={error}/>}
    {url ? <>
      <p>Share this single-use link privately with the intended recipient. It expires after three days.</p>
      <Field label="Invitation link"><input readOnly value={url} onFocus={(event) => event.target.select()}/></Field>
      <button className="button outline" onClick={() => void navigator.clipboard.writeText(url).then(() => setCopied(true), (why) => setError(getError(why)))}><Copy size={16}/>{copied ? 'Copied' : 'Copy link'}</button>
    </> : <form className="stack" onSubmit={submit}>
      <Field label="Email address"><input name="email" type="email" required maxLength={254}/></Field>
      <Field label="Role"><select name="role">{roles.filter((role) => role !== 'ADMIN').map((role) => <option key={role} value={role}>{roleNames[role]}</option>)}</select></Field>
      <div className="dialog-actions"><button className="button primary" disabled={busy}>{busy ? 'Creating…' : 'Create invitation'}</button></div>
    </form>}
  </div></Dialog>;
}
export function Members({ tenant }: { tenant: Tenant }) {
  const [revision, reload] = useState(0);
  const [showInvite, setShowInvite] = useState(false);
  const [failure, setFailure] = useState<Error>();
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const { data, error } = useLoad<{ items: Member[] }>(scope(tenant) + '/members?q=' + encodeURIComponent(search), revision);
  async function toggle(member: Member) {
    setBusy(true); setFailure(undefined);
    try { await api(scope(tenant) + '/members/' + member.id, { method: 'PATCH', body: { active: !member.active } }); reload((n) => n + 1); }
    catch (why) { setFailure(getError(why)); }
    finally { setBusy(false); }
  }
  return <><header className="page-title"><div><h1>Members</h1><p>Invite staff, students and guardians and manage workspace access.</p></div>
    {tenant.operational && <button className="button primary" onClick={() => setShowInvite(true)}><UserPlus size={17}/> Invite member</button>}</header>
    {failure && <ErrorMessage error={failure}/>}
    <section className="panel record-panel">
      <form className="filter-bar" onSubmit={(event) => { event.preventDefault(); setSearch(q.trim()); }}>
        <div className="search-field"><Search size={17}/><input aria-label="Search members" placeholder="Search by name" maxLength={100} value={q} onChange={(event) => setQ(event.target.value)}/></div>
        <button className="button outline">Search</button></form>
      {error ? <ErrorMessage error={error}/> : !data ? <Loading/> : !data.items.length ? <Empty title="No matching members"/> :
        <div className="table-scroll"><table className="table"><thead><tr><th>Name</th><th>Role</th><th>Access</th><th>Action</th></tr></thead>
          <tbody>{data.items.map((item) => <tr key={item.id}><td>{item.user.name}</td><td>{roleNames[item.role]}</td>
            <td><Badge status={item.active ? 'ACTIVE' : 'SUSPENDED'}/></td>
            <td>{item.role === 'ADMIN' ? '—' : <button className="button outline" disabled={busy} onClick={() => void toggle(item)}>{item.active ? 'Disable' : 'Enable'}</button>}</td></tr>)}</tbody></table></div>}
    </section>{showInvite && <Invite tenant={tenant} close={() => setShowInvite(false)}/>}</>;
}

export function Audit({ tenant }: { tenant: Tenant }) {
  const { data, error } = useLoad<{ items: { id: string; action: string; kind?: string; targetId?: string; actorId?: string; createdAt: string }[] }>(scope(tenant) + '/audit');
  return <><header className="page-title"><div><h1>Audit log</h1><p>The 100 most recent recorded changes in this workspace.</p></div></header>
    <section className="panel record-panel">{error ? <ErrorMessage error={error}/> : !data ? <Loading/> : !data.items.length ? <Empty title="No events"/> :
      <div className="table-scroll"><table className="table"><thead><tr><th>Event</th><th>Module</th><th>Actor ID</th><th>Time</th></tr></thead>
        <tbody>{data.items.map((event) => <tr key={event.id}><td>{event.action.replaceAll('.', ' ').replaceAll('_', ' ')}</td><td>{event.kind ?? '—'}</td>
          <td><code>{event.actorId ?? 'System'}</code></td><td>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: tenant.institution.timeZone }).format(new Date(event.createdAt))}</td></tr>)}</tbody></table></div>}
    </section></>;
}

type PlatformInstitution = Institution & { subscription: Subscription; createdAt: string };
function PlanEditor({ item, onClose, onSave }: { item: PlatformInstitution; onClose: () => void; onSave: () => void }) {
  const [error, setError] = useState<Error>();
  const [busy, setBusy] = useState(false);
  const sub = item.subscription;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(undefined);
    const form = new FormData(event.currentTarget);
    const body = { ...Object.fromEntries(form), onboardingFeeMinor: Number(form.get('onboardingFeeMinor')), endsAt: form.get('endsAt') + 'T23:59:59Z' };
    try { await api('/platform/institutions/' + item.id + '/subscription', { method: 'PATCH', body }); onSave(); }
    catch (why) { setError(getError(why)); }
    finally { setBusy(false); }
  }
  return <Dialog title={'Subscription · ' + item.name} onClose={onClose}><form className="dialog-body stack" onSubmit={submit}>
    {error && <ErrorMessage error={error}/>}
    <div className="form-grid">
      <Field label="Plan"><select name="plan" defaultValue={sub.plan}>{plans.map((value) => <option key={value} value={value}>{formatState(value)}</option>)}</select></Field>
      <Field label="Billing interval"><select name="interval" defaultValue={sub.interval}><option value="MONTHLY">Monthly</option><option value="ANNUAL">Annual</option></select></Field>
      <Field label="Subscription status"><select name="status" defaultValue={sub.status}>{['TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED'].map((value) => <option key={value} value={value}>{formatState(value)}</option>)}</select></Field>
      <Field label="Period end (UTC)"><input type="date" name="endsAt" defaultValue={sub.endsAt.slice(0, 10)} required/></Field>
      <Field label="Onboarding fee in minor units"><input type="number" name="onboardingFeeMinor" step={1} min={0} max={2000000000} defaultValue={sub.onboardingFeeMinor} required/></Field>
      <Field label="Billing currency"><select name="currency" defaultValue={sub.currency}>{currencies.map((value) => <option key={value}>{value}</option>)}</select></Field>
    </div>
    <div className="dialog-actions"><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save subscription'}</button></div>
  </form></Dialog>;
}
export function Platform() {
  const [revision, reload] = useState(0);
  const [editing, setEditing] = useState<PlatformInstitution>();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const result = useLoad<{ items: PlatformInstitution[]; total: number }>('/platform/institutions?page=' + page + '&q=' + encodeURIComponent(search), revision);
  const { data, error } = result;
  return <><header className="page-title"><div><h1>Institutions</h1><p>Manage institution subscriptions across ELI EdTech.</p></div></header>
    <section className="panel record-panel">
      <form className="filter-bar" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(q.trim()); }}>
        <div className="search-field"><Search size={17}/><input aria-label="Search institutions" placeholder="Search by name" maxLength={100} value={q} onChange={(event) => setQ(event.target.value)}/></div>
        <button className="button outline">Search</button></form>
      {error ? <ErrorMessage error={error}/> : !data ? <Loading/> : !data.items.length ? <Empty title="No matching institutions"/> :
        <><div className="table-scroll"><table className="table"><thead><tr><th>Institution</th><th>Type</th><th>Plan</th><th>Status</th><th>Period ends</th><th>Action</th></tr></thead>
          <tbody>{data.items.map((item) => <tr key={item.id}><td><span className="table-title"><span className="metric-icon color-1"><Building2 size={17}/></span>{item.name}</span></td>
            <td>{item.type}</td><td>{formatState(item.subscription.plan)}</td>
            <td><Badge status={new Date(item.subscription.endsAt) <= new Date() && item.subscription.status !== 'SUSPENDED' ? 'EXPIRED' : item.subscription.status}/></td>
            <td>{dateLabel(item.subscription.endsAt, 'UTC')}</td><td><button className="button outline" onClick={() => setEditing(item)}>Manage</button></td></tr>)}</tbody></table></div>
          <div className="pagination"><span>{data.total} institutions</span><div>
            <button className="button outline" disabled={page === 1} onClick={() => setPage((n) => n - 1)}><ArrowLeft size={15}/> Previous</button>
            <button className="button outline" disabled={page * 50 >= data.total} onClick={() => setPage((n) => n + 1)}>Next <ArrowRight size={15}/></button>
          </div></div></>}
    </section>
    {editing && <PlanEditor item={editing} onClose={() => setEditing(undefined)} onSave={() => { setEditing(undefined); reload((n) => n + 1); }}/>}</>;
}
