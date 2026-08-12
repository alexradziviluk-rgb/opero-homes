import { NextResponse } from "next/server";
import { createEmailProvider } from "@/lib/notifications/providers/email-provider";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import { normalizeRoleCode } from "@/lib/supabase/role-code";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function errorResponse(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

type DirectoryOwner = { guest_id?: string | null; user_id?: string | null; owner_email?: string | null };
type DirectoryRow = DirectoryOwner & Record<string, unknown>;
type OwnerIdentity = { guestId: string | null; userId: string | null; guestOrganizationId: string | null; profileEmail: string | null };

async function resolveGuestIdForAssignment(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  organizationId: string,
  candidateGuestId: string | null | undefined,
  userId: string | null | undefined,
  ownerEmail: string | null | undefined,
): Promise<OwnerIdentity> {
  const lookupClient = createSupabaseServiceRoleClient() ?? supabase;
  const normalizedUserId = userId?.trim() || null;

  if (normalizedUserId) {
    const { data: authUser, error: authUserError } = await lookupClient.schema("auth").from("users").select("id,email").eq("id", normalizedUserId).maybeSingle();
    if (!authUserError && authUser?.id) {
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("id,email")
        .eq("id", normalizedUserId)
        .maybeSingle();

      return {
        guestId: null,
        userId: normalizedUserId,
        guestOrganizationId: null,
        profileEmail: (ownerEmail?.trim() || profileRow?.email?.trim() || authUser.email?.trim() || null) || null,
      };
    }

    return { guestId: null, userId: normalizedUserId, guestOrganizationId: null, profileEmail: ownerEmail?.trim() || null };
  }

  const candidateIds = [candidateGuestId].filter((value): value is string => Boolean(value));

  for (const candidateId of candidateIds) {
    const { data: guestRow } = await lookupClient.from("guests").select("id, organization_id").eq("id", candidateId).maybeSingle();
    if (!guestRow?.id) continue;
    return { guestId: guestRow.id, userId: null, guestOrganizationId: guestRow.organization_id ?? null, profileEmail: null };
  }

  if (ownerEmail) {
    const normalizedEmail = ownerEmail.trim();
    const { data: guestRows, error: lookupError } = await lookupClient.from("guests").select("id, organization_id").ilike("email", normalizedEmail).order("created_at", { ascending: false }).limit(1);
    if (!lookupError && guestRows?.[0]?.id) {
      return { guestId: guestRows[0].id, userId: null, guestOrganizationId: guestRows[0].organization_id ?? null, profileEmail: null };
    }
  }

  return { guestId: null, userId: null, guestOrganizationId: null, profileEmail: null };
}

export async function GET(request: Request) {
  const auth = await requireStaffApiAuth();
  if (!auth.ok) return auth.response;
  if (!["owner", "manager"].includes(normalizeRoleCode(auth.context.organizationMember.role_code))) return errorResponse(403, "Недостаточно прав.");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return errorResponse(500, "Supabase is not configured");
  const lookupClient = createSupabaseServiceRoleClient() ?? supabase;
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const { data, error } = await supabase.rpc("search_property_owners", { target_organization_id: auth.context.organization.id, target_query: query });
  if (error) return errorResponse(422, error.message);

  const rows = ((data ?? []) as DirectoryRow[]).map((row) => ({
    ...row,
    guest_id: (row.guest_id as string | null | undefined) ?? null,
    user_id: (row.user_id as string | null | undefined) ?? null,
    owner_email: (row.owner_email as string | null | undefined) ?? null,
  }));

  const normalizedSearch = (query || "").trim();
  const profileMatches = normalizedSearch
    ? await lookupClient.from("profiles").select("id, email, first_name, last_name, phone, owner_public_number").or(`email.ilike.%${normalizedSearch}%,first_name.ilike.%${normalizedSearch}%,last_name.ilike.%${normalizedSearch}%,phone.ilike.%${normalizedSearch}%,owner_public_number.ilike.%${normalizedSearch}%`).limit(25)
    : await lookupClient.from("profiles").select("id, email, first_name, last_name, phone, owner_public_number").limit(25);

  const profileResults = await Promise.all((profileMatches.data ?? []).map(async (profile) => {
    const { count, error: countError } = await lookupClient.from("apartment_owner_access").select("apartment_id", { count: "exact", head: true }).eq("organization_id", auth.context.organization.id).eq("user_id", profile.id).in("status", ["invited", "active", "paused"]);
    if (countError) return null;
    return {
      guest_id: null,
      user_id: profile.id,
      owner_public_number: profile.owner_public_number ?? null,
      owner_name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || (profile.email ?? "Собственник"),
      owner_email: profile.email ?? null,
      owner_phone: profile.phone ?? null,
      apartment_count: count ?? 0,
    } as DirectoryRow;
  }));

  const mergedRows: DirectoryRow[] = [...rows];
  for (const row of profileResults.filter(Boolean) as DirectoryRow[]) mergedRows.push(row);

  const enriched = await Promise.all(mergedRows.map(async (row) => {
    const normalizedRow: DirectoryRow = {
      ...row,
      guest_id: (row.guest_id as string | null | undefined) ?? null,
      user_id: (row.user_id as string | null | undefined) ?? null,
      owner_email: (row.owner_email as string | null | undefined) ?? null,
    };
    if (normalizedRow.guest_id || !normalizedRow.owner_email) return { ...normalizedRow, guest_id: normalizedRow.guest_id ?? null };
    const { data: guestRow } = await supabase.from("guests").select("id").eq("organization_id", auth.context.organization.id).ilike("email", normalizedRow.owner_email).maybeSingle();
    return { ...normalizedRow, guest_id: guestRow?.id ?? null };
  }));

  const deduplicated = Array.from(new Map(enriched.map((row) => [`${row.guest_id ?? "guest"}:${row.user_id ?? "user"}:${row.owner_email ?? ""}`, row])).values());

  return NextResponse.json({ ok: true, data: deduplicated as DirectoryOwner[] }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireStaffApiAuth();
  if (!auth.ok) return auth.response;
  if (!["owner", "manager"].includes(normalizeRoleCode(auth.context.organizationMember.role_code))) return errorResponse(403, "Недостаточно прав.");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return errorResponse(500, "Supabase is not configured");
  const body = await request.json().catch(() => null) as { apartmentId?: string; guestId?: string; userId?: string; ownerEmail?: string } | null;
  const hasIdentity = Boolean(body?.guestId || body?.userId || body?.ownerEmail);
  if (!body?.apartmentId || !hasIdentity) return errorResponse(400, "Укажите квартиру и клиента.");

  const resolvedIdentity = await resolveGuestIdForAssignment(supabase, auth.context.organization.id, body.guestId ?? null, body.userId ?? null, body.ownerEmail ?? null);
  if (!resolvedIdentity.guestId && !resolvedIdentity.userId) return errorResponse(400, "Укажите клиента, который уже есть в базе.");

  const lookupClient = createSupabaseServiceRoleClient() ?? supabase;
  const [{ data: apartment }, userProfileResult, guestProfileResult] = await Promise.all([
    supabase.from("apartments").select("title").eq("id", body.apartmentId).eq("organization_id", auth.context.organization.id).single(),
    resolvedIdentity.userId
      ? lookupClient.from("profiles").select("id, email, first_name, last_name, phone").eq("id", resolvedIdentity.userId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    resolvedIdentity.userId
      ? supabase.from("apartment_owner_access").select("user_id, owner_name, owner_email, owner_phone").eq("organization_id", auth.context.organization.id).eq("user_id", resolvedIdentity.userId).order("created_at", { ascending: false }).limit(1).maybeSingle()
      : lookupClient.from("guests").select("id,organization_id,first_name,last_name,email,phone").eq("id", resolvedIdentity.guestId as string).single(),
  ]);

  type ProfileRecord = { id?: string; first_name?: string | null; last_name?: string | null; email: string; phone?: string | null };
  type ExistingAccessRecord = { user_id?: string | null; owner_name?: string | null; owner_email?: string | null; owner_phone?: string | null };

  let profile: ProfileRecord | null = null;
  if (resolvedIdentity.userId) {
    const profileRow = (userProfileResult?.data as ProfileRecord | null) ?? null;
    const accessOwner = (guestProfileResult?.data && "owner_email" in guestProfileResult.data) ? guestProfileResult.data as ExistingAccessRecord : null;
    const ownerName = profileRow
      ? ((profileRow.first_name ?? "") + " " + (profileRow.last_name ?? "")).trim()
      : "";
    const resolvedOwnerName = ownerName || (accessOwner?.owner_name ?? "").trim();
    const [firstName, ...rest] = resolvedOwnerName ? resolvedOwnerName.split(/\s+/) : [];
    const fallbackEmail = (profileRow?.email ?? body.ownerEmail ?? accessOwner?.owner_email ?? "").trim();
    if (fallbackEmail) {
      profile = {
        id: resolvedIdentity.userId,
        first_name: firstName ?? "",
        last_name: rest.join(" ") || "",
        email: fallbackEmail,
        phone: profileRow?.phone ?? accessOwner?.owner_phone ?? null,
      };
    }
  } else if (guestProfileResult?.data && "email" in guestProfileResult.data) {
    profile = guestProfileResult.data as ProfileRecord;
  }

  if (!apartment) return errorResponse(404, "Квартира не найдена.");
  if (!profile) return errorResponse(404, "Клиент не найден.");
  if (resolvedIdentity.guestId && resolvedIdentity.guestOrganizationId && resolvedIdentity.guestOrganizationId !== auth.context.organization.id) {
    return errorResponse(400, "Клиент уже привязан к другой организации.");
  }

  let assigned = false;
  try {
    if (resolvedIdentity.userId) {
      const { data, error } = await supabase.rpc("assign_existing_property_owner", { target_organization_id: auth.context.organization.id, target_apartment_id: body.apartmentId, target_user_id: resolvedIdentity.userId });
      if (error) throw error;
      assigned = Boolean(data);
    } else {
      const { data, error } = await supabase.rpc("assign_registered_client_as_property_owner", { target_organization_id: auth.context.organization.id, target_apartment_id: body.apartmentId, target_guest_id: resolvedIdentity.guestId as string });
      if (error) {
        const hasMissingFunction = /Could not find the function|does not exist|schema cache/i.test(error.message || "");
        if (!hasMissingFunction) throw error;
        const { data: existingAccess, error: lookupError } = await supabase.from("apartment_owner_access").select("id").eq("organization_id", auth.context.organization.id).eq("apartment_id", body.apartmentId).ilike("owner_email", profile.email).maybeSingle();
        if (lookupError) throw lookupError;
        if (existingAccess) {
          const { error: updateError } = await supabase.from("apartment_owner_access").update({ guest_id: resolvedIdentity.guestId, user_id: body.userId ?? null, owner_name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email.split("@")[0], owner_phone: profile.phone ?? null, status: "active", updated_at: new Date().toISOString() }).eq("id", existingAccess.id);
          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await supabase.from("apartment_owner_access").insert({
            organization_id: auth.context.organization.id,
            apartment_id: body.apartmentId,
            guest_id: resolvedIdentity.guestId,
            user_id: body.userId ?? null,
            owner_name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email.split("@")[0],
            owner_email: profile.email,
            owner_phone: profile.phone ?? null,
            status: "active",
          });
          if (insertError) throw insertError;
        }
        assigned = true;
      } else {
        assigned = Boolean(data);
      }
    }
  } catch (error) {
    const rawError = error && typeof error === "object" ? error : { message: String(error ?? "Не удалось привязать собственника") };
    const errorDetails = {
      name: "name" in rawError ? (rawError as { name?: string }).name : "UnknownError",
      message: typeof (rawError as { message?: string }).message === "string" ? (rawError as { message?: string }).message : "Не удалось привязать собственника",
      code: "code" in rawError ? (rawError as { code?: string }).code : null,
      details: "details" in rawError ? (rawError as { details?: unknown }).details : null,
      hint: "hint" in rawError ? (rawError as { hint?: string }).hint : null,
      stack: error instanceof Error ? error.stack : null,
    };
    const message = errorDetails.message || "Не удалось привязать собственника";
    return errorResponse(message.includes("CLIENT_NOT_FOUND") ? 404 : 422, message);
  }

  let notificationSent = false;
  if (profile.email && apartment.title) {
    const ownerName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "собственник";
    const subject = `Вас привязали как собственника к объекту «${apartment.title}»`;
    const text = [`Здравствуйте, ${ownerName}.`, "", `Вы привязаны как собственник к объекту «${apartment.title}».`, `Организация: ${auth.context.organization.name}.`].join("\n");
    const emailResult = await createEmailProvider().send({ to: profile.email, subject, text, html: `<p>Здравствуйте, ${ownerName}.</p><p>Вы привязаны как собственник к объекту <strong>${apartment.title}</strong>.</p><p>Организация: ${auth.context.organization.name}.</p>` });
    notificationSent = emailResult.ok;
  }

  return NextResponse.json({ ok: true, data: { assigned, notificationSent } }, { status: 201 });
}
