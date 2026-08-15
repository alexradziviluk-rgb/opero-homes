"use client";

import { trackEvent } from "@/lib/analytics/client";
import type { Language } from "@/components/LanguageSwitcher";

type ContactVariant = "panel" | "footer";
type ContactLanguage = Language | "de";
type ContactPlacement = "homepage" | "property" | "contact" | "catalog" | "generic";

type OperoContactProps = {
  language?: ContactLanguage;
  variant?: ContactVariant;
  placement?: ContactPlacement;
  className?: string;
};

const CONTACT_EMAIL = "operohomes@gmail.com";
const CONTACT_PHONE = "+90 538 540 67 30";
const WHATSAPP_NUMBER = "905385406730";

const contactCopy = {
  ru: {
    eyebrow: "Связаться с Opero Homes",
    title: "Нужна помощь с выбором жилья?",
    description: "Свяжитесь с Opero Homes - наши менеджеры помогут подобрать подходящий вариант в Аланье или Махмутларе.",
    whatsapp: "WhatsApp",
    phone: "Позвонить",
    email: "Email",
    emailLabel: "Email",
    phoneLabel: "Телефон",
    footer: "Opero Homes - платформа поиска жилья в Турции.",
  },
  en: {
    eyebrow: "Contact Opero Homes",
    title: "Need help choosing a home?",
    description: "Contact Opero Homes and our managers will help you explore suitable options in Alanya or Mahmutlar.",
    whatsapp: "WhatsApp",
    phone: "Call",
    email: "Email",
    emailLabel: "Email",
    phoneLabel: "Phone",
    footer: "Opero Homes - a platform for finding rental properties in Turkey.",
  },
  de: {
    eyebrow: "Opero Homes kontaktieren",
    title: "Sie brauchen Hilfe bei der Wohnungssuche?",
    description: "Kontaktieren Sie Opero Homes. Unsere Manager helfen Ihnen, eine passende Unterkunft in Alanya oder Mahmutlar zu finden.",
    whatsapp: "WhatsApp",
    phone: "Anrufen",
    email: "E-Mail",
    emailLabel: "E-Mail",
    phoneLabel: "Telefon",
    footer: "Opero Homes - eine Plattform für Mietwohnungen in der Türkei.",
  },
  tr: {
    eyebrow: "Opero Homes ile iletişim",
    title: "Konut seçimi için yardıma mı ihtiyacınız var?",
    description: "Opero Homes ile iletişime geçin. Yöneticilerimiz Alanya veya Mahmutlar'da uygun seçenekleri bulmanıza yardımcı olur.",
    whatsapp: "WhatsApp",
    phone: "Arayın",
    email: "E-posta",
    emailLabel: "E-posta",
    phoneLabel: "Telefon",
    footer: "Opero Homes - Türkiye'de kiralık konut bulma platformu.",
  },
} as const;

function contactStarted(method: "whatsapp" | "phone" | "email", placement: ContactPlacement) {
  trackEvent("contact_started", { contact_method: method, contact_placement: placement });
}

export default function OperoContact({ language = "en", variant = "panel", placement = "generic", className = "" }: OperoContactProps) {
  const copy = contactCopy[language];
  const whatsappMessage = language === "ru"
    ? "Здравствуйте! Я нашёл Opero Homes и хотел бы узнать подробнее об аренде жилья."
    : language === "de"
    ? "Hallo! Ich habe Opero Homes gefunden und möchte mehr über die Anmietung einer Unterkunft erfahren."
    : "Hello! I found Opero Homes and would like more information about renting a property.";
  const whatsappHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappMessage)}`;

  if (variant === "footer") {
    return (
      <footer className={`border-t border-white/10 bg-slate-950/80 px-4 py-8 text-sm text-slate-300 sm:px-6 lg:px-8 ${className}`}>
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-semibold text-white">opero<span className="text-cyan-300">.</span></p>
            <p className="mt-1 max-w-md text-slate-400">{copy.footer}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-x-5 sm:gap-y-2">
            <a href={`mailto:${CONTACT_EMAIL}`} onClick={() => contactStarted("email", placement)} className="hover:text-cyan-200">{CONTACT_EMAIL}</a>
            <a href={`tel:${CONTACT_PHONE.replace(/[^\d+]/g, "")}`} onClick={() => contactStarted("phone", placement)} className="hover:text-cyan-200">{CONTACT_PHONE}</a>
            <a href={whatsappHref} target="_blank" rel="noreferrer" onClick={() => contactStarted("whatsapp", placement)} className="font-semibold text-cyan-200 hover:text-cyan-100">{copy.whatsapp}</a>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <section className={`rounded-2xl border border-cyan-300/20 bg-[linear-gradient(120deg,rgba(8,47,73,0.95),rgba(15,23,42,0.96))] p-5 shadow-xl shadow-cyan-950/10 sm:p-7 ${className}`} aria-labelledby="opero-contact-heading">
      <p className="text-sm font-medium uppercase tracking-[0.18em] text-cyan-300">{copy.eyebrow}</p>
      <h2 id="opero-contact-heading" className="mt-2 text-2xl font-semibold text-white">{copy.title}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">{copy.description}</p>
      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        <a href={whatsappHref} target="_blank" rel="noreferrer" onClick={() => contactStarted("whatsapp", placement)} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-200">{copy.whatsapp}</a>
        <a href={`tel:${CONTACT_PHONE.replace(/[^\d+]/g, "")}`} onClick={() => contactStarted("phone", placement)} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10">{copy.phone}</a>
        <a href={`mailto:${CONTACT_EMAIL}`} onClick={() => contactStarted("email", placement)} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10">{copy.email}</a>
      </div>
      <div className="mt-5 grid gap-2 text-sm text-slate-400 sm:grid-cols-2">
        <p><span className="text-slate-500">{copy.emailLabel}:</span> {CONTACT_EMAIL}</p>
        <p><span className="text-slate-500">{copy.phoneLabel}:</span> {CONTACT_PHONE}</p>
      </div>
    </section>
  );
}
