export type Role = "reception" | "host" | "manager" | "admin";
export type VisitStatus = "Waiting" | "In meeting" | "Checked out" | "Cancelled" | "Denied";
export type AppointmentStatus = "Pending approval" | "Approved" | "Declined";

export const VISITOR_TYPES = ["Client", "Vendor and site vendor", "Interview candidate", "Wellness session"] as const;
export type VisitorType = (typeof VISITOR_TYPES)[number];

export const PURPOSES = [
  "Project discussion", "Vendor quote", "Site matter", "Interview",
  "Wellness session", "Payment or accounts", "Delivery", "Other"
] as const;
export type Purpose = (typeof PURPOSES)[number];

export const HOST_REPLIES = ["Send in", "Wait 10 minutes", "Can't meet today", "Reschedule"] as const;
export type HostReply = (typeof HOST_REPLIES)[number];

export type Action =
  | "contact.read" | "contact.create" | "contact.edit" | "contact.delete" | "contact.viewFullDob" | "contact.import"
  | "visit.read" | "visit.checkIn" | "visit.manage" | "visit.reply"
  | "appointment.read" | "appointment.book" | "appointment.decide"
  | "report.view" | "audit.view"
  | "export.todayOnly" | "export.ownOnly" | "export.everything"
  | "master.manage" | "staff.manage" | "settings.manage";

export interface SignedInUser {
  id: string; email: string; fullName: string; role: Role; hostId: number | null; hostName: string | null;
}

export interface Host {
  id: number; name: string; designation: string | null; department: string | null;
  floor: string; defaultRoomId: number | null; defaultRoomName: string | null;
  mobile: string | null; email: string | null; active: boolean;
}
export interface Room { id: number; name: string; floor: string; active?: boolean }

export interface Contact {
  id: number; code: string; fullName: string; mobile: string; email: string | null;
  dateOfBirth: string | null; birthday: string | null; address: string | null;
  organisation: string | null; designation: string | null; notes: string | null;
  isPrContact: boolean; isSample: boolean; createdAt: string;
  visitCount?: number; lastVisit?: string | null;
  visits?: ContactVisit[];
}
export interface ContactVisit {
  id: number; checkIn: string; checkOut: string | null; status: VisitStatus;
  visitorType: VisitorType; purpose: Purpose; hostName: string | null;
}
export interface Duplicate {
  id: number; code: string; fullName: string; mobile: string; organisation: string | null;
  reason: "mobile" | "email" | "name";
}

export interface Visit {
  id: number; status: VisitStatus; visitorType: VisitorType; purpose: Purpose; remarks: string | null;
  checkIn: string; checkOut: string | null; reason: string | null;
  reply: HostReply | null; repliedAt: string | null; waitUntil: string | null;
  reminders: number; appointmentId: number | null; isSample: boolean;
  durationMinutes: number | null; needsReview: boolean; unassigned: boolean;
  contact: { id: number; code: string; name: string; mobile: string; organisation: string | null };
  host: { id: number; name: string } | null;
  room: { id: number; name: string; floor: string } | null;
}

export interface Appointment {
  id: number; guestName: string; guestMobile: string; visitorType: VisitorType; purpose: Purpose;
  note: string | null; status: AppointmentStatus; startsAt: string; durationMinutes: number;
  contactId: number | null; contactCode: string | null;
  hostId: number; hostName: string;
  roomId: number | null; roomName: string | null; roomFloor: string | null;
  visitId: number | null;
}
export interface Clash {
  roomId: number; roomName: string;
  first: { id: number; label: string }; second: { id: number; label: string };
}

export interface Summary {
  insideNow: number; waitingNow: number; visitsToday: number; avgStayMinutes: number | null; flagged: number;
  byType: Bar[]; byDay: Bar[]; byHour: Bar[]; byHost: Bar[];
  repeatVisitors: { code: string; name: string; visits: number; lastVisit: string }[];
}
export interface Bar { label: string; n: number }

export interface StaffAccount {
  id: string; fullName: string; email: string; role: Role;
  hostId: number | null; hostName: string | null; active: boolean; createdAt: string;
}
export interface Notification {
  id: number; visitId: number | null; body: string; createdAt: string; readAt: string | null;
}
export interface AuditEntry {
  id: number; at: string; actorName: string | null; action: string; entity: string; entityId: string | null;
}
