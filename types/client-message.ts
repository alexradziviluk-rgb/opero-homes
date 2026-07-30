export type ClientMessageType =
  | "booking_confirmed"
  | "booking_cancelled"
  | "payment"
  | "system";

export type ClientMessage = {
  id: string;
  clientId: string;
  bookingId?: string;
  type: ClientMessageType;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  sourceType?: "booking_confirmation";
  sourceId?: string;
  sourceKey?: string;
};

export const CLIENT_MESSAGES_STORAGE_KEY = "opero-homes-client-messages";
