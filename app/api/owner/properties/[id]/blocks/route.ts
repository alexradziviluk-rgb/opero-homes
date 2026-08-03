import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePropertyOwnerApiAuth } from "@/lib/supabase/api-auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REASONS = new Set(["owner_stay", "family_or_guests", "renovation", "maintenance", "unavailable", "other"]);

type RouteContext = { params: Promise<{ id: string }> };
type PeriodRow = { start_date: string; end_date: string; status: string };
type BlockRow = { id: string; apartment_id: string; start_date: string; end_date: string; reason_code: string; status: string; created_at: string; updated_at: string };

function publicBlock(block: BlockRow) {
  return {
    id: block.id,
    apartmentId: block.apartment_id,
    startDate: block.start_date,
    endDate: block.end_date,
    reasonCode: block.reason_code,
    status: block.status,
    createdAt: block.created_at,
    updatedAt: block.updated_at,
  };
}

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function getContext(context: RouteContext) {
  const { id } = await context.params;
  if (!UUID.test(id)) return { id: "", auth: null, supabase: null, response: errorResponse("Invalid apartment id") };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { id, auth: null, supabase: null, response: errorResponse("Supabase is not configured", 500) };
  const auth = await requirePropertyOwnerApiAuth();
  if (!auth.ok) return { id, auth: null, supabase, response: auth.response };
  return { id, auth, supabase, response: null };
}

export async function GET(_request: Request, context: RouteContext) {
  const resolved = await getContext(context);
  if (resolved.response || !resolved.supabase) return resolved.response;

  const [periods, blocks] = await Promise.all([
    resolved.supabase.rpc("get_property_owner_occupied_periods", { target_apartment_id: resolved.id }),
    resolved.supabase.from("availability_blocks").select("id,apartment_id,start_date,end_date,reason_code,private_note,status,created_by,created_by_role,created_at,updated_at").eq("apartment_id", resolved.id).eq("created_by", resolved.auth.context.authUserId).order("start_date", { ascending: true }),
  ]);

  if (periods.error) return errorResponse(periods.error.message, 422);
  if (blocks.error) return errorResponse(blocks.error.message, 422);

  return NextResponse.json({
    ok: true,
    data: {
      occupied: ((periods.data ?? []) as PeriodRow[]).filter((period) => period.status === "occupied"),
      blocked: ((periods.data ?? []) as PeriodRow[]).filter((period) => period.status === "blocked"),
      ownBlocks: ((blocks.data ?? []) as BlockRow[]).map(publicBlock),
    },
  });
}

export async function POST(request: Request, context: RouteContext) {
  const resolved = await getContext(context);
  if (resolved.response || !resolved.supabase) return resolved.response;
  const body = await request.json().catch(() => null) as { startDate?: string; endDate?: string; reasonCode?: string; privateNote?: string } | null;
  if (!body?.startDate || !body.endDate || !body.reasonCode || !REASONS.has(body.reasonCode)) return errorResponse("Invalid block payload");

  const { data, error } = await resolved.supabase.rpc("create_property_owner_block", {
    target_apartment_id: resolved.id,
    target_start_date: body.startDate,
    target_end_date: body.endDate,
    target_reason_code: body.reasonCode,
    target_private_note: body.privateNote ?? null,
  });
  if (error) {
    const conflict = error.message.toLowerCase().includes("conflict");
    return errorResponse(conflict ? "На выбранные даты уже существует бронирование или блокировка. Свяжитесь с Opero Homes." : error.message, conflict ? 409 : 422);
  }
  return NextResponse.json({ ok: true, data: publicBlock(data as BlockRow) }, { status: 201 });
}

export async function PATCH(request: Request, context: RouteContext) {
  const resolved = await getContext(context);
  if (resolved.response || !resolved.supabase) return resolved.response;
  const body = await request.json().catch(() => null) as { blockId?: string; startDate?: string; endDate?: string; reasonCode?: string; privateNote?: string } | null;
  if (!body?.blockId || !UUID.test(body.blockId) || !body.startDate || !body.endDate || !body.reasonCode || !REASONS.has(body.reasonCode)) return errorResponse("Invalid block payload");

  const { data, error } = await resolved.supabase.rpc("update_property_owner_block", {
    target_block_id: body.blockId,
    target_start_date: body.startDate,
    target_end_date: body.endDate,
    target_reason_code: body.reasonCode,
    target_private_note: body.privateNote ?? null,
  });
  if (error) {
    const conflict = error.message.toLowerCase().includes("conflict");
    return errorResponse(conflict ? "На выбранные даты уже существует бронирование или блокировка. Свяжитесь с Opero Homes." : error.message, conflict ? 409 : 422);
  }
  return NextResponse.json({ ok: true, data: publicBlock(data as BlockRow) });
}

export async function DELETE(request: Request, context: RouteContext) {
  const resolved = await getContext(context);
  if (resolved.response || !resolved.supabase) return resolved.response;
  const blockId = new URL(request.url).searchParams.get("blockId") ?? "";
  if (!UUID.test(blockId)) return errorResponse("Invalid block id");

  const { data, error } = await resolved.supabase.rpc("cancel_property_owner_block", { target_block_id: blockId });
  if (error) return errorResponse(error.message, 422);
  if (!data) return errorResponse("Block not found or cannot be cancelled", 404);
  return NextResponse.json({ ok: true });
}
