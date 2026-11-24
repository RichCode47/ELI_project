import { useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, ChevronRight, Megaphone, Plus, Sparkles } from 'lucide-react';
import { modules } from '../shared/catalog.js';
import type { Item, Tenant } from './api.js';
import { dateLabel, scope, useLoad } from './api.js';
import { iconFor } from './navigation.js';
import { Badge, Empty, ErrorMessage, Loading } from './ui.js';

type Day = { date: string; total: number; present: number };
type DashboardData = { metrics: Record<string, number>; recent: Item[]; notices: Item[]; attendance: Day[] };
type Open = (kind: string, id?: string, create?: boolean) => void;

function Attendance({ days }: { days: Day[] }) {
  const total = days.reduce((sum, day) => sum + day.total, 0);
  const present = days.reduce((sum, day) => sum + day.present, 0);
  const percent = total ? Math.round(present / total * 100) + '%' : '—';
  return <section className="panel chart-panel">
    <div className="panel-head"><div><h2>Attendance overview</h2></div>
      <span className="chart-tag"><CalendarDays size={14}/> Last 7 days</span></div>
    <div className="chart-summary"><strong>{percent}</strong><span>attendance rate</span></div>
    <div className="plot">
      <div className="chart-axis" aria-hidden="true"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>
      <div className="chart-main">
        <div className="chart-lines" aria-hidden="true"><i/><i/><i/><i/><i/></div>
        <div className="chart-columns" role="list" aria-label="Attendance by day">
          {days.map((day, index) => {
            const ratio = day.total ? Math.round(day.present / day.total * 100) : 0;
            const label = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(new Date(day.date + 'T12:00:00Z'));
            return <div className="chart-column" role="listitem" key={day.date} aria-label={label + ': ' + (day.total ? ratio + '% attendance' : 'No entries')} title={label + ' • ' + (day.total ? ratio + '% attendance' : 'No entries')}>
              <div className="chart-bar"><i className={index === 6 ? 'current' : ''} style={{ height: ratio + '%' }}/></div>
              <span>{label}</span>
            </div>;
          })}
        </div>
      </div>
    </div>
    <div className="chart-foot"><span><i/>Present or late</span><span>{total ? total + ' attendance entries' : 'No attendance entries this week'}</span></div>
  </section>;
}

function QuickActions({ tenant, open }: { tenant: Tenant; open: Open }) {
  const actions = [
    { kind: 'students', title: 'Add a student', detail: 'Create a student profile' },
    { kind: 'attendance', title: 'Record attendance', detail: 'Take a class register' },
    { kind: 'invoices', title: 'Create an invoice', detail: 'Bill a student account' },
    { kind: 'announcements', title: 'Post an announcement', detail: 'Share a workspace notice' },
    { kind: 'classes', title: 'View classes', detail: 'Open your class list', read: true },
    { kind: 'notifications', title: 'View notifications', detail: 'Check your inbox', read: true },
  ].filter((action) => (action.read ? modules[action.kind].readers : modules[action.kind].writers).includes(tenant.role)).slice(0, 4);
  return <section className="panel quick-panel"><div className="panel-head"><div><h2>Quick actions</h2><p>Common tasks for your role</p></div><span className="panel-ornament"><Sparkles size={18}/></span></div>
    <div className="quick-items">{actions.map((action, index) => {
      const Icon = iconFor(action.kind);
      return <button className="quick-item" key={action.kind} onClick={() => open(action.kind, undefined, !action.read)}>
        <span className={'metric-icon color-' + (index + 1)}><Icon size={18}/></span>
        <span><strong>{action.title}</strong><small>{action.detail}</small></span>
        <ChevronRight size={16} className="quick-arrow"/>
      </button>;
    })}</div>
  </section>;
}
export function Dashboard({ tenant, open }: { tenant: Tenant; open: Open }) {
  const [revision, refresh] = useState(0);
  const { data, error } = useLoad<DashboardData>(scope(tenant) + '/dashboard', revision);
  const date = new Intl.DateTimeFormat('en-GB', { weekday: 'long', month: 'long', day: 'numeric', timeZone: tenant.institution.timeZone }).format(new Date());
  const name = tenant.user.name.trim().split(/\s+/)[0];
  const addStudent = tenant.operational && modules.students.writers.includes(tenant.role);
  const preferences = ['students', 'staff', 'classes', 'admissions', 'enrolments', 'invoices', 'courses', 'loans', 'books', 'notifications', 'announcements'];
  const shown = data ? preferences.filter((kind) => Object.hasOwn(data.metrics, kind)).slice(0, 4) : [];
  const labels: Record<string, string> = { students: 'Students', staff: 'Staff members', classes: 'Classes', admissions: 'Applications' };
  return <div className="dashboard">
    <header className="page-title dashboard-title"><div><h1>Overview</h1><p>Here’s what’s happening across your workspace.</p></div>
      <span className="date-chip"><CalendarDays size={16}/>{date}</span></header>
    <section className="welcome"><div className="welcome-copy">
      <span className="welcome-label"><span/> {tenant.institution.name}</span>
      <h2>Welcome back, {name}.</h2>
      {!tenant.operational && <p>Your workspace subscription needs attention.</p>}
      {addStudent ? <button className="button primary" onClick={() => open('students', undefined, true)}><Plus size={17}/> Add student</button> :
        tenant.operational && <button className="button outline" onClick={() => open('announcements')}>View announcements <ArrowRight size={16}/></button>}
    </div><div className="welcome-art" aria-hidden="true"><div/><div/><div/><Sparkles size={32}/></div></section>
    {!tenant.operational ? <div className="panel"><Empty title="Subscription inactive">Ask your institution administrator to review the subscription.</Empty></div> :
      error ? <ErrorMessage error={error} retry={() => refresh((number) => number + 1)}/> : !data ? <Loading/> : <>
        <section className="metrics" aria-label="Workspace metrics">{shown.map((kind, index) => {
          const Icon = iconFor(kind);
          return <button className="metric panel" key={kind} onClick={() => open(kind)}>
            <span className={'metric-icon color-' + (index + 1)}><Icon size={20}/></span>
            <ArrowUpRight size={16} className="metric-arrow"/>
            <span className="metric-label">{labels[kind] ?? modules[kind].label}</span>
            <strong>{data.metrics[kind].toLocaleString('en-ZM')}</strong>
          </button>;
        })}</section>
        <div className="dashboard-grid">
          {data.attendance.length > 0 ? <Attendance days={data.attendance}/> :
            <section className="panel"><div className="panel-head"><div><h2>Announcements</h2><p>From your institution</p></div></div>
              {data.notices.length ? data.notices.map((notice) => <button className="notice" key={notice.id} onClick={() => open(notice.kind, notice.id)}><Megaphone size={17}/>{notice.title}<ArrowDownRight size={15}/></button>) : <Empty title="No announcements"/>}
            </section>}
          <QuickActions tenant={tenant} open={open}/>
        </div>
        <section className="panel activity-panel"><div className="panel-head"><div><h2>Recent activity</h2><p>Latest updates you have access to</p></div></div>
          {data.recent.length ? <div className="activity-list">{data.recent.map((item) => {
            const Icon = iconFor(item.kind);
            return <button className="activity-row" key={item.id} onClick={() => open(item.kind, item.id)}>
              <span className="metric-icon color-1"><Icon size={16}/></span>
              <span><strong>{item.title}</strong><small>{modules[item.kind].label}</small></span>
              <Badge status={item.status}/><time dateTime={item.updatedAt}>{dateLabel(item.updatedAt, tenant.institution.timeZone)}</time><ChevronRight size={16}/>
            </button>;
          })}</div> : <Empty title="No recent activity">Activity will appear as your institution adds records.</Empty>}
        </section>
      </>}
  </div>;
}
