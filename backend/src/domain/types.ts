export const ROLES = ["reception", "host", "manager", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const VISITOR_TYPES = ["Client", "Vendor and site vendor", "Interview candidate", "Wellness session"] as const;
export type VisitorType = (typeof VISITOR_TYPES)[number];

export const VISIT_STATUSES = ["Waiting", "In meeting", "Checked out", "Cancelled", "Denied"] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];
export const ACTIVE_STATUSES = ["Waiting", "In meeting"] as const satisfies readonly VisitStatus[];

export const APPOINTMENT_STATUSES = ["Pending approval", "Approved", "Declined"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const PURPOSES = [
  "Project discussion", "Vendor quote", "Site matter", "Interview",
  "Wellness session", "Payment or accounts", "Delivery", "Other"
] as const;
export type Purpose = (typeof PURPOSES)[number];

export const HOST_REPLIES = ["Send in", "Wait 10 minutes", "Can't meet today", "Reschedule"] as const;
export type HostReply = (typeof HOST_REPLIES)[number];

export const FLOORS = ["Ground", "2nd", "3rd"] as const;
export type Floor = (typeof FLOORS)[number];

export const isActive = (status: VisitStatus) => (ACTIVE_STATUSES as readonly VisitStatus[]).includes(status);
