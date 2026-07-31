import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
  dueAt?: string;
  priority?: string;
};

type UpdateTaskPayload = {
  id?: string;
  assignedUserId?: string;
  status?: string;
  dueAt?: string;
  priority?: string;
};

function error(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return error(500, "Supabase is not configured");

  const auth = await requireStaffApiAuth();
  if (!auth.ok) return auth.response;

  const roleCode = normalizeRoleCode(auth.context.organizationMember.role_code);
  let query = supabase
    .from("operational_tasks")
    .select("id,title,description,task_type,priority,status,apartment_id,booking_id,assigned_user_id,due_at,created_at,updated_at")
    .eq("organization_id", auth.context.organization.id)
    .order("due_at", { ascending: true });

  if (!MANAGER_ROLES.has(roleCode)) {
    query = query.eq("assigned_user_id", auth.context.authUserId);
  }

  const { data, error: queryError } = await query;
  if (queryError) return error(422, queryError.message);
  return NextResponse.json({ ok: true, data: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return error(500, "Supabase is not configured");

  const auth = await requireStaffApiAuth();
  if (!auth.ok) return auth.response;

  const roleCode = normalizeRoleCode(auth.context.organizationMember.role_code);
  if (!MANAGER_ROLES.has(roleCode)) return error(403, "Insufficient permissions");

  const body = (await request.json().catch(() => null)) as CreateTaskPayload | null;
  const title = body?.title?.trim() ?? "";
  const taskType = body?.taskType?.trim() ?? "";
  const apartmentId = body?.apartmentId?.trim() ?? "";
  const assignedUserId = body?.assignedUserId?.trim() ?? "";
  const dueAt = body?.dueAt?.trim() ?? "";
  const priority = body?.priority?.trim() ?? "normal";

  if (!title || !TASK_TYPES.has(taskType) || !apartmentId || !assignedUserId || !dueAt || !PRIORITIES.has(priority)) {
    return error(400, "Invalid task payload");
  }

  const { data, error: insertError } = await supabase
    .from("operational_tasks")
    .insert({
      organization_id: auth.context.organization.id,
      apartment_id: apartmentId,
      booking_id: body?.bookingId || null,
      title,
      description: body?.description?.trim() ?? "",
      task_type: taskType,
      priority,
      status: "assigned",
      assigned_user_id: assignedUserId,
      due_at: dueAt,
      created_by: auth.context.authUserId,
    })
    .select("id,title,description,task_type,priority,status,apartment_id,booking_id,assigned_user_id,due_at,created_at,updated_at")
    .single();

  if (insertError) return error(422, insertError.message);
  return NextResponse.json({ ok: true, data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return error(500, "Supabase is not configured");

  const auth = await requireStaffApiAuth();
  if (!auth.ok) return auth.response;

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

  const changes: Record<string, string> = {};
  if (payload.status) {
    if (!STATUSES.has(payload.status) || (!isManager && payload.status === "verified")) return error(400, "Invalid task status");
    changes.status = payload.status;
  }
  if (payload.assignedUserId && isManager) changes.assigned_user_id = payload.assignedUserId;
  if (payload.dueAt && isManager) changes.due_at = payload.dueAt;
  if (payload.priority && isManager && PRIORITIES.has(payload.priority)) changes.priority = payload.priority;

  const { data, error: updateError } = await supabase
    .from("operational_tasks")
    .update(changes)
    .eq("organization_id", auth.context.organization.id)
    .eq("id", id)
    .select("id,title,description,task_type,priority,status,apartment_id,booking_id,assigned_user_id,due_at,created_at,updated_at")
    .single();

  if (updateError) return error(422, updateError.message);
  return NextResponse.json({ ok: true, data });
}
