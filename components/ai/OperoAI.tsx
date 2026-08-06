"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import type { AIChatResponse, AIToolResult } from "@/lib/ai/types";
import type { SupportHandoff } from "@/lib/support/types";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  response?: AIChatResponse;
};

function initialSuggestions(isGuest: boolean): string[] {
  return isGuest ? ["Найти жильё", "Показать мои заявки", "Проверить свободные даты"] : ["Что требует внимания сегодня?", "Показать новые заявки", "Есть ли просроченные задачи?"];
}

function resultItems(result: AIToolResult): Array<Record<string, unknown>> {
  if (Array.isArray(result.data)) return result.data as Array<Record<string, unknown>>;
  if (result.data && typeof result.data === "object") {
    const record = result.data as Record<string, unknown>;
    for (const key of ["properties", "bookings", "tasks"]) {
      if (Array.isArray(record[key])) return record[key] as Array<Record<string, unknown>>;
    }
  }
  return [];
}

function ResultCard({ result }: { result: AIToolResult }) {
  const items = resultItems(result).slice(0, 5);
  const record = result.data && typeof result.data === "object" && !Array.isArray(result.data) ? result.data as Record<string, unknown> : null;
  if (items.length === 0) {
    const error = record?.error;
    return error ? <p className="mt-2 text-sm text-rose-200">{String(error)}</p> : <p className="mt-2 text-sm text-slate-300">Данных не найдено.</p>;
  }

  return (
    <div className="mt-3 space-y-2">
      {items.map((item, index) => {
        const title = String(item.title ?? item.apartmentTitle ?? item.name ?? `Запись ${index + 1}`);
        const id = typeof item.bookingNumber === "string" || typeof item.taskNumber === "string" ? String(item.bookingNumber ?? item.taskNumber) : "";
        const link = typeof item.publicRoute === "string" ? item.publicRoute : null;
        return (
          <div key={`${result.tool}-${id}-${index}`} className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
            {link ? <Link href={link} className="font-medium text-cyan-200 hover:text-cyan-100">{title}</Link> : <p className="font-medium text-slate-100">{title}</p>}
            <p className="mt-1 text-xs leading-5 text-slate-400">
              {[item.city, item.district, item.checkIn && `Заезд: ${item.checkIn}`, item.checkOut && `Выезд: ${item.checkOut}`, item.status && `Статус: ${item.status}`, item.dueAt && `Срок: ${item.dueAt}`].filter(Boolean).map(String).join(" · ")}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default function OperoAI() {
  const pathname = usePathname();
  const { currentUser, isAuthLoading } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>(() => initialSuggestions(true));
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<{ prompt: string; details: SupportHandoff } | null>(null);
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactConsent, setContactConsent] = useState(false);
  const messageCounter = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const visibleSuggestions = messages.length === 0 ? initialSuggestions(!currentUser || currentUser.role === "Гость") : suggestions;

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const panel = panelRef.current;
    if (!panel) return;
    const focusPanel = panel;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const focusable = Array.from(focusPanel.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    focusPanel.addEventListener("keydown", handleKeyDown);
    return () => focusPanel.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  async function send(text = draft) {
    const value = text.trim();
    if (!value || pending) return;
    setDraft("");
    setPending(true);
    messageCounter.current += 1;
    const messageId = messageCounter.current;
    const userMessage: ChatMessage = { id: `${messageId}-user`, role: "user", text: value };
    setMessages((current) => [...current, userMessage]);
    try {
      const response = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: value, route: pathname }) });
      const payload = await response.json() as AIChatResponse & { error?: string };
      const assistantMessage: ChatMessage = { id: `${messageId}-assistant`, role: "assistant", text: response.ok ? payload.message : payload.error ?? "Не удалось получить ответ.", response: response.ok ? payload : undefined };
      setMessages((current) => [...current, assistantMessage]);
      setLastFailedPrompt(response.ok ? null : value);
      if (payload.suggestions) setSuggestions(payload.suggestions);
      if (response.ok && payload.handoff?.offered) setHandoff({ prompt: value, details: payload.handoff });
    } catch {
      setMessages((current) => [...current, { id: `${messageId}-error`, role: "assistant", text: "Сервис Opero AI временно недоступен." }]);
      setLastFailedPrompt(value);
    } finally {
      setPending(false);
    }
  }

  async function confirmHandoff() {
    if (!handoff) return;
    const response = await fetch("/api/support/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: handoff.prompt, route: pathname, confirmed: true, idempotencyKey: handoff.details.actionId, actionId: handoff.details.actionId, expiresAt: handoff.details.expiresAt, email: contactEmail, phone: contactPhone, consent: currentUser ? true : contactConsent }) });
    const payload = await response.json() as { ok?: boolean; message?: string; error?: string; publicNumber?: string };
    setMessages((current) => [...current, { id: `handoff-${Date.now()}`, role: "assistant", text: payload.ok ? payload.message || `Обращение ${payload.publicNumber} передано менеджеру.` : payload.error || "Не удалось создать обращение." }]);
    if (payload.ok) { setHandoff(null); setContactEmail(""); setContactPhone(""); setContactConsent(false); }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send();
  }

  if (isAuthLoading && !open) return null;

  return (
    <>
      {open ? (
        <section ref={panelRef} className="fixed inset-0 z-50 flex flex-col border-l border-white/10 bg-slate-950 shadow-2xl shadow-black/40 sm:inset-y-4 sm:right-4 sm:left-auto sm:w-[390px] sm:rounded-2xl sm:border" aria-label="Opero AI панель">
          <header className="flex items-center justify-between border-b border-white/10 px-4 py-4">
            <div>
              <p className="text-sm font-semibold text-cyan-200">Opero AI</p>
              <p className="text-xs text-slate-400">Данные Opero Homes · только чтение</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть Opero AI" className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-lg text-slate-300 hover:bg-white/10">×</button>
          </header>
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/5 p-4">
                <p className="text-base font-medium text-slate-100">{currentUser?.role === "Гость" ? `Добро пожаловать${currentUser.firstName ? `, ${currentUser.firstName}` : ""}!` : "Чем помочь сегодня?"}</p>
                <p className="mt-1 text-sm leading-6 text-slate-400">Помощник показывает только данные, доступные вашей роли.</p>
              </div>
            ) : null}
            {messages.map((message) => (
              <div key={message.id} className={message.role === "user" ? "ml-8" : "mr-2"}>
                <div className={message.role === "user" ? "rounded-2xl rounded-br-md bg-cyan-400 px-4 py-3 text-sm text-slate-950" : "rounded-2xl rounded-bl-md border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-slate-200"}>
                  {message.text}
                </div>
                {message.response?.results.map((result) => <ResultCard key={result.tool} result={result} />)}
              </div>
            ))}
            {pending ? <p className="text-sm text-slate-500">Проверяю данные…</p> : null}
            {handoff ? <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4"><p className="text-sm text-amber-100">Для решения вопроса краткая информация будет передана сотруднику Opero Homes.</p>{!currentUser ? <div className="mt-3 space-y-2"><input value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} type="email" placeholder="Email для связи" aria-label="Email для связи" className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white" /><input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} type="tel" placeholder="Телефон для связи" aria-label="Телефон для связи" className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white" /><label className="flex gap-2 text-xs text-amber-100/80"><input checked={contactConsent} onChange={(event) => setContactConsent(event.target.checked)} type="checkbox" /> Согласен на связь по этому вопросу</label></div> : null}<button type="button" disabled={!currentUser && (!contactConsent || (!contactEmail.trim() && !contactPhone.trim()))} onClick={() => void confirmHandoff()} className="mt-3 rounded-xl bg-amber-200 px-3 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">Передать менеджеру</button></div> : null}
            {!pending && lastFailedPrompt ? <button type="button" onClick={() => void send(lastFailedPrompt)} className="rounded-lg border border-rose-300/30 px-3 py-2 text-sm text-rose-200 hover:bg-rose-300/10">Повторить запрос</button> : null}
          </div>
          <div className="border-t border-white/10 p-3">
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
              {visibleSuggestions.slice(0, 3).map((suggestion) => <button key={suggestion} type="button" onClick={() => void send(suggestion)} className="shrink-0 rounded-full border border-cyan-300/20 px-3 py-2 text-xs text-cyan-100 hover:bg-cyan-300/10">{suggestion}</button>)}
            </div>
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} placeholder="Напишите запрос" aria-label="Сообщение Opero AI" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/50" />
              <button type="submit" disabled={pending || !draft.trim()} className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">Отправить</button>
            </form>
          </div>
        </section>
      ) : (
        <button type="button" onClick={() => setOpen(true)} aria-label="Открыть Opero AI" className="fixed bottom-5 right-5 z-40 rounded-full border border-cyan-200/30 bg-slate-950 px-5 py-3 text-sm font-semibold text-cyan-100 shadow-xl shadow-cyan-950/30 transition hover:-translate-y-0.5 hover:border-cyan-200/60 sm:bottom-6 sm:right-6">Opero AI</button>
      )}
    </>
  );
}