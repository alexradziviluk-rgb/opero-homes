"use client";

import { useEffect, useMemo, useState } from "react";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import {
  getMessagesByClientId,
  markClientMessageRead,
} from "@/lib/messages/client-message-repository";
import type { ClientMessage } from "@/types/client-message";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default function GuestMessagesPage() {
  const { currentUser } = useCurrentUser();
  const [messages, setMessages] = useState<ClientMessage[]>([]);

  const clientId = currentUser?.clientId;

  function reloadMessages() {
    if (!clientId) {
      setMessages([]);
      return;
    }

    setMessages(getMessagesByClientId(clientId));
  }

  useEffect(() => {
    function handleMessagesChanged() {
      reloadMessages();
    }

    const initialLoadId = window.setTimeout(handleMessagesChanged, 0);
    window.addEventListener("opero-client-messages-changed", handleMessagesChanged);
    return () => {
      window.clearTimeout(initialLoadId);
      window.removeEventListener("opero-client-messages-changed", handleMessagesChanged);
    };
  }, [clientId]);

  const unreadCount = useMemo(
    () => messages.filter((message) => !message.isRead).length,
    [messages],
  );

  if (!currentUser) {
    return null;
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold text-white">Сообщения</h1>
      <p className="mt-2 text-sm text-slate-300">Личные системные сообщения по вашим бронированиям.</p>
      <p className="mt-1 text-sm text-slate-400">Непрочитанные: {unreadCount}</p>

      {!clientId ? (
        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/80 p-6 text-slate-300">
          Сообщения появятся после привязки гостевого профиля к карточке клиента.
        </div>
      ) : messages.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/80 p-6 text-slate-300">
          Сообщений пока нет.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {messages.map((message) => (
            <article key={message.id} className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-white">{message.title}</h2>
                <span className={`rounded-full px-2 py-1 text-xs ${message.isRead ? "bg-slate-500/20 text-slate-300" : "bg-cyan-500/20 text-cyan-200"}`}>
                  {message.isRead ? "Прочитано" : "Не прочитано"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">{formatDate(message.createdAt)}</p>
              <p className="mt-3 whitespace-pre-line text-sm text-slate-200">{message.body}</p>
              {!message.isRead ? (
                <button
                  type="button"
                  onClick={() => {
                    markClientMessageRead(message.id);
                    reloadMessages();
                  }}
                  className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
                >
                  Отметить как прочитанное
                </button>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
