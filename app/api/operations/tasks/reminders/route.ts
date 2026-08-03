import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";

function error(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return error(500, "Supabase is not configured");
  const auth = await requireStaffApiAuth();
  if (!auth.ok) return auth.response;

  const organizationId = auth.context.organization.id;
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 15 * 60 * 60 * 1000);
  const { data: tasks, error: taskError } = await supabase
    .from("operational_tasks")
    .select("id,title,due_at,assigned_user_id,status")
    .eq("organization_id", organizationId)
    .in("status", ["pending", "assigned", "in_progress"])
    .lte("due_at", windowEnd.toISOString());
  if (taskError) return error(422, taskError.message);
  if (!tasks?.length) return NextResponse.json({ ok: true, created: 0 });

  const [{ data: managers, error: managersError }, { data: assignments, error: assignmentsError }] = await Promise.all([
    supabase.from("organization_members").select("user_id").eq("organization_id", organizationId).in("role_code", ["owner", "manager"]).eq("status", "active"),
    supabase.from("operational_task_assignees").select("task_id,user_id").in("task_id", tasks.map((task) => task.id)),
  ]);
  if (managersError) return error(422, managersError.message);
  if (assignmentsError) return error(422, assignmentsError.message);

  const { data: activeMembers, error: activeMembersError } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("status", "active");
  if (activeMembersError) return error(422, activeMembersError.message);
  const activeMemberIds = new Set((activeMembers ?? []).map((member) => member.user_id));

  let created = 0;
  for (const task of tasks) {
    const due = new Date(task.due_at);
    const overdue = due.getTime() < now.getTime();
    const eventType = overdue ? "task_overdue" : "task_due_soon";
    const bucket = overdue ? due.toISOString().slice(0, 13) : due.toISOString().slice(0, 10);
    const idempotencyKey = `task:${task.id}:${eventType}:${bucket}`;
    const { data: event, error: eventError } = await supabase
      .from("notification_events")
      .upsert({ organization_id: organizationId, event_type: eventType, entity_type: "operational_task", entity_id: task.id, payload: { taskTitle: task.title, dueAt: task.due_at, actionUrl: "/tasks" }, idempotency_key: idempotencyKey, created_by_user_id: auth.context.authUserId }, { onConflict: "organization_id,idempotency_key", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();
    if (eventError || !event) continue;

    const recipientIds = new Set<string>([task.assigned_user_id, ...(assignments ?? []).filter((item) => item.task_id === task.id).map((item) => item.user_id), ...(managers ?? []).map((member) => member.user_id)].filter((userId) => activeMemberIds.has(userId)));
    const message = overdue ? `Задача «${task.title}» просрочена. Требуется контроль.` : `Задача «${task.title}» должна быть выполнена в ближайшие 15 часов.`;
    const { error: notificationError } = await supabase.from("notifications").upsert(Array.from(recipientIds).map((userId) => ({ organization_id: organizationId, recipient_user_id: userId, event_id: event.id, title: overdue ? "Задача просрочена" : "Приближается срок задачи", message, action_url: "/tasks" })), { onConflict: "organization_id,event_id,recipient_user_id", ignoreDuplicates: true });
    if (!notificationError) created += recipientIds.size;
  }

  return NextResponse.json({ ok: true, created });
}
