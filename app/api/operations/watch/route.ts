import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { calculateSla, nextEscalationLevel } from "@/lib/operations/sla";

type TaskRow = {
  id: string;
  organization_id: string;
  title: string;
  task_type: string;
  priority: string;
  status: string;
  assigned_user_id: string;
  due_at: string;
  created_at: string;
  sla_due_at: string | null;
  sla_warning_at: string | null;
  escalation_level: number;
};

const OPEN_STATUSES = ["pending", "assigned", "in_progress"];

function authorized(request: Request): boolean {
  const configured = process.env.OPERATIONS_WORKER_SECRET?.trim();
  return Boolean(configured && request.headers.get("x-operations-worker-secret") === configured);
}

function failureInjectionTaskId(request: Request): string | null {
  if (process.env.OPERATIONS_ALLOW_TEST_FAILURE_INJECTION !== "true") return null;
  const requestedTaskId = request.headers.get("x-operations-test-failure-task")?.trim();
  return requestedTaskId || null;
}

function reminderKey(task: TaskRow, level: number, kind: string): string {
  return `phase3:${task.id}:${kind}:${level}`;
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Operations worker is not configured" }, { status: 503 });
  const injectedFailureTaskId = failureInjectionTaskId(request);

  const { data, error } = await supabase.from("operational_tasks").select("id,organization_id,title,task_type,priority,status,assigned_user_id,due_at,created_at,sla_due_at,sla_warning_at,escalation_level").in("status", OPEN_STATUSES).limit(500);
  if (error) return NextResponse.json({ ok: false, error: "Unable to load operational tasks" }, { status: 422 });

  const now = new Date();
  let inspected = 0;
  let remindersCreated = 0;
  let escalations = 0;
  let notificationsCreated = 0;
  let reminderInsertFailures = 0;
  for (const task of (data ?? []) as TaskRow[]) {
    inspected += 1;
    const sla = calculateSla({
      taskType: task.task_type,
      priority: task.priority,
      createdAt: task.created_at,
      dueAt: task.due_at,
    }, now);
    const update: Record<string, string | number> = { sla_due_at: sla.dueAt, sla_warning_at: sla.warningAt };
    const nextLevel = nextEscalationLevel(task.escalation_level, sla.state);
    if (nextLevel > task.escalation_level) {
      const escalationClaim = await supabase
        .from("operational_tasks")
        .update({ ...update, escalation_level: nextLevel })
        .eq("id", task.id)
        .eq("organization_id", task.organization_id)
        .eq("escalation_level", task.escalation_level)
        .select("id")
        .maybeSingle();
      if (escalationClaim.error || !escalationClaim.data) continue;
      escalations += 1;
    } else {
      await supabase.from("operational_tasks").update(update).eq("id", task.id).eq("organization_id", task.organization_id);
    }
    if (sla.state === "ok") continue;
    const kind = sla.state === "expired" ? "overdue" : "sla_warning";
    const level = sla.state === "expired" ? nextLevel : task.escalation_level;
    const key = reminderKey(task, level, kind);
    if (task.id === injectedFailureTaskId) {
      reminderInsertFailures += 1;
      continue;
    }
    const reminder = await supabase.from("operation_reminders").insert({ organization_id: task.organization_id, task_id: task.id, reminder_type: kind, escalation_level: level, idempotency_key: key }).select("id").maybeSingle();
    if (reminder.error?.code === "23505") continue;
    if (reminder.error || !reminder.data) {
      reminderInsertFailures += 1;
      continue;
    }
    remindersCreated += 1;
    const title = kind === "overdue" ? `Просрочена задача: ${task.title}` : `SLA близок к истечению: ${task.title}`;
    const eventType = kind === "overdue" ? "task_overdue" : "task_due_soon";
    const eventWrite = await supabase.from("notification_events").upsert({ organization_id: task.organization_id, event_type: eventType, entity_type: "operational_task", entity_id: task.id, booking_id: null, apartment_id: null, payload: { taskId: task.id, taskType: task.task_type, priority: task.priority, escalationLevel: level, reminderType: kind }, idempotency_key: key, created_by_user_id: null }, { onConflict: "organization_id,idempotency_key", ignoreDuplicates: true });
    if (eventWrite.error) {
      await supabase.from("operation_reminders").delete().eq("id", reminder.data.id).eq("organization_id", task.organization_id);
      remindersCreated -= 1;
      continue;
    }
    const recipients = level === 0 ? [task.assigned_user_id] : (await supabase.from("organization_members").select("user_id").eq("organization_id", task.organization_id).eq("status", "active").in("role_code", level === 1 ? ["manager", "owner"] : ["owner"])).data?.map((row) => row.user_id) ?? [];
    const event = await supabase.from("notification_events").select("id").eq("organization_id", task.organization_id).eq("idempotency_key", key).single();
    if (!event.data || recipients.length === 0) {
      await supabase.from("operation_reminders").delete().eq("id", reminder.data.id).eq("organization_id", task.organization_id);
      remindersCreated -= 1;
      continue;
    }
    const notificationWrite = await supabase.from("notifications").upsert(recipients.map((userId) => ({ organization_id: task.organization_id, recipient_user_id: userId, event_id: event.data.id, title, message: kind === "overdue" ? "Требуется реакция и обновление статуса задачи." : "Проверьте задачу до истечения SLA.", action_url: "/tasks" })), { onConflict: "organization_id,event_id,recipient_user_id", ignoreDuplicates: true }).select("id");
    if (notificationWrite.error) {
      await supabase.from("operation_reminders").delete().eq("id", reminder.data.id).eq("organization_id", task.organization_id);
      remindersCreated -= 1;
      continue;
    }
    notificationsCreated += notificationWrite.data?.length ?? 0;
  }
  return NextResponse.json({ ok: true, inspected, remindersCreated, notificationsCreated, escalations, reminderInsertFailures }, { headers: { "Cache-Control": "no-store" } });
}