import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingNotificationEventType, NotificationPreferenceRow, NotificationRecipient, OrganizationNotificationSettingsRow } from "@/types/notification";

type MemberRow = {
  user_id: string;
  role_code: string;
};

type ProfileContactRow = {
  id: string;
  email: string | null;
  phone: string | null;
};

type ApartmentAssigneeRow = {
  id: string;
  title: string | null;
  responsible_user_id?: string | null;
  backup_manager_user_id?: string | null;
};

export type RecipientResolutionResult = {
  recipients: NotificationRecipient[];
  apartmentTitle: string;
  settings: OrganizationNotificationSettingsRow;
  warningNoAssignee: boolean;
};

const EMPTY_SETTINGS: OrganizationNotificationSettingsRow = {
  organization_id: "",
  default_booking_manager_user_id: null,
  email_enabled: true,
  whatsapp_enabled: false,
  whatsapp_provider: null,
  whatsapp_channel_connected: false,
  fallback_rules: {},
  checkin_reminder_hours: 24,
  checkout_reminder_hours: 24,
  created_at: "",
  updated_at: "",
};

function normalizeRoleCode(roleCode: string | null | undefined): string {
  return (roleCode ?? "").trim().toLowerCase();
}

function isManagerRoleCode(roleCode: string): boolean {
  const normalized = normalizeRoleCode(roleCode);
  return normalized === "owner" || normalized === "admin" || normalized === "manager";
}

async function loadOrganizationSettings(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<OrganizationNotificationSettingsRow> {
  const { data, error } = await supabase
    .from("organization_notification_settings")
    .select("organization_id,default_booking_manager_user_id,email_enabled,whatsapp_enabled,whatsapp_provider,whatsapp_channel_connected,fallback_rules,checkin_reminder_hours,checkout_reminder_hours,created_at,updated_at")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) {
    return { ...EMPTY_SETTINGS, organization_id: organizationId };
  }

  return data as OrganizationNotificationSettingsRow;
}

async function loadApartmentAssignees(
  supabase: SupabaseClient,
  organizationId: string,
  apartmentId: string,
): Promise<ApartmentAssigneeRow | null> {
  const withAssignees = await supabase
    .from("apartments")
    .select("id,title,responsible_user_id,backup_manager_user_id")
    .eq("organization_id", organizationId)
    .eq("id", apartmentId)
    .maybeSingle();

  if (!withAssignees.error) {
    return (withAssignees.data as ApartmentAssigneeRow | null) ?? null;
  }

  if (withAssignees.error.code !== "42703") {
    return null;
  }

  const fallback = await supabase
    .from("apartments")
    .select("id,title")
    .eq("organization_id", organizationId)
    .eq("id", apartmentId)
    .maybeSingle();

  if (fallback.error || !fallback.data) {
    return null;
  }

  return fallback.data as ApartmentAssigneeRow;
}

async function loadMembers(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<MemberRow[]> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("user_id,role_code")
    .eq("organization_id", organizationId);

  if (error || !data) {
    return [];
  }

  return data as MemberRow[];
}

async function loadProfileContacts(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Map<string, ProfileContactRow>> {
  if (userIds.length === 0) {
    return new Map<string, ProfileContactRow>();
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,phone")
    .in("id", userIds);

  if (error || !data) {
    return new Map<string, ProfileContactRow>();
  }

  return new Map((data as ProfileContactRow[]).map((row) => [row.id, row]));
}

function buildRecipient(
  userId: string,
  roleCode: string,
  receivesAs: NotificationRecipient["receivesAs"],
  contacts: Map<string, ProfileContactRow>,
): NotificationRecipient {
  const profile = contacts.get(userId);
  return {
    userId,
    email: profile?.email ?? null,
    phone: profile?.phone ?? null,
    roleCode,
    receivesAs,
  };
}

export async function resolveStaffRecipients(params: {
  supabase: SupabaseClient;
  organizationId: string;
  apartmentId: string;
  apartmentTitleFallback: string;
  eventType: BookingNotificationEventType;
}): Promise<RecipientResolutionResult> {
  const { supabase, organizationId, apartmentId, apartmentTitleFallback } = params;

  const settings = await loadOrganizationSettings(supabase, organizationId);
  const apartment = await loadApartmentAssignees(supabase, organizationId, apartmentId);
  const members = await loadMembers(supabase, organizationId);

  const memberRoleMap = new Map<string, string>();
  members.forEach((member) => {
    memberRoleMap.set(member.user_id, member.role_code);
  });

  const candidateManagerIds = members
    .filter((member) => isManagerRoleCode(member.role_code))
    .map((member) => member.user_id);

  const assignedResponsible = apartment?.responsible_user_id ?? null;
  const assignedBackup = apartment?.backup_manager_user_id ?? null;

  const fallbackManagerId =
    settings.default_booking_manager_user_id && memberRoleMap.has(settings.default_booking_manager_user_id)
      ? settings.default_booking_manager_user_id
      : candidateManagerIds[0] ?? null;

  const dedup = new Set<string>();
  const recipients: NotificationRecipient[] = [];

  const addRecipient = (userId: string | null, receivesAs: NotificationRecipient["receivesAs"]) => {
    if (!userId || dedup.has(userId)) {
      return;
    }

    const roleCode = memberRoleMap.get(userId);
    if (!roleCode) {
      return;
    }

    dedup.add(userId);
    recipients.push({
      userId,
      email: null,
      phone: null,
      roleCode,
      receivesAs,
    });
  };

  if (assignedResponsible) {
    addRecipient(assignedResponsible, "responsible");
    addRecipient(assignedBackup, "backup_manager");
  } else if (assignedBackup) {
    addRecipient(assignedBackup, "responsible");
  } else {
    addRecipient(fallbackManagerId, "fallback_manager");
  }

  if (recipients.length === 0 && fallbackManagerId) {
    addRecipient(fallbackManagerId, "fallback_manager");
  }

  const contactMap = await loadProfileContacts(
    supabase,
    recipients.map((recipient) => recipient.userId),
  );

  const hydrated = recipients.map((recipient) =>
    buildRecipient(recipient.userId, recipient.roleCode, recipient.receivesAs, contactMap),
  );

  return {
    recipients: hydrated,
    apartmentTitle: apartment?.title?.trim() || apartmentTitleFallback,
    settings,
    warningNoAssignee: !assignedResponsible && !assignedBackup,
  };
}

export async function loadPreferencesMap(params: {
  supabase: SupabaseClient;
  organizationId: string;
  eventType: BookingNotificationEventType;
  userIds: string[];
}): Promise<Map<string, NotificationPreferenceRow>> {
  const { supabase, organizationId, eventType, userIds } = params;

  if (userIds.length === 0) {
    return new Map<string, NotificationPreferenceRow>();
  }

  const { data, error } = await supabase
    .from("notification_preferences")
    .select("organization_id,user_id,event_type,in_app_enabled,email_enabled,whatsapp_enabled,created_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("event_type", eventType)
    .in("user_id", userIds);

  if (error || !data) {
    return new Map<string, NotificationPreferenceRow>();
  }

  const rows = data as NotificationPreferenceRow[];
  return new Map(rows.map((row) => [row.user_id, row]));
}
