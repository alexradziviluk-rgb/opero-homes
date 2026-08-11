export type EmailSendInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type EmailSendResult = {
  ok: boolean;
  providerMessageId?: string;
  errorMessage?: string;
};

export interface EmailProvider {
  send(input: EmailSendInput): Promise<EmailSendResult>;
}

class ResendCompatibleEmailProvider implements EmailProvider {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly fromEmail: string;

  constructor(apiUrl: string, apiKey: string, fromEmail: string) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
    this.fromEmail = fromEmail;
  }

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const response = await fetch(`${this.apiUrl.replace(/\/$/, "")}/emails`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          from: this.fromEmail,
          to: [input.to],
          subject: input.subject,
          text: input.text,
          html: input.html,
        }),
      });
        clearTimeout(timeout);

      const payload = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;

      if (!response.ok) {
        return {
          ok: false,
          errorMessage: payload?.message ?? `Email provider responded with status ${response.status}`,
        };
      }

      return {
        ok: true,
        providerMessageId: payload?.id,
      };
    } catch (error) {
      return {
        ok: false,
        errorMessage: error instanceof Error ? error.message : "Unknown email provider error",
      };
    }
  }
}

class UnavailableEmailProvider implements EmailProvider {
  async send(): Promise<EmailSendResult> {
    return {
      ok: false,
      errorMessage: "Email provider is not configured",
    };
  }
}

export function createEmailProvider(): EmailProvider {
  const apiUrl = process.env.NOTIFICATIONS_EMAIL_API_URL ?? process.env.RESEND_API_URL ?? "https://api.resend.com";
  const apiKey = process.env.NOTIFICATIONS_EMAIL_API_KEY ?? process.env.RESEND_API_KEY;
  const fromEmail = process.env.NOTIFICATIONS_EMAIL_FROM;

  if (!apiKey || !fromEmail) {
    return new UnavailableEmailProvider();
  }

  return new ResendCompatibleEmailProvider(apiUrl, apiKey, fromEmail);
}
