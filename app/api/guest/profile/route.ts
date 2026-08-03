import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServerAuthState } from "@/lib/supabase/server-auth";

function isGuestRole(role: string | null | undefined): boolean {
  const normalized = (role ?? "").trim().toLowerCase();
  return normalized === "guest" || normalized === "гость";
}

function getText(value: unknown): string | null {
  return typeof value === "string" ? value.trim() : null;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function authorizeGuest() {
  const authState = await getServerAuthState();
  if (!authState.isAuthenticated) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 }) };
  }

  if (!authState.context || !isGuestRole(authState.context.profile.role)) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Guest access required" }, { status: 403 }) };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 500 }) };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 }) };
  }

  return { ok: true as const, supabase, user, profile: authState.context.profile };
}

export async function GET() {
  const auth = await authorizeGuest();
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    ok: true,
    data: {
      firstName: auth.profile.first_name ?? "",
      lastName: auth.profile.last_name ?? "",
      email: auth.profile.email ?? auth.user.email ?? "",
      phone: auth.profile.phone ?? "",
      address: auth.profile.address ?? "",
    },
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await authorizeGuest();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const firstName = getText(body?.firstName);
  const lastName = getText(body?.lastName);
  const email = getText(body?.email)?.toLowerCase() ?? null;
  const phone = getText(body?.phone) ?? "";
  const address = getText(body?.address) ?? "";

  if (!firstName || !lastName || !email || !isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: "Укажите имя, фамилию и корректный email" }, { status: 400 });
  }

  if (firstName.length > 100 || lastName.length > 100 || email.length > 255 || phone.length > 50 || address.length > 500) {
    return NextResponse.json({ ok: false, error: "Проверьте длину введённых данных" }, { status: 400 });
  }

  const currentEmail = (auth.user.email ?? auth.profile.email ?? "").trim().toLowerCase();
  if (email !== currentEmail) {
    const { error } = await auth.supabase.auth.updateUser({ email });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
    }
  }

  const { data, error } = await auth.supabase
    .from("profiles")
    .update({
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      address,
      updated_at: new Date().toISOString(),
    })
    .eq("id", auth.user.id)
    .select("first_name,last_name,email,phone,address")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    data: {
      firstName: data.first_name ?? "",
      lastName: data.last_name ?? "",
      email: data.email ?? email,
      phone: data.phone ?? "",
      address: data.address ?? "",
    },
    emailConfirmationRequired: email !== currentEmail,
  });
}
