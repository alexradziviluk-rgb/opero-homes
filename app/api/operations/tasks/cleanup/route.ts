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

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: tasks, error: queryError } = await supabase
    .from("operational_tasks")
    .select("id,organization_id,apartment_id,booking_id,title,description,task_type,priority,status,assigned_user_id,due_at,created_by,completed_at,created_at,updated_at")
    .eq("organization_id", auth.context.organization.id)
    .in("status", ["completed", "verified"])
    .not("completed_at", "is", null)
    .lte("completed_at", cutoff);
  if (queryError) return error(422, queryError.message);
  if (!tasks?.length) return NextResponse.json({ ok: true, archived: 0 });

  const { error: archiveError } = await supabase.from("operational_task_archive").upsert(tasks.map((task) => {
    const { id, ...taskData } = task;
    return { task_id: id, ...taskData };
  }), { onConflict: "organization_id,task_id" });
  if (archiveError) return error(422, archiveError.message);

  const { error: deleteError } = await supabase
    .from("operational_tasks")
    .delete()
    .eq("organization_id", auth.context.organization.id)
    .in("id", tasks.map((task) => task.id));
  if (deleteError) return error(422, deleteError.message);

  return NextResponse.json({ ok: true, archived: tasks.length });
}
