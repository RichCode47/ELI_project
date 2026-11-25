export const registrationStatuses = ['PENDING', 'INVITED', 'REGISTERED', 'DECLINED'] as const;
export type RegistrationStatus = typeof registrationStatuses[number];

export type StudentRegistrationRequest = {
  id: string;
  name: string;
  email: string;
  studentNumber: string | null;
  studentId: string | null;
  status: RegistrationStatus;
  createdAt: string;
};

export type RegistrationReview =
  | { action: 'decline' }
  | { action: 'reissue' }
  | { action: 'approve'; profile: { kind: 'existing'; studentId: string } | { kind: 'new'; studentNumber?: string } };
