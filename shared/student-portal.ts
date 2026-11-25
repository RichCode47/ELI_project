export type PortalItem = { id: string; title: string };
export type StudentPortalData = {
  profile: { id: string; number: string } | null;
  timetable: (PortalItem & { date: string; startsAt: string; endsAt: string; room?: string })[];
  grades: (PortalItem & { marks: string })[];
  attendance: (PortalItem & { date: string; status: string })[];
  announcements: PortalItem[];
};
