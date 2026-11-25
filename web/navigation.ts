import {
  AlarmClock, Bell, BookCopy, BookOpen, Building2, CalendarDays, ChartNoAxesCombined, ClipboardCheck, ClipboardList,
  Contact, FileBadge, FileText, GraduationCap, LayoutDashboard, LibraryBig, Megaphone, NotebookPen, Receipt,
  Settings, Shield, UsersRound, Wallet, Workflow,
} from 'lucide-react';
import { includedInPlan, modules } from '../shared/catalog.js';
import type { Tenant } from './api.js';

export const iconMap = {
  overview: LayoutDashboard, students: GraduationCap, admissions: ClipboardList, staff: Contact, guardians: UsersRound,
  enrolments: Workflow, programmes: BookCopy, classes: Building2, subjects: BookOpen, years: CalendarDays, terms: CalendarDays,
  timetable: AlarmClock, attendance: ClipboardCheck, assessments: NotebookPen, grades: ChartNoAxesCombined,
  'report-cards': FileText, fees: Wallet, invoices: FileText, receipts: Receipt, courses: BookOpen, lessons: BookCopy,
  assignments: NotebookPen, submissions: ClipboardList, books: LibraryBig, loans: BookCopy, announcements: Megaphone,
  notifications: Bell, certificates: FileBadge, transcripts: FileText, settings: Settings, audit: Shield, members: UsersRound,
  subscription: Wallet, institutions: Building2, 'student-registrations': ClipboardList,
};
export const iconFor = (key: string) => iconMap[key as keyof typeof iconMap] ?? FileText;
export function tenantNav(profile: Tenant) {
  const enabled = Object.entries(modules).filter(([, module]) => profile.operational
    && module.readers.includes(profile.role) && includedInPlan(module, profile.subscription.plan));
  return {
    Workspace: [{ id: 'overview', label: profile.role === 'STUDENT' ? 'Portal home' : 'Overview' }],
    ...Object.fromEntries([...new Set(enabled.map(([, module]) => module.group))].map((group) => [
      group, enabled.filter(([, module]) => module.group === group).map(([id, module]) => ({ id, label: profile.role === 'STUDENT' && id === 'students' ? 'My profile' : module.label })),
    ])),
    ...(profile.role === 'ADMIN' ? { Settings: [
      { id: 'settings', label: 'Institution settings' }, { id: 'members', label: 'Members' },
      { id: 'student-registrations', label: 'Student registrations' },
      { id: 'subscription', label: 'Subscription' }, { id: 'audit', label: 'Audit log' },
    ] } : {}),
  } as Record<string, { id: string; label: string }[]>;
}
