import { useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight, BookOpen, CalendarDays, ChevronRight, ClipboardCheck, GraduationCap, Megaphone, Wallet } from 'lucide-react';
import { includedInPlan, modules } from '../shared/catalog.js';
import type { StudentPortalData } from '../shared/student-portal.js';
import { dateLabel, scope, useLoad } from './api.js';
import type { Tenant } from './api.js';
import { Badge, Empty, ErrorMessage, Loading } from './ui.js';

function PortalSection({ title, module, children }: { title: string; module: string; children: ReactNode }) {
  return <section className="panel">
    <div className="panel-head"><h2>{title}</h2><a className="text-button portal-view" href={'#' + module} aria-label={'View all ' + modules[module].label.toLowerCase()}>View all <ChevronRight size={15}/></a></div>
    {children}
  </section>;
}

export function StudentPortal({ tenant }: { tenant: Tenant }) {
  const [revision, refresh] = useState(0);
  const { data, error } = useLoad<StudentPortalData>(tenant.operational ? scope(tenant) + '/student-portal' : null, revision);
  const profile = data?.profile;
  const firstName = tenant.user.name.trim().split(/\s+/)[0];
  const today = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: tenant.institution.timeZone,
  }).format(new Date());
  const shortcuts = [
    { kind: 'timetable', title: 'My timetable', detail: 'Classes and times', icon: CalendarDays },
    { kind: 'courses', title: 'My courses', detail: 'Lessons and assignments', icon: BookOpen },
    { kind: 'report-cards', title: 'My report cards', detail: 'Published term results', icon: GraduationCap },
    { kind: 'invoices', title: 'Fees and invoices', detail: 'School charges and balances', icon: Wallet },
  ].filter(({ kind }) => includedInPlan(modules[kind], tenant.subscription.plan));
  return <div className="dashboard student-dashboard">
    <header className="page-title dashboard-title"><div><h1>Student portal</h1><p>{tenant.institution.name}</p></div>
      <span className="date-chip"><CalendarDays size={16}/>{today}</span></header>
    <section className="welcome student-welcome">
      <div className="welcome-copy"><h2>Welcome back, {firstName}.</h2>
        {profile && <div className="student-identity"><span>Student number <strong>{profile.number}</strong></span>
          <a className="text-button" href={'#students/' + profile.id}>My profile <ArrowRight size={15}/></a></div>}
      </div>
      <div className="welcome-art" aria-hidden="true"><div/><div/><div/><GraduationCap size={38}/></div>
    </section>
    {!tenant.operational ? <div className="panel"><Empty title="Portal unavailable">Contact your school office for assistance.</Empty></div> :
      error ? <ErrorMessage error={error} retry={() => refresh((value) => value + 1)}/> : !data ? <Loading/> : <>
        {profile ? <>
          <nav className="metrics" aria-label="Student shortcuts">{shortcuts.map(({ kind, title, detail, icon: Icon }, index) =>
            <a className="panel portal-shortcut" href={'#' + kind} key={kind}>
              <span className={'metric-icon color-' + (index + 1)}><Icon size={20}/></span>
              <span><strong>{title}</strong><small>{detail}</small></span>
              <ChevronRight size={15}/>
            </a>)}</nav>
          <div className="dashboard-grid">
            <PortalSection title="Timetable · next 7 days" module="timetable">
              {data.timetable.length ? <ul className="portal-items">{data.timetable.map((slot) =>
                <li key={slot.id}><a className="portal-row" href={'#timetable/' + slot.id}>
                  <span className="metric-icon color-1"><CalendarDays size={17}/></span>
                  <span><strong>{slot.title}</strong><small>{dateLabel(slot.date)} · {slot.startsAt}–{slot.endsAt}{slot.room ? ' · ' + slot.room : ''}</small></span>
                  <ChevronRight size={15}/>
                </a></li>)}</ul> : <Empty title="No classes scheduled"/>}
            </PortalSection>
            <PortalSection title="Latest grades" module="grades">
              {data.grades.length ? <ul className="portal-items">{data.grades.map((grade) =>
                <li key={grade.id}><a className="portal-row" href={'#grades/' + grade.id}>
                  <span className="metric-icon color-2"><GraduationCap size={17}/></span>
                  <span><strong>{grade.title}</strong><small>Marks awarded: {grade.marks}</small></span>
                  <ChevronRight size={15}/>
                </a></li>)}</ul> : <Empty title="No published grades yet"/>}
            </PortalSection>
          </div>
        </> : <div className="panel"><Empty title="Student profile pending">Ask your school office to link your account to your student profile.</Empty></div>}
        <div className="dashboard-grid">
          <PortalSection title="School announcements" module="announcements">
            {data.announcements.length ? <ul className="portal-items">{data.announcements.map((notice) =>
              <li key={notice.id}><a className="portal-row" href={'#announcements/' + notice.id}>
                <span className="metric-icon color-3"><Megaphone size={17}/></span><strong>{notice.title}</strong><ChevronRight size={15}/>
              </a></li>)}</ul> : <Empty title="No announcements"/>}
          </PortalSection>
          {profile && <PortalSection title="Recent attendance" module="attendance">
            {data.attendance.length ? <ul className="portal-items">{data.attendance.map((entry) =>
              <li key={entry.id}><a className="portal-row" href={'#attendance/' + entry.id}>
                <span className="metric-icon color-4"><ClipboardCheck size={17}/></span>
                <span><strong>{dateLabel(entry.date)}</strong><small>{entry.title}</small></span><Badge status={entry.status}/>
              </a></li>)}</ul> : <Empty title="No attendance entries yet"/>}
          </PortalSection>}
        </div>
      </>}
  </div>;
}
