"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { trackEvent } from "@/lib/analytics/client";
import { createSupabaseClient } from "@/lib/supabase/client";
import type { AIChatResponse, AIToolResult, HousingSearchContext } from "@/lib/ai/types";
import { canClientSend, type ConversationState } from "@/lib/support/conversation";
import type { SupportHandoff } from "@/lib/support/types";
import { useLanguage } from "@/components/LanguageSwitcher";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  response?: AIChatResponse;
  senderType?: string;
  source?: string;
  clientMessageId?: string;
  status?: "sending" | "sent" | "failed";
};

type ConversationPayload = {
  state: ConversationState;
  messages: Array<{ senderType: string; message: string; messageType?: string; source?: string; clientMessageId?: string | null; createdAt: string }>;
};

type StoredTrackingLink = { publicNumber: string; trackingUrl: string; savedAt: number };
const trackingLinksKey = "opero-support-tracking-links";

function readStoredTrackingLinks(): StoredTrackingLink[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(trackingLinksKey) || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is StoredTrackingLink => Boolean(item) && typeof item === "object" && typeof (item as StoredTrackingLink).publicNumber === "string" && typeof (item as StoredTrackingLink).trackingUrl === "string" && typeof (item as StoredTrackingLink).savedAt === "number") : [];
  } catch {
    return [];
  }
}

function storeTrackingLink(publicNumber: string, trackingUrl: string) {
  try {
    const links = readStoredTrackingLinks().filter((item) => item.publicNumber !== publicNumber).slice(-4);
    localStorage.setItem(trackingLinksKey, JSON.stringify([...links, { publicNumber, trackingUrl, savedAt: Date.now() }]));
  } catch {
  }
}

function initialSuggestions(isGuest: boolean): string[] {
  return isGuest ? ["Найти жильё", "Показать мои заявки", "Проверить свободные даты"] : ["Что требует внимания сегодня?", "Показать новые заявки", "Есть ли просроченные задачи?"];
}

function eventKey(senderType: string, message: string, createdAt: string) {
  return `${senderType}:${createdAt}:${message}`;
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
    return error ? <p className="mt-2 text-sm text-rose-200">{String(error)}</p> : null;
  }

  return (
    <div className="mt-3 space-y-2">
      {items.map((item, index) => {
        const title = String(item.title ?? item.apartmentTitle ?? item.name ?? `Запись ${index + 1}`);
        const id = typeof item.bookingNumber === "string" || typeof item.taskNumber === "string" ? String(item.bookingNumber ?? item.taskNumber) : String(item.publicRoute ?? index);
        const link = typeof item.publicRoute === "string" ? item.publicRoute : null;
        return (
          <div key={`${result.tool}-${id}-${index}`} className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
            {typeof item.coverPhotoUrl === "string" && item.coverPhotoUrl ? <img src={item.coverPhotoUrl} alt="" className="mb-3 h-32 w-full rounded-lg object-cover" /> : null}
            {link ? <Link href={link} className="font-medium text-cyan-200 hover:text-cyan-100">{title}</Link> : <p className="font-medium text-slate-100">{title}</p>}
            <p className="mt-1 text-xs leading-5 text-slate-400">
              {[item.city, item.district, item.dailyPrice != null && `${item.dailyPrice} ${String(item.currency ?? "EUR")}/ночь`, item.maxGuests && `до ${item.maxGuests} гостей`, item.checkIn && `Заезд: ${item.checkIn}`, item.checkOut && `Выезд: ${item.checkOut}`, item.status && `Статус: ${item.status}`, item.dueAt && `Срок: ${item.dueAt}`].filter(Boolean).map(String).join(" · ")}
            </p>
            {typeof item.shortDesc === "string" && item.shortDesc ? <p className="mt-2 text-sm leading-5 text-slate-300">{item.shortDesc}</p> : null}
            {link ? <div className="mt-3 flex gap-2"><Link href={link} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200">Подробнее</Link><Link href={`${link}?openBooking=1`} className="rounded-lg bg-cyan-400 px-3 py-2 text-xs font-semibold text-slate-950">Забронировать</Link></div> : null}
          </div>
        );
      })}
    </div>
  );
}

export default function OperoAI() {
  const pathname = usePathname();
  const [language] = useLanguage();
  const { currentUser, isAuthLoading } = useCurrentUser();
  const isDataEntryPage = pathname === "/apartments/new" || pathname === "/bookings/new";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>(() => initialSuggestions(true));
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const [failedClientMessageId, setFailedClientMessageId] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<{ prompt: string; details: SupportHandoff } | null>(null);
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactConsent, setContactConsent] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [trackingUrl, setTrackingUrl] = useState<string | null>(null);
  const [conversationState, setConversationState] = useState<ConversationState>("bot_active");
  const [housingContext, setHousingContext] = useState<Partial<HousingSearchContext> | undefined>();
  const [connectionState, setConnectionState] = useState<"online" | "offline">("online");
  const recentEvents = useRef(new Set<string>());
  const pendingClientMessages = useRef(new Map<string, string>());
  const connectionRef = useRef<"online" | "offline">("online");
  const messageCounter = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const visibleSuggestions = messages.length === 0 ? initialSuggestions(!currentUser || currentUser.role === "Гость") : suggestions;

  const appendConversationMessage = useCallback((item: { senderType: string; message: string; source?: string; clientMessageId?: string | null; createdAt: string }) => {
    if (item.clientMessageId) {
      const optimisticId = pendingClientMessages.current.get(item.clientMessageId);
      if (optimisticId) {
        pendingClientMessages.current.delete(item.clientMessageId);
        recentEvents.current.add(eventKey(item.senderType, item.message, item.createdAt));
        setMessages((current) => current.map((message) => message.id === optimisticId ? { ...message, id: `conversation-${item.clientMessageId}`, status: "sent" } : message));
        return;
      }
    }
    const key = eventKey(item.senderType, item.message, item.createdAt);
    if (recentEvents.current.has(key)) return;
    recentEvents.current.add(key);
    setMessages((current) => [...current, { id: `conversation-${key}`, role: item.senderType === "client" ? "user" : "assistant", text: item.message, senderType: item.senderType, source: item.source, status: "sent", clientMessageId: item.clientMessageId ?? undefined }]);
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    const response = await fetch(`/api/support/conversations/${encodeURIComponent(id)}`, { cache: "no-store" });
    const payload = await response.json() as ConversationPayload & { ok?: boolean };
    if (!response.ok || !payload.ok) return;
    setConversationId(id);
    setConversationState(payload.state);
    recentEvents.current.clear();
    setMessages(payload.messages.map((item) => {
      recentEvents.current.add(eventKey(item.senderType, item.message, item.createdAt));
      return { id: `conversation-${item.clientMessageId || eventKey(item.senderType, item.message, item.createdAt)}`, role: item.senderType === "client" ? "user" : "assistant", text: item.message, senderType: item.senderType, source: item.source, clientMessageId: item.clientMessageId ?? undefined, status: "sent" as const };
    }));
  }, []);

  const loadAnonymousConversation = useCallback(async (url: string) => {
    const target = new URL(url, window.location.origin);
    const publicNumber = target.pathname.split("/").filter(Boolean).pop() || "";
    const response = await fetch(`/api/support/anonymous/${encodeURIComponent(publicNumber)}${target.search}`, { cache: "no-store" });
    const payload = await response.json() as ConversationPayload & { ok?: boolean; conversation?: string };
    if (!response.ok || !payload.ok || !payload.conversation) return;
    setTrackingUrl(url);
    setConversationId(payload.conversation);
    setConversationState(payload.state);
    recentEvents.current.clear();
    setMessages(payload.messages.map((item) => {
      recentEvents.current.add(eventKey(item.senderType, item.message, item.createdAt));
      return { id: `conversation-${item.clientMessageId || eventKey(item.senderType, item.message, item.createdAt)}`, role: item.senderType === "client" ? "user" : "assistant", text: item.message, senderType: item.senderType, source: item.source, clientMessageId: item.clientMessageId ?? undefined, status: "sent" as const };
    }));
  }, []);

  useEffect(() => {
    if (!currentUser || conversationId || !pathname.startsWith("/support/conversation/")) return;
    void fetch("/api/support/tickets", { cache: "no-store" }).then((response) => response.json()).then((payload: { data?: Array<{ public_number: string; conversation_state?: ConversationState }> }) => {
      const ticket = payload.data?.find((item) => item.conversation_state && item.conversation_state !== "closed") ?? payload.data?.[0];
      if (ticket) void loadConversation(ticket.public_number);
    });
  }, [conversationId, currentUser, loadConversation, pathname]);

  useEffect(() => {
    if (currentUser || conversationId) return;
    const latest = readStoredTrackingLinks().sort((left, right) => right.savedAt - left.savedAt)[0];
    if (!latest) return;
    const timer = window.setTimeout(() => void loadAnonymousConversation(latest.trackingUrl), 0);
    return () => window.clearTimeout(timer);
  }, [conversationId, currentUser, loadAnonymousConversation]);

  useEffect(() => {
    if (!conversationId) return;
    const supabase = createSupabaseClient();
    if (!supabase) return;
    const channel = supabase.channel(`conversation:${conversationId}`)
      .on("broadcast", { event: "message" }, ({ payload }) => { setConnectionState("online"); connectionRef.current = "online"; if (payload?.senderType && payload?.message && payload?.createdAt) appendConversationMessage(payload); })
      .on("broadcast", { event: "state" }, ({ payload }) => { setConnectionState("online"); if (payload?.state) setConversationState(payload.state as ConversationState); })
      .on("broadcast", { event: "typing" }, () => setConnectionState("online"));
    channel.subscribe((status) => { const next = status === "SUBSCRIBED" ? "online" : "offline"; connectionRef.current = next; setConnectionState(next); });
    const fallback = window.setInterval(() => { if (connectionRef.current === "offline") void (trackingUrl ? loadAnonymousConversation(trackingUrl) : loadConversation(conversationId)); }, 15_000);
    return () => { window.clearInterval(fallback); void supabase.removeChannel(channel); };
  }, [conversationId, appendConversationMessage, loadConversation, loadAnonymousConversation, trackingUrl]);

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

  async function send(text = draft, retryClientMessageId?: string) {
    const value = text.trim();
    if (!value || pending) return;
    setDraft("");
    setPending(true);
    messageCounter.current += 1;
    const messageId = messageCounter.current;
    const clientMessageId = retryClientMessageId ?? crypto.randomUUID();
    const userMessage: ChatMessage = { id: `${messageId}-user`, role: "user", text: value, clientMessageId, status: "sending" };
    if (conversationId && conversationState !== "bot_active") pendingClientMessages.current.set(clientMessageId, userMessage.id);
    setMessages((current) => [...current, userMessage]);
    try {
      if (conversationId && conversationState !== "bot_active") {
        if (!currentUser && !trackingUrl) {
          setMessages((current) => current.map((message) => message.id === userMessage.id ? { ...message, status: "sent" } : message));
          setMessages((current) => [...current, { id: `${messageId}-handoff-state`, role: "assistant", text: language === "en" ? `Your request has already been sent to the manager. Reference: ${conversationId}.` : language === "tr" ? `Talebiniz zaten yöneticiye iletildi. Referans: ${conversationId}.` : `Ваш запрос уже передан менеджеру. Номер обращения: ${conversationId}.` }]);
          setLastFailedPrompt(null);
          setFailedClientMessageId(null);
          return;
        }
        const target = trackingUrl ? new URL(trackingUrl, window.location.origin) : null;
        const publicNumber = target?.pathname.split("/").filter(Boolean).pop() || "";
        const response = await fetch(target ? `/api/support/anonymous/${encodeURIComponent(publicNumber)}${target.search}` : `/api/support/conversations/${encodeURIComponent(conversationId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: value, clientMessageId }) });
        const payload = await response.json() as { ok?: boolean; error?: string; result?: string; state?: ConversationState; createdAt?: string; clientMessageId?: string };
        if (!response.ok) throw new Error(payload.error || "Не удалось отправить сообщение.");
        if (payload.createdAt) appendConversationMessage({ senderType: "client", message: value, createdAt: payload.createdAt, clientMessageId });
        else if (payload.result === "duplicate") setMessages((current) => current.map((message) => message.id === userMessage.id ? { ...message, status: "sent" } : message));
        if (payload.state) setConversationState(payload.state);
        setLastFailedPrompt(null);
        setFailedClientMessageId(null);
        return;
      }
      const history = messages.filter((message) => message.role === "user" || message.role === "assistant").slice(-10).map((message) => ({ role: message.role, text: message.text }));
      const response = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: value, route: pathname, history, language, housingContext }) });
      const payload = await response.json() as AIChatResponse & { error?: string };
      const assistantMessage: ChatMessage = { id: `${messageId}-assistant`, role: "assistant", text: response.ok ? payload.message : payload.error ?? "Не удалось получить ответ.", response: response.ok ? payload : undefined };
      if (response.ok) setMessages((current) => current.map((message) => message.id === userMessage.id ? { ...message, status: "sent" } : message));
      setMessages((current) => [...current, assistantMessage]);
      setLastFailedPrompt(response.ok ? null : value);
      setFailedClientMessageId(response.ok ? null : clientMessageId);
      if (payload.suggestions) setSuggestions(payload.suggestions);
      if (response.ok && payload.housingContext) setHousingContext(payload.housingContext);
      if (response.ok && payload.handoff?.offered) setHandoff({ prompt: value, details: payload.handoff });
    } catch {
      pendingClientMessages.current.delete(clientMessageId);
      setMessages((current) => current.map((message) => message.id === userMessage.id ? { ...message, status: "failed" } : message));
      setMessages((current) => [...current, { id: `${messageId}-error`, role: "assistant", text: "Сервис Opero AI временно недоступен." }]);
      setLastFailedPrompt(value);
      setFailedClientMessageId(clientMessageId);
    } finally {
      setPending(false);
    }
  }

  async function confirmHandoff() {
    if (!handoff) return;
    const response = await fetch("/api/support/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: handoff.prompt, route: pathname, confirmed: true, idempotencyKey: handoff.details.actionId, actionId: handoff.details.actionId, expiresAt: handoff.details.expiresAt, email: contactEmail, phone: contactPhone, consent: currentUser ? true : contactConsent, language }) });
    const payload = await response.json() as { ok?: boolean; message?: string; error?: string; publicNumber?: string; conversationState?: ConversationState; trackingUrl?: string | null };
    setMessages((current) => [...current, { id: `handoff-${Date.now()}`, role: "assistant", text: payload.ok ? payload.message || `Обращение ${payload.publicNumber} передано менеджеру.` : payload.error || "Не удалось передать обращение. Попробуйте ещё раз." }]);
    if (payload.ok) {
      trackEvent("contact_started", { page: pathname }, { dedupeKey: payload.publicNumber || handoff.details.actionId });
      trackEvent("manager_requested", { page: pathname }, { dedupeKey: payload.publicNumber || handoff.details.actionId });
      setHandoff(null); setContactEmail(""); setContactPhone(""); setContactConsent(false);
      if (payload.publicNumber) {
        setConversationId(payload.publicNumber);
        setConversationState(payload.conversationState ?? "waiting_manager");
        if (payload.trackingUrl) { setTrackingUrl(payload.trackingUrl); storeTrackingLink(payload.publicNumber, payload.trackingUrl); }
        if (currentUser) void loadConversation(payload.publicNumber);
      }
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send();
  }

  if (isAuthLoading && !open) return null;
  if (isDataEntryPage) return null;

  return (
    <>
      {open ? (
        <section ref={panelRef} className="fixed inset-0 z-[1100] flex flex-col border-l border-white/10 bg-slate-950 shadow-2xl shadow-black/40 sm:inset-y-4 sm:right-4 sm:left-auto sm:w-[390px] sm:rounded-2xl sm:border" aria-label="Opero AI панель">
          <header className="flex items-center justify-between border-b border-white/10 px-4 py-4">
            <div>
              <p className="text-sm font-semibold text-cyan-200">Opero AI</p>
              <p className="text-xs text-slate-400">Помощник по отдыху и бронированию</p>
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
            {conversationId && conversationState === "waiting_manager" ? <p className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">Менеджер скоро подключится.</p> : null}
            {conversationId && conversationState === "manager_active" ? <p className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs text-emerald-100">Связь с менеджером · {connectionState === "online" ? "онлайн" : "переподключение"}</p> : null}
            {trackingUrl ? <Link href={trackingUrl} className="inline-flex rounded-xl border border-cyan-300/30 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-300/10">Открыть диалог</Link> : null}
            {handoff ? <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4"><p className="text-sm text-amber-100">Для решения вопроса краткая информация будет передана сотруднику Opero Homes.</p>{!currentUser ? <div className="mt-3 space-y-2"><input value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} type="email" placeholder="Email для связи" aria-label="Email для связи" className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white" /><input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} type="tel" placeholder="Телефон для связи" aria-label="Телефон для связи" className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white" /><label className="flex gap-2 text-xs text-amber-100/80"><input checked={contactConsent} onChange={(event) => setContactConsent(event.target.checked)} type="checkbox" /> Согласен на связь по этому вопросу</label></div> : null}<button type="button" disabled={!currentUser && (!contactConsent || (!contactEmail.trim() && !contactPhone.trim()))} onClick={() => void confirmHandoff()} className="mt-3 rounded-xl bg-amber-200 px-3 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">Передать менеджеру</button></div> : null}
            {!pending && lastFailedPrompt ? <button type="button" onClick={() => void send(lastFailedPrompt, failedClientMessageId ?? undefined)} className="rounded-lg border border-rose-300/30 px-3 py-2 text-sm text-rose-200 hover:bg-rose-300/10">Повторить запрос</button> : null}
          </div>
          <div className="border-t border-white/10 p-3">
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
              {visibleSuggestions.slice(0, 3).map((suggestion) => <button key={suggestion} type="button" onClick={() => void send(suggestion)} className="shrink-0 rounded-full border border-cyan-300/20 px-3 py-2 text-xs text-cyan-100 hover:bg-cyan-300/10">{suggestion}</button>)}
            </div>
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input ref={inputRef} value={draft} onChange={(event) => { setDraft(event.target.value); if (conversationId) void fetch(`/api/support/conversations/${encodeURIComponent(conversationId)}/typing`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ typing: true }) }); }} maxLength={2000} placeholder={conversationState === "waiting_manager" ? "Напишите менеджеру" : "Напишите запрос"} aria-label="Сообщение Opero AI" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-300/50" />
              <button type="submit" disabled={pending || !draft.trim() || (conversationId !== null && !canClientSend(conversationState))} className="rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">Отправить</button>
            </form>
          </div>
        </section>
      ) : (
        <button type="button" onClick={() => setOpen(true)} aria-label="Открыть Opero AI" className="fixed bottom-5 right-5 z-[1100] rounded-full border border-cyan-200/30 bg-slate-950 px-5 py-3 text-sm font-semibold text-cyan-100 shadow-xl shadow-cyan-950/30 transition hover:-translate-y-0.5 hover:border-cyan-200/60 sm:bottom-6 sm:right-6">Opero AI</button>
      )}
    </>
  );
}