import { Component, StrictMode, useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Bell, ChevronDown, ChevronRight, GraduationCap, LogOut, Menu, Moon, Search, Sun, X } from 'lucide-react';
import { modules, formatState, roleNames } from '../shared/catalog.js';
import { ApiError, api, useLoad } from './api.js';
import type { Profile } from './api.js';
import { Audit, Members, Platform, Settings, SubscriptionPage } from './admin.js';
import { Auth } from './auth.js';
import { Dashboard } from './dashboard.js';
import { iconFor, tenantNav } from './navigation.js';
import { Records } from './records.js';
import { StudentPortal } from './student-portal.js';
import { StudentRegistrationForm, StudentRegistrations } from './student-registration.js';
import { Brand, Dialog, ErrorMessage, Loading, getError } from './ui.js';
import './style.css';

const savedTheme = localStorage.getItem('eli-theme');
document.documentElement.dataset.theme = savedTheme === 'light' || savedTheme === 'dark'
  ? savedTheme : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const studentPortalRoute = /^\/student\/?$/.test(location.pathname);
if (studentPortalRoute) document.title = 'Student portal · ELI EdTech';

class Boundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    return this.state.error ? <main className="app-loading"><Brand/><ErrorMessage error="This page could not load." retry={() => location.reload()}/></main> : this.props.children;
  }
}

function useHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    function sync() { setHash(location.hash); }
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  return hash.slice(1);
}

function Workspace({ profile, route, refresh }: { profile: Profile; route: string; refresh: () => void }) {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  const [menu, setMenu] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState(false);
  const [q, setQ] = useState('');
  const [error, setError] = useState<Error>();
  const [closedGroups, setClosedGroups] = useState<string[]>([]);
  const student = !profile.platform && profile.role === 'STUDENT';
  const nav = profile.platform ? { Platform: [{ id: 'institutions', label: 'Institutions' }] } : tenantNav(profile);
  const pages = Object.values(nav).flat();
  const [section, selected] = route.split('/');
  const page = pages.some(({ id }) => id === section) ? section : profile.platform ? 'institutions' : 'overview';
  const label = pages.find(({ id }) => id === page)?.label ?? 'Overview';
  const whiteLabel = !profile.platform && profile.operational && profile.subscription.plan === 'ENTERPRISE' && profile.institution.whiteLabel;
  const [first = '', last = ''] = profile.user.name.split(/\s+/);
  const initials = (first.charAt(0) + last.charAt(0)).toUpperCase();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('eli-theme', theme);
  }, [theme]);
  function open(kind: string, id?: string, create?: boolean) {
    location.hash = '#' + kind + (create ? '/new' : id ? '/' + id : '');
    setDrawer(false); setSearch(false); setMenu(false);
  }
  async function signOut() {
    try { await api('/auth/logout', { method: 'POST' }); location.hash = ''; refresh(); }
    catch (why) { setError(getError(why)); setMenu(false); }
  }
  function toggleGroup(group: string, open: boolean) {
    setClosedGroups((old) => open ? [...old, group] : old.filter((item) => item !== group));
  }
  let content: ReactNode;
  if (profile.platform) content = <Platform/>;
  else if (page === 'overview') content = student ? <StudentPortal tenant={profile}/> : <Dashboard tenant={profile} open={open}/>;
  else if (page === 'settings') content = <Settings tenant={profile} refresh={refresh}/>;
  else if (page === 'members') content = <Members tenant={profile}/>;
  else if (page === 'student-registrations') content = <StudentRegistrations tenant={profile}/>;
  else if (page === 'subscription') content = <SubscriptionPage tenant={profile} value={profile.subscription}/>;
  else if (page === 'audit') content = <Audit tenant={profile}/>;
  else if (Object.hasOwn(modules, page)) content = <Records key={page} tenant={profile} kind={page} selected={selected === 'new' ? undefined : selected} create={selected === 'new'} navigate={open}/>;
  const canNotify = pages.some(({ id }) => id === 'notifications');
  return <div className="shell" style={!profile.platform ? { '--brand-color': profile.institution.brand } as CSSProperties : undefined}>
    <a className="skip" href="#main" onClick={(event) => { event.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
    {drawer && <button className="drawer-shade" aria-label="Close navigation" onClick={() => setDrawer(false)}/>}
    <aside className={'sidebar' + (drawer ? ' open' : '')}>
      <div className="sidebar-brand"><button className="brand-button" aria-label="Workspace home" onClick={() => open(profile.platform ? 'institutions' : 'overview')}>
        {whiteLabel ? <div className="custom-brand"><Brand compact/><span>{profile.institution.name}</span></div> : <Brand/>}
      </button><button className="icon-button sidebar-close" aria-label="Close navigation" onClick={() => setDrawer(false)}><X size={20}/></button></div>
      {!profile.platform && <div className="workspace-card">
        <div className="workspace-avatar" aria-hidden="true">{profile.institution.name.slice(0, 1).toUpperCase()}</div>
        <div><strong>{profile.institution.name}</strong><span>{student ? 'Student portal' : profile.institution.type + ' workspace'}</span></div>
      </div>}
      <nav aria-label="Main navigation" className="navigation">{Object.entries(nav).map(([group, links]) => {
        const expanded = !closedGroups.includes(group);
        return <div className="nav-group" key={group}><button className="nav-label" aria-expanded={expanded} onClick={() => toggleGroup(group, expanded)}>{group}<ChevronDown size={13}/></button>
          {expanded && links.map((link) => { const Icon = iconFor(link.id); return <a key={link.id} href={'#' + link.id} aria-current={page === link.id ? 'page' : undefined}
            className={'nav-link' + (page === link.id ? ' selected' : '')} onClick={() => setDrawer(false)}><Icon size={17}/><span>{link.label}</span></a>; })}
          {expanded && group === 'Workspace' && !profile.platform && !student && <a className="nav-link" href="/student"><GraduationCap size={17}/><span>Student portal</span></a>}
        </div>;
      })}</nav>
      <div className="sidebar-footer"><span className="online-dot"/>{profile.platform ? 'Platform administration' : student ? 'Student account' : formatState(profile.subscription.plan) + ' plan'}</div>
    </aside>
    <div className="main-shell">
      <header className="topbar">
        <div className="topbar-left"><button className="icon-button drawer-button" aria-expanded={drawer} aria-label="Open navigation" onClick={() => setDrawer(true)}><Menu size={21}/></button>
          <div className="breadcrumbs"><span>{profile.platform ? 'Platform' : student ? 'Student portal' : 'Workspace'}</span><ChevronRight size={14}/><strong>{label}</strong></div></div>
        <div className="topbar-actions">
          <button className="search-trigger" onClick={() => { setQ(''); setSearch(true); }} aria-label="Search navigation"><Search size={17}/><span>Find a module</span></button>
          <button className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</button>
          {canNotify && <button className="icon-button" aria-label="Notifications" onClick={() => open('notifications')}><Bell size={19}/></button>}
          <div className="profile-wrap">
            <button className="profile-button" aria-label="Account menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
              <span className="profile-avatar">{initials}</span><span className="profile-name"><strong>{profile.user.name}</strong><small>{profile.platform ? 'Platform administrator' : roleNames[profile.role]}</small></span><ChevronDown size={14}/>
            </button>
            {menu && <div className="profile-popover"><small>{profile.user.email}</small><button className="button subtle" onClick={() => void signOut()}><LogOut size={17}/> Sign out</button></div>}
          </div>
        </div>
      </header>
      <main id="main" className="main-content" tabIndex={-1}>{error && <ErrorMessage error={error}/>} {content}</main>
    </div>
    {search && <Dialog title="Find a module" onClose={() => setSearch(false)}>
      <div className="dialog-body stack"><div className="search-field"><Search size={17}/><input autoFocus placeholder="Search workspace navigation" aria-label="Search modules" value={q} onChange={(event) => setQ(event.target.value)}/></div>
        <div className="search-results">{pages.filter(({ label }) => label.toLowerCase().includes(q.trim().toLowerCase())).map(({ id, label }) => {
          const Icon = iconFor(id);
          return <button className="quick-item" key={id} onClick={() => open(id)}><Icon size={17}/><strong>{label}</strong><ChevronRight className="quick-arrow" size={16}/></button>;
        })}</div></div></Dialog>}
  </div>;
}

function App() {
  const hash = useHash();
  const studentPortal = studentPortalRoute;
  const [revision, setRevision] = useState(0);
  const [profile, setProfile] = useState<Profile>();
  const { data, error } = useLoad<Profile>('/auth/me', revision);
  const refresh = () => setRevision((value) => value + 1);
  useEffect(() => { if (data) setProfile(data); else if (error instanceof ApiError && [401, 404].includes(error.status)) setProfile(undefined); }, [data, error]);
  useEffect(() => {
    if (data && !data.platform && data.role === 'STUDENT' && !studentPortal && !hash.startsWith('invite=')) {
      location.replace('/student' + (hash ? '#' + hash : ''));
    }
  }, [data, hash, studentPortal]);
  if (studentPortal && hash === 'register') return <StudentRegistrationForm/>;
  if (hash.startsWith('invite=')) return <Auth invite={hash.slice(7)} onSuccess={refresh} studentPortal={studentPortal}/>;
  const signedOut = error instanceof ApiError && [401, 404].includes(error.status);
  const current = data ?? profile;
  const isStudent = !!current && !current.platform && current.role === 'STUDENT';
  if (signedOut || (studentPortal && current && !isStudent)) return <Auth invite={null} onSuccess={refresh} studentPortal={studentPortal}/>;
  if (current && (!isStudent || studentPortal)) return <Workspace profile={current} route={hash} refresh={refresh}/>;
  return <main className="app-loading"><Brand/>{error ? <ErrorMessage error={error} retry={refresh}/> : <Loading/>}</main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Boundary><App/></Boundary></StrictMode>);
