export type WhatsAppSendInput = {
  destinationPhoneE164: string;
  templateKey: string;
  variables: Record<string, string>;
};

export type WhatsAppSendResult = {
  ok: boolean;
  providerMessageId?: string;
  errorMessage?: string;
};

export interface WhatsAppProvider {
  sendTemplate(input: WhatsAppSendInput): Promise<WhatsAppSendResult>;
}

class OfficialWhatsAppProvider implements WhatsAppProvider {
  private readonly apiUrl: string;
  private readonly apiToken: string;

  constructor(apiUrl: string, apiToken: string) {
    this.apiUrl = apiUrl;
    this.apiToken = apiToken;
  }

  async sendTemplate(input: WhatsAppSendInput): Promise<WhatsAppSendResult> {
    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiToken}`,
        },
        body: JSON.stringify({
          to: input.destinationPhoneE164,
          template: input.templateKey,
          variables: input.variables,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;

      if (!response.ok) {
        return {
          ok: false,
          errorMessage: payload?.message ?? `WhatsApp provider responded with status ${response.status}`,
        };
      }

      return {
        ok: true,
        providerMessageId: payload?.id,
      };
    } catch (error) {
      return {
        ok: false,
        errorMessage: error instanceof Error ? error.message : "Unknown WhatsApp provider error",
      };
    }
  }
}

class UnavailableWhatsAppProvider implements WhatsAppProvider {
  async sendTemplate(): Promise<WhatsAppSendResult> {
    return {
      ok: false,
      errorMessage: "WhatsApp provider is not configured",
    };
  }
}

export function createWhatsAppProvider(): WhatsAppProvider {
  const apiUrl = process.env.NOTIFICATIONS_WHATSAPP_API_URL;
  const apiToken = process.env.NOTIFICATIONS_WHATSAPP_API_TOKEN;

  if (!apiUrl || !apiToken) {
    return new UnavailableWhatsAppProvider();
  }

  return new OfficialWhatsAppProvider(apiUrl, apiToken);
}

export function normalizePhoneToE164(value: string): string | null {
  const compact = value.replace(/[^\d+]/g, "").trim();
  if (!compact) return null;

  if (compact.startsWith("+")) {
    if (compact.length < 8) return null;
    return compact;
  }

  if (compact.startsWith("00")) {
    const normalized = `+${compact.slice(2)}`;
    if (normalized.length < 8) return null;
    return normalized;
  }

  return null;
}
