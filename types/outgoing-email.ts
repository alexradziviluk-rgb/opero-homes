export type OutgoingEmailStatus = "pending" | "sent" | "failed";

export type OutgoingEmail = {
  id: string;
  clientId?: string;
  bookingId?: string;
  to: string;
  subject: string;
  html?: string;
  text: string;
  status: OutgoingEmailStatus;
  attempts: number;
  createdAt: string;
  sentAt?: string;
  errorMessage?: string;
  sourceType?: "booking_confirmation";
  sourceId?: string;
  sourceKey?: string;
};

export const OUTGOING_EMAILS_STORAGE_KEY = "opero-homes-outgoing-emails";
