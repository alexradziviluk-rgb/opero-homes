import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupportTicket } from "@/lib/support/service";
import type { SupportHandoff, SupportPriority } from "@/lib/support/types";
import type { AIContext } from "./types";
import type { AiIntent, AiIntentClassification } from "./intent";

export type AiOperationalActionResult = {
  ok: boolean;
  intent: AiIntent;
  action: string;
  taskReference?: string;
  ticketReference?: string;
  duplicate?: boolean;
  fallbackUsed?: boolean;
  reason?: "not_authenticated" | "booking_not_found" | "apartment_not_found" | "assignee_not_found" | "action_failed";
};

type BookingContext = {
  id: string;
  apartment_id: string;
  check_in_date: string;
  check_out_date: string;
  status: string;
  payment_status: string;
  guest_name: string;
  total_amount: number | null;
};

type ApartmentContext = {
  id: string;
  name: string | null;
  responsible_user_id: string | null;
  backup_manager_user_id: string | null;
};

function categoryForIntent(intent: AiIntent): "maintenance" | "cleaning" {
  return intent === "CLEANING" ? "cleaning" : "maintenance";
}

function taskTypeForIntent(intent: AiIntent): "cleaning" | "linen" | "technical" {
  return intent === "CLEANING" ? "cleaning" : "technical";
}

function safeTaskTitle(classification: AiIntentClassification): string {
  return classification.intent === "CLEANING" ? "Opero AI: уборка или принадлежности" : classification.priority === "urgent" ? "Opero AI: срочная проблема на объекте" : "Opero AI: техническая проблема на объекте";
}

function actionSummary(classification: AiIntentClassification, message: string): string {
  return `${classification.subject}. Запрос клиента: ${message.slice(0, 500)}`;
}

async function audit(params: {
  supabase: SupabaseClient;
  context: AIContext;
  conversationId: string;
  classification: AiIntentClassification;
  actionResult: string;
  ticketReference?: string;
  taskReference?: string;
  fallbackUsed: boolean;
  metadata?: Record<string, unknown>;
}) {
  await params.supabase.from("ai_operation_audit").insert({
    organization_id: params.context.organizationId,
    actor_user_id: params.context.userId,
    conversation_id: params.conversationId || null,
    intent: params.classification.intent,
    action: params.classification.action,
    action_result: params.actionResult,
    ticket_reference: params.ticketReference ?? null,
    task_reference: params.taskReference ?? null,
    fallback_used: params.fallbackUsed,
    metadata: params.metadata ?? {},
  });
}

async function findBooking(supabase: SupabaseClient, context: AIContext): Promise<BookingContext | null> {
  if (!context.userId || !context.organizationId || !context.email) return null;
  const { data: guest } = await supabase.from("guests").select("id").eq("organization_id", context.organizationId).ilike("email", context.email).maybeSingle();
  if (!guest?.id) return null;
  const { data } = await supabase
    .from("bookings")
    .select("id,apartment_id,check_in_date,check_out_date,status,payment_status,guest_name,total_amount")
    .eq("organization_id", context.organizationId)
    .eq("primary_guest_id", guest.id)
    .not("apartment_id", "is", null)
    .not("status", "in", "(cancelled,rejected,declined)")
    .order("check_in_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data as BookingContext | null;
}

async function findApartment(supabase: SupabaseClient, context: AIContext, apartmentId: string): Promise<ApartmentContext | null> {
  if (!context.organizationId) return null;
  const { data } = await supabase.from("apartments").select("id,name,responsible_user_id,backup_manager_user_id").eq("organization_id", context.organizationId).eq("id", apartmentId).maybeSingle();
  return data as ApartmentContext | null;
}

async function findAssignee(supabase: SupabaseClient, organizationId: string, apartment: ApartmentContext, kind: "cleaning" | "maintenance"): Promise<string | null> {
  const preferred = [apartment.responsible_user_id, apartment.backup_manager_user_id].filter((value): value is string => Boolean(value));
  if (preferred.length) {
    const { data } = await supabase.from("organization_members").select("user_id").eq("organization_id", organizationId).eq("status", "active").in("user_id", preferred).limit(1).maybeSingle();
    if (data?.user_id) return data.user_id;
  }
  const roles = kind === "cleaning" ? ["cleaner", "manager", "owner"] : ["maintenance", "manager", "owner"];
  const { data } = await supabase.from("organization_members").select("user_id,role_code").eq("organization_id", organizationId).eq("status", "active").in("role_code", roles).order("role_code", { ascending: true }).limit(10);
  const rows = (data ?? []) as Array<{ user_id: string; role_code: string }>;
  return roles.map((role) => rows.find((row) => row.role_code.trim().toLowerCase() === role)?.user_id).find(Boolean) ?? null;
}

function makeHandoff(classification: AiIntentClassification, message: string): SupportHandoff {
  return {
    offered: false,
    requiresConfirmation: false,
    critical: classification.priority === "urgent",
    category: categoryForIntent(classification.intent),
    priority: classification.priority,
    subject: classification.subject,
    summary: actionSummary(classification, message),
    actionId: randomUUID(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };
}

export async function executeAiOperationalAction(params: {
  supabase: SupabaseClient;
  context: AIContext;
  conversationId: string;
  message: string;
  classification: AiIntentClassification;
}): Promise<AiOperationalActionResult> {
  const { context, classification, message, supabase } = params;
  if (!context.userId || !context.organizationId) {
    await audit({ ...params, actionResult: "not_authenticated", fallbackUsed: true });
    return { ok: false, intent: classification.intent, action: classification.action, fallbackUsed: true, reason: "not_authenticated" };
  }

  const booking = await findBooking(supabase, context);
  if (!booking) {
    await audit({ ...params, actionResult: "booking_not_found", fallbackUsed: true });
    return { ok: false, intent: classification.intent, action: classification.action, fallbackUsed: true, reason: "booking_not_found" };
  }
  const apartment = await findApartment(supabase, context, booking.apartment_id);
  if (!apartment) {
    await audit({ ...params, actionResult: "apartment_not_found", fallbackUsed: true });
    return { ok: false, intent: classification.intent, action: classification.action, fallbackUsed: true, reason: "apartment_not_found" };
  }
  const kind = categoryForIntent(classification.intent);
  const assigneeId = await findAssignee(supabase, context.organizationId, apartment, kind);
  if (!assigneeId) {
    await audit({ ...params, actionResult: "assignee_not_found", fallbackUsed: true });
    return { ok: false, intent: classification.intent, action: classification.action, fallbackUsed: true, reason: "assignee_not_found" };
  }

  const idempotencyKey = `ai-phase2:${context.userId}:${booking.id}:${classification.intent}`;
  const { data: existingTask } = await supabase.from("operational_tasks").select("id,support_ticket_id,status").eq("organization_id", context.organizationId).eq("ai_idempotency_key", idempotencyKey).not("status", "in", "(completed,verified,cancelled)").maybeSingle();
  if (existingTask) {
    await audit({ ...params, actionResult: "duplicate", taskReference: existingTask.id.slice(0, 8), fallbackUsed: false, metadata: { status: existingTask.status } });
    return { ok: true, intent: classification.intent, action: classification.action, taskReference: existingTask.id.slice(0, 8), ticketReference: existingTask.support_ticket_id ? String(existingTask.support_ticket_id).slice(0, 8) : undefined, duplicate: true };
  }

  let ticketReference: string | undefined;
  try {
    const ticket = await createSupportTicket({ supabase, context, message, route: context.route, handoff: makeHandoff(classification, message), idempotencyKey, apartmentId: apartment.id, bookingId: booking.id });
    ticketReference = ticket.ticket.public_number;
    const { data: task, error: taskError } = await supabase.from("operational_tasks").insert({ organization_id: context.organizationId, apartment_id: apartment.id, booking_id: booking.id, support_ticket_id: ticket.ticket.id, title: safeTaskTitle(classification), description: actionSummary(classification, message), task_type: taskTypeForIntent(classification.intent), priority: classification.priority as SupportPriority, status: "assigned", assigned_user_id: assigneeId, due_at: new Date(Date.now() + (classification.priority === "urgent" ? 30 : 120) * 60 * 1000).toISOString(), created_by: context.userId, ai_idempotency_key: idempotencyKey }).select("id").single();
    if (taskError || !task) throw new Error("task_create_failed");
    await supabase.from("operational_task_assignees").upsert({ task_id: task.id, user_id: assigneeId }, { onConflict: "task_id,user_id" });
    await audit({ ...params, actionResult: "created", ticketReference: ticket.ticket.public_number, taskReference: task.id.slice(0, 8), fallbackUsed: false });
    return { ok: true, intent: classification.intent, action: classification.action, taskReference: task.id.slice(0, 8), ticketReference: ticket.ticket.public_number, duplicate: false };
  } catch {
    await audit({ ...params, actionResult: "failed", ticketReference, fallbackUsed: true });
    return { ok: false, intent: classification.intent, action: classification.action, ticketReference, fallbackUsed: true, reason: "action_failed" };
  }
}
