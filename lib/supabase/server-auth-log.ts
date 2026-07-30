import "server-only";

type LogAuthErrorPayload = {
  stage: string;
  message?: string;
  code?: string;
};

export function logServerAuthError(payload: LogAuthErrorPayload): void {
  console.error("[auth]", {
    stage: payload.stage,
    message: payload.message ?? "",
    code: payload.code ?? "",
  });
}
