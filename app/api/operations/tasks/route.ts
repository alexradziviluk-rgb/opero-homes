import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import { normalizeRoleCode } from "@/lib/supabase/role-code";

const MANAGER_ROLES = new Set(["owner", "manager"]);
const TASK_TYPES = new Set(["cleaning", "technical", "linen", "purchase", "inspection", "keys", "payment", "instructions", "other"]);
const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const STATUSES = new Set(["pending", "assigned", "in_progress", "completed", "verified", "cancelled"]);

type CreateTaskPayload = {
  title?: string;
  description?: string;
  taskType?: string;
  apartmentId?: string;
  bookingId?: string | null;
  assignedUserId?: string;
  assignedUserIds?: string[];
  dueAt?: string;
  priority?: string;
  checklistItems?: string[];
};

type UpdateTaskPayload = {
  id?: string;
  title?: string;
  taskType?: string;
  apartmentId?: string;
  assignedUserId?: string;
  assignedUserIds?: string[];
  status?: string;
  dueAt?: string;
  priority?: string;
  checklistItems?: Array<{ id?: string; title?: string; completed?: boolean }>;
};

function error(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

const TASK_SELECT = "id,title,description,task_type,priority,status,apartment_id,booking_id,assigned_user_id,due_at,created_at,updated_at";

async function getChecklist(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, taskIds: string[]) {
  if (!supabase || taskIds.length === 0) return new Map<string, Array<{ id: string; title: string; completed: boolean; completed_by: string | null; completed_at: string | null }>>();
  const { data, error: queryError } = await supabase
    .from("operational_task_items")
    .select("id,task_id,title,completed,completed_by,completed_at")
    .in("task_id", taskIds)
    .order("position", { ascending: true });
  if (queryError) throw new Error(queryError.message);
  const result = new Map<string, Array<{ id: string; title: string; completed: boolean; completed_by: string | null; completed_at: string | null }>>();
  for (const row of data ?? []) result.set(row.task_id, [...(result.get(row.task_id) ?? []), row]);
  return result;
}

async function getAssignedUserIds(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, taskIds: string[]) {
  if (!supabase || taskIds.length === 0) return new Map<string, string[]>();
  const { data, error: queryError } = await supabase
    .from("operational_task_assignees")
    .select("task_id,user_id")
    .in("task_id", taskIds);
  if (queryError) throw new Error(queryError.message);
  const result = new Map<string, string[]>();
  for (const row of data ?? []) result.set(row.task_id, [...(result.get(row.task_id) ?? []), row.user_id]);
  return result;
}

function withTaskDetails<T extends { id: string; assigned_user_id: string }>(rows: T[], assignments: Map<string, string[]>, checklist: Awaited<ReturnType<typeof getChecklist>>) {
  return rows.map((row) => ({
    ...row,
    assigned_user_ids: assignments.get(row.id) ?? [row.assigned_user_id],
    checklist: (checklist.get(row.id) ?? []).map((item) => ({ id: item.id, title: item.title, completed: item.completed, completed_by: item.completed_by, completed_at: item.completed_at })),
  }));
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return error(500, "Supabase is not configured");

  const auth = await requireStaffApiAuth();
  if (!auth.ok) return auth.response;

  const query = supabase
    .from("operational_tasks")
    .select(TASK_SELECT)
    .eq("organization_id", auth.context.organization.id)
    .order("due_at", { ascending: true });

  const { data, error: queryError } = await query;
  if (queryError) return error(422, queryError.message);
  try {
    const taskIds = (data ?? []).map((row) => row.id);
    const [assignments, checklist] = await Promise.all([getAssignedUserIds(supabase, taskIds), getChecklist(supabase, taskIds)]);
    const result = withTaskDetails(data ?? [], assignments, checklist);
    if (new URL(request.url).searchParams.get("includeArchived") === "true") {
      const { data: archived, error: archiveError } = await supabase
        .from("operational_task_archive")
        .select("task_id,organization_id,apartment_id,booking_id,title,description,task_type,priority,status,assigned_user_id,due_at,created_by,created_at,updated_at")
        .eq("organization_id", auth.context.organization.id);
      if (archiveError) return error(422, archiveError.message);
      result.push(...(archived ?? []).map((row) => ({ ...row, id: row.task_id, assigned_user_ids: [row.assigned_user_id], checklist: [] })));
    }
    return NextResponse.json({ ok: true, data: result });
  } catch (assignmentError) {
    return error(422, assignmentError instanceof Error ? assignmentError.message : "Unable to load task assignees");
  }
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return error(500, "Supabase is not configured");

  const auth = await requireStaffApiAuth();
  if (!auth.ok) return auth.response;

  const roleCode = normalizeRoleCode(auth.context.organizationMember.role_code);
  if (!MANAGER_ROLES.has(roleCode)) return error(403, "Insufficient permissions");
  const writeSupabase = createSupabaseServiceRoleClient() ?? supabase;

  const body = (await request.json().catch(() => null)) as CreateTaskPayload | null;
  const title = body?.title?.trim() ?? "";
  const taskType = body?.taskType?.trim() ?? "";
  const apartmentId = body?.apartmentId?.trim() ?? "";
  const assignedUserIds = [...new Set((body?.assignedUserIds ?? (body?.assignedUserId ? [body.assignedUserId] : [])).map((id) => id.trim()).filter(Boolean))];
  const assignedUserId = assignedUserIds[0] ?? "";
  const dueAt = body?.dueAt?.trim() ?? "";
  const priority = body?.priority?.trim() ?? "normal";
  const checklistItems = [...new Set((body?.checklistItems ?? []).map((item) => item.trim()).filter(Boolean))];

  if (!title || !TASK_TYPES.has(taskType) || !apartmentId || !assignedUserId || !dueAt || !PRIORITIES.has(priority)) {
    return error(400, "Invalid task payload");
  }

  const { data: apartment, error: apartmentError } = await supabase
    .from("apartments")
    .select("id")
    .eq("organization_id", auth.context.organization.id)
    .eq("id", apartmentId)
    .maybeSingle();
  if (apartmentError) return error(422, apartmentError.message);
  if (!apartment) return error(400, "Apartment is not available in this organization");

  const { data: members, error: membersError } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", auth.context.organization.id)
    .eq("status", "active")
    .in("user_id", assignedUserIds);
  if (membersError) return error(422, membersError.message);
  if ((members ?? []).length !== assignedUserIds.length) return error(400, "One or more assignees are not members of this organization");

  const bookingId = body?.bookingId?.trim() ?? "";
  if (bookingId) {
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id,apartment_id")
      .eq("organization_id", auth.context.organization.id)
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingError) return error(422, bookingError.message);
    if (!booking || booking.apartment_id !== apartmentId) return error(400, "Booking is not available for this apartment and organization");
  }

  const { data, error: insertError } = await writeSupabase
    .from("operational_tasks")
    .insert({
      organization_id: auth.context.organization.id,
      apartment_id: apartmentId,
      booking_id: bookingId || null,
      title,
      description: body?.description?.trim() ?? "",
      task_type: taskType,
      priority,
      status: "assigned",
      assigned_user_id: assignedUserId,
      due_at: dueAt,
      created_by: auth.context.authUserId,
    })
    .select(TASK_SELECT)
    .single();

  if (insertError) return error(422, insertError.message);
  const { error: assignmentError } = await writeSupabase.from("operational_task_assignees").insert(assignedUserIds.map((userId) => ({ task_id: data.id, user_id: userId })));
  if (assignmentError) return error(422, assignmentError.message);
  if (checklistItems.length) {
    const { error: checklistError } = await writeSupabase.from("operational_task_items").insert(checklistItems.map((item, position) => ({ task_id: data.id, title: item, position })));
    if (checklistError) return error(422, checklistError.message);
  }
  return NextResponse.json({ ok: true, data: { ...data, assigned_user_ids: assignedUserIds, checklist: checklistItems.map((title, index) => ({ id: `${data.id}-${index}`, title, completed: false })) } }, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return error(500, "Supabase is not configured");

  const auth = await requireStaffApiAuth();
  if (!auth.ok) return auth.response;
  const writeSupabase = createSupabaseServiceRoleClient() ?? supabase;

  const body = (await request.json().catch(() => null)) as UpdateTaskPayload | null;
  const id = body?.id?.trim() ?? "";
  if (!id) return error(400, "Task id is required");
  const payload = body ?? {};

  const roleCode = normalizeRoleCode(auth.context.organizationMember.role_code);
  const isManager = MANAGER_ROLES.has(roleCode);
  const { data: existing, error: existingError } = await supabase
    .from("operational_tasks")
    .select("assigned_user_id")
    .eq("organization_id", auth.context.organization.id)
    .eq("id", id)
    .maybeSingle();

  if (existingError) return error(422, existingError.message);
  if (!existing) return error(404, "Task not found");
  if (!isManager && existing.assigned_user_id !== auth.context.authUserId) return error(403, "Insufficient permissions");

  const changes: Record<string, string | null> = {};
  if (payload.title?.trim() && isManager) changes.title = payload.title.trim();
  if (payload.taskType && isManager && TASK_TYPES.has(payload.taskType)) changes.task_type = payload.taskType;
  if (payload.apartmentId?.trim() && isManager) changes.apartment_id = payload.apartmentId.trim();
  if (payload.status) {
    if (!STATUSES.has(payload.status) || (!isManager && payload.status === "verified")) return error(400, "Invalid task status");
    changes.status = payload.status;
    changes.completed_at = ["completed", "verified"].includes(payload.status) ? new Date().toISOString() : null;
  }
  const assignedUserIds = payload.assignedUserIds?.map((userId) => userId.trim()).filter(Boolean);
  if (assignedUserIds?.length && isManager) changes.assigned_user_id = assignedUserIds[0];
  else if (payload.assignedUserId && isManager) changes.assigned_user_id = payload.assignedUserId;
  if (payload.dueAt && isManager) changes.due_at = payload.dueAt;
  if (payload.priority && isManager && PRIORITIES.has(payload.priority)) changes.priority = payload.priority;

  if (payload.checklistItems && (!isManager && existing.assigned_user_id !== auth.context.authUserId)) return error(403, "Insufficient permissions");

  if (assignedUserIds?.length && isManager) {
    const { data: members, error: membersError } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", auth.context.organization.id)
      .eq("status", "active")
      .in("user_id", assignedUserIds);
    if (membersError) return error(422, membersError.message);
    if ((members ?? []).length !== new Set(assignedUserIds).size) return error(400, "One or more assignees are not members of this organization");
  }

  if (payload.apartmentId?.trim() && isManager) {
    const { data: apartment, error: apartmentError } = await supabase
      .from("apartments")
      .select("id")
      .eq("organization_id", auth.context.organization.id)
      .eq("id", payload.apartmentId.trim())
      .maybeSingle();
    if (apartmentError) return error(422, apartmentError.message);
    if (!apartment) return error(400, "Apartment is not available in this organization");
  }

  const { data, error: updateError } = Object.keys(changes).length
    ? await writeSupabase
      .from("operational_tasks")
      .update(changes)
      .eq("organization_id", auth.context.organization.id)
      .eq("id", id)
      .select(TASK_SELECT)
      .single()
    : await supabase
      .from("operational_tasks")
      .select(TASK_SELECT)
      .eq("organization_id", auth.context.organization.id)
      .eq("id", id)
      .single();

  if (updateError) return error(422, updateError.message);
  if (assignedUserIds?.length && isManager) {
    const { error: deleteError } = await writeSupabase.from("operational_task_assignees").delete().eq("task_id", id);
    if (deleteError) return error(422, deleteError.message);
    const { error: assignmentError } = await writeSupabase.from("operational_task_assignees").insert(assignedUserIds.map((userId) => ({ task_id: id, user_id: userId })));
    if (assignmentError) return error(422, assignmentError.message);
  }
  if (payload.checklistItems) {
    const { error: deleteChecklistError } = await writeSupabase.from("operational_task_items").delete().eq("task_id", id);
    if (deleteChecklistError) return error(422, deleteChecklistError.message);
    const items = payload.checklistItems.filter((item) => item.title?.trim()).map((item, position) => ({
      task_id: id,
      title: item.title?.trim() ?? "",
      completed: Boolean(item.completed),
      completed_by: item.completed ? auth.context.authUserId : null,
      completed_at: item.completed ? new Date().toISOString() : null,
      position,
    }));
    if (items.length) {
      const { error: insertChecklistError } = await writeSupabase.from("operational_task_items").insert(items);
      if (insertChecklistError) return error(422, insertChecklistError.message);
    }
    const nextStatus = items.length > 0 && items.every((item) => item.completed) ? "completed" : data.status === "completed" ? "in_progress" : data.status;
    if (nextStatus !== data.status) {
      const { data: statusData, error: statusError } = await writeSupabase.from("operational_tasks").update({ status: nextStatus }).eq("id", id).select(TASK_SELECT).single();
      if (statusError) return error(422, statusError.message);
      return NextResponse.json({ ok: true, data: { ...statusData, assigned_user_ids: assignedUserIds ?? [statusData.assigned_user_id], checklist: items } });
    }
    return NextResponse.json({ ok: true, data: { ...data, assigned_user_ids: assignedUserIds ?? [data.assigned_user_id], checklist: items } });
  }
  return NextResponse.json({ ok: true, data: { ...data, assigned_user_ids: assignedUserIds ?? [data.assigned_user_id] } });
}

export async function DELETE(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return error(500, "Supabase is not configured");

  const auth = await requireStaffApiAuth();
  if (!auth.ok) return auth.response;
  const roleCode = normalizeRoleCode(auth.context.organizationMember.role_code);
  if (!MANAGER_ROLES.has(roleCode)) return error(403, "Insufficient permissions");

  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) return error(400, "Task id is required");

  const writeSupabase = createSupabaseServiceRoleClient() ?? supabase;
  const { error: deleteError } = await writeSupabase
    .from("operational_tasks")
    .delete()
    .eq("organization_id", auth.context.organization.id)
    .eq("id", id);

  if (deleteError) return error(422, deleteError.message);
  return NextResponse.json({ ok: true });
}
