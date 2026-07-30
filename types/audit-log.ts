export type AuditLogEntry = {
  id: string;
  entityType: "booking";
  entityId: string;
  action: "booking_confirmed";
  performedByUserId: string;
  previousValue: {
    status: string;
  };
  nextValue: {
    status: string;
  };
  createdAt: string;
  sourceType?: "booking_confirmation";
  sourceId?: string;
  sourceKey?: string;
};

export const AUDIT_LOG_STORAGE_KEY = "opero-homes-audit-log";
