import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createEmailProvider } from "@/lib/notifications/providers/email-provider";
import { requireStaffApiAuth } from "@/lib/supabase/api-auth";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

type RegistrationBody = {
  firstName?: unknown;
  lastName?: unknown;
  dateOfBirth?: unknown;
  phone?: unknown;
  email?: unknown;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function errorResponse(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  const auth = await requireStaffApiAuth();
  if (!auth.ok) return auth.response;

  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) return errorResponse(500, "Регистрация клиента временно недоступна.");

  const body = await request.json().catch(() => null) as RegistrationBody | null;
  const firstName = text(body?.firstName);
  const lastName = text(body?.lastName);
  const dateOfBirth = text(body?.dateOfBirth);
  const phone = text(body?.phone);
  const email = text(body?.email).toLowerCase();

  if (!firstName || !lastName || !dateOfBirth || !phone || !EMAIL.test(email)) {
    return errorResponse(400, "Заполните имя, фамилию, дату рождения, телефон и корректный email.");
  }

  const parsedDate = new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate >= new Date()) {
    return errorResponse(400, "Укажите корректную дату рождения.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("guests")
    .select("id")
    .eq("organization_id", auth.context.organization.id)
    .ilike("email", email)
    .maybeSingle();
  if (existingError) return errorResponse(422, "Не удалось проверить существующего клиента.");
  if (existing) return errorResponse(409, "Клиент с таким email уже зарегистрирован.");

  const { data: guest, error: guestError } = await supabase
    .from("guests")
    .insert({ organization_id: auth.context.organization.id, first_name: firstName, last_name: lastName, date_of_birth: dateOfBirth, phone, email, email_verified: false })
    .select("id")
    .single();
  if (guestError || !guest) return errorResponse(422, "Не удалось создать клиента.");

  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const { error: tokenError } = await supabase.from("client_email_verifications").insert({ guest_id: guest.id, email, token_hash: tokenHash(rawToken), expires_at: expiresAt });
  if (tokenError) {
    await supabase.from("guests").delete().eq("id", guest.id);
    return errorResponse(422, "Не удалось подготовить подтверждение email.");
  }

  const verificationUrl = `${new URL(request.url).origin}/clients/verify-email?token=${encodeURIComponent(rawToken)}`;
  const emailResult = await createEmailProvider().send({
    to: email,
    subject: "Подтвердите email в Opero Homes",
    text: [`Здравствуйте, ${firstName}.`, "", "Чтобы завершить регистрацию клиента, подтвердите email:", verificationUrl, "", `Ссылка действует до: ${new Date(expiresAt).toLocaleString("ru-RU")}.`].join("\n"),
    html: `<p>Здравствуйте, ${firstName}.</p><p>Чтобы завершить регистрацию клиента, подтвердите email:</p><p><a href="${verificationUrl}">Подтвердить email</a></p><p>Ссылка действует до ${new Date(expiresAt).toLocaleString("ru-RU")}.</p>`,
  });

  if (!emailResult.ok) {
    return NextResponse.json({ ok: true, data: { email, emailVerified: false, verificationExpiresAt: expiresAt, notificationSent: false, notificationError: emailResult.errorMessage ?? "Email provider unavailable" } }, { status: 201 });
  }

  return NextResponse.json({ ok: true, data: { email, emailVerified: false, verificationExpiresAt: expiresAt, notificationSent: true } }, { status: 201 });
}
