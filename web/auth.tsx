import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, BookOpen, Building2, Check, GraduationCap, ShieldCheck } from 'lucide-react';
import { institutionTypes } from '../shared/catalog.js';
import { api } from './api.js';
import { Brand, ErrorMessage, Field, getError } from './ui.js';

export function Auth({ onSuccess, invite }: { onSuccess: () => void; invite: string | null }) {
  const [mode, setMode] = useState<'login' | 'register' | 'platform'>(location.hash === '#platform-login' ? 'platform' : 'login');
  const [institution, setInstitution] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error>();
  const register = !invite && mode === 'register';
  const platform = !invite && mode === 'platform';
  const title = invite ? 'Accept your invitation' : register ? 'Create your workspace' : platform ? 'Platform administration' : 'Welcome back';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(undefined);
    setBusy(true);
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const [tenantId, token] = invite?.split('.') ?? [];
      if (invite) await api('/auth/accept-invite', { method: 'POST', body: { ...fields, tenantId, token } });
      else await api(register ? '/auth/register' : '/auth/login', { method: 'POST', body: { ...fields, slug: platform ? '' : slug } });
      location.hash = '#overview';
      onSuccess();
    } catch (failure) { setError(getError(failure)); }
    finally { setBusy(false); }
  }
  function change(next: typeof mode) {
    setMode(next);
    setError(undefined);
    location.hash = next === 'platform' ? '#platform-login' : '';
  }
  function setInstitutionName(value: string) {
    setInstitution(value);
    if (!slugEdited) setSlug(value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48).replace(/-$/g, ''));
  }
  return <main className="auth">
    <section className="auth-panel">
      <div className="auth-brand"><Brand/></div>
      <div className="auth-content">
        <h1>{title}</h1>
        <p>{invite ? 'Enter your name and password to join your institution.' : register ? 'Start a 14-day Professional trial for your school, college or university.' :
          platform ? 'Sign in with your authorised platform account.' : 'Sign in to your institution’s ELI EdTech workspace.'}</p>
        <form className="stack" onSubmit={submit} key={title}>
          {error && <ErrorMessage error={error}/>}
          {register && <>
            <Field label="Institution name"><input name="institution" value={institution} onChange={(event) => setInstitutionName(event.target.value)} required maxLength={120} autoComplete="organization"/></Field>
            <Field label="Institution type"><select name="type">{institutionTypes.map((type) => <option key={type}>{type}</option>)}</select></Field>
          </>}
          {!invite && !platform && <Field label="Workspace ID"><input value={slug} onChange={(event) => { setSlugEdited(true); setSlug(event.target.value.toLowerCase()); }} placeholder="e.g. lusaka-academy" required minLength={3} maxLength={48} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" autoCapitalize="none"/></Field>}
          {(register || invite) && <Field label="Full name"><input name="name" autoComplete="name" required maxLength={120}/></Field>}
          {!invite && <Field label="Email address"><input type="email" name="email" autoComplete="username" placeholder="name@institution.edu" required maxLength={254}/></Field>}
          <Field label="Password"><input type="password" name="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register || invite ? 12 : 1} maxLength={128} placeholder={register || invite ? 'At least 12 characters' : 'Enter your password'}/></Field>
          <button className="button primary auth-submit" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create workspace' : invite ? 'Join workspace' : 'Sign in'}<ArrowRight size={17}/></button>
        </form>
        {!invite && <div className="auth-links">
          {register || platform ? <button className="text-button" onClick={() => change('login')}>Back to workspace sign-in</button> :
            <><span>New institution? <button className="text-button" onClick={() => change('register')}>Create a workspace</button></span>
              <button className="muted-link" onClick={() => change('platform')}>Platform sign-in</button></>}
        </div>}
      </div>
      <div className="auth-footer">ELI EdTech <span>·</span> Built for education</div>
    </section>
    <aside className="auth-art" aria-label="About ELI EdTech">
      <div className="art-grid" aria-hidden="true"/>
      <div className="art-icons" aria-hidden="true"><span><Building2/></span><span><GraduationCap/></span><span><BookOpen/></span></div>
      <div className="art-copy"><span className="art-label"><ShieldCheck size={16}/> Institution workspace</span>
        <h2>One workspace for your institution.</h2>
        <p>Manage people, academics, finance and learning from a single place.</p>
        <ul><li><Check size={16}/> Separate workspaces for every institution</li><li><Check size={16}/> Access tailored to each role</li></ul>
      </div>
    </aside>
  </main>;
}
