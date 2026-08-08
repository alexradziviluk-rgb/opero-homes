import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";

function canBeResponsible(roleCode: string): boolean {
  const role = roleCode.trim().toLowerCase();
  return ["owner", "manager", "employee", "cleaner", "maintenance"].includes(role);
}

function canBeBackupManager(roleCodes: string[]): boolean {
  return roleCodes.some((roleCode) => ["owner", "manager"].includes(roleCode.trim().toLowerCase()));
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 500 });
  }

  const auth = await requireStaffApiAuth();
  if (!auth.ok) {
    return auth.response;
  }

  const { data: members, error: membersError } = await supabase
    .from("organization_members")
    .select("user_id,role_code,additional_role_codes")
    .eq("organization_id", auth.context.organization.id)
    .eq("status", "active");

  if (membersError) {
    return NextResponse.json({ ok: false, error: membersError.message }, { status: 422 });
  }

  const memberRows = (members ?? []) as Array<{ user_id: string; role_code: string; additional_role_codes: string[] | null }>;
  const userIds = memberRows.map((member) => member.user_id);

  if (userIds.length === 0) {
    return NextResponse.json({ ok: true, data: { responsible: [], backupManagers: [] } });
  }

  type ProfileRow = { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; status: string | null; last_seen_at?: string | null };

  const extendedProfiles = await supabase
    .from("profiles")
    .select("id,first_name,last_name,email,phone,status,last_seen_at")
    .in("id", userIds);

  let profiles = extendedProfiles.data as ProfileRow[] | null;
  let profilesError = extendedProfiles.error;

  if (profilesError?.code === "42703") {
    const fallback = await supabase
      .from("profiles")
      .select("id,first_name,last_name,email,phone,status")
      .in("id", userIds);
    profiles = fallback.data as ProfileRow[] | null;
    profilesError = fallback.error;
  }

  if (profilesError) {
    return NextResponse.json({ ok: false, error: profilesError.message }, { status: 422 });
  }

  const profileMap = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile]),
  );

  const mapped = memberRows
    .map((member) => {
      const profile = profileMap.get(member.user_id);
      return {
        userId: member.user_id,
        roleCode: member.role_code,
        additionalRoleCodes: member.additional_role_codes ?? [],
        firstName: profile?.first_name ?? "",
        lastName: profile?.last_name ?? "",
        email: profile?.email ?? "",
        phone: profile?.phone ?? "",
        status: profile?.status ?? "",
        lastSeenAt: profile?.last_seen_at ?? null,
      };
    })
    .filter((item) => Boolean(item.userId));

  const responsible = mapped.filter((item) => canBeResponsible(item.roleCode));
  const backupManagers = mapped.filter((item) => canBeBackupManager([item.roleCode, ...item.additionalRoleCodes]));

  return NextResponse.json({
    ok: true,
    data: {
      responsible,
      backupManagers,
    },
  });
}
