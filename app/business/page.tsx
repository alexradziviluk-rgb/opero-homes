"use client";

import Link from "next/link";
import { Suspense } from "react";
import { plans } from "@/lib/subscriptions/plans";
import { useSearchParams } from "next/navigation";

const copy = {
  ru: {
    nav: ["Возможности", "Как это работает", "Тарифы"],
    eyebrow: "OPERATIONS, SIMPLIFIED",
    title: "Управляйте недвижимостью, бронированиями и командой в одной системе",
    subtitle: "Opero Homes объединяет объекты, бронирования, календарь, клиентов, уборку, ремонты, задачи и сотрудников.",
    start: "Начать бесплатно",
    demo: "Посмотреть демо",
    login: "Войти",
    trusted: "Одна рабочая среда для ежедневных операций",
    benefits: "Всё, что нужно для спокойного управления",
    benefitText: "Меньше ручной работы, яснее ответственность и полный контекст по каждому объекту.",
    features: ["Объекты и календарь", "Бронирования и клиенты", "Уборка, ремонты и задачи", "Роли и команда"],
    how: "От первой заявки до контроля команды",
    steps: ["Зарегистрируйте компанию", "Добавьте объекты и выберите тариф", "Управляйте операциями из Dashboard"],
    audience: "Для тех, кто отвечает за результат",
    audienceText: "Владельцы апартаментов, управляющие компании и операционные команды получают общий источник правды без таблиц и разрозненных чатов.",
    pricing: "Прозрачные тарифы",
    pricingText: "14 дней бесплатно. Без списания денег в пробный период.",
    faq: "Частые вопросы",
    final: "Начните управлять увереннее",
    finalText: "Создайте рабочее пространство за несколько минут и пригласите команду, когда будете готовы.",
    footer: "Система управления недвижимостью для владельцев и команд.",
  },
  en: {
    nav: ["Features", "How it works", "Pricing"],
    eyebrow: "OPERATIONS, SIMPLIFIED",
    title: "Manage properties, bookings and your team in one system",
    subtitle: "Opero Homes brings properties, bookings, calendar, clients, cleaning, maintenance, tasks and staff together.",
    start: "Start for free",
    demo: "View demo",
    login: "Log in",
    trusted: "One calm workspace for daily operations",
    benefits: "Everything you need to run with clarity",
    benefitText: "Less manual work, clearer ownership and the full context behind every property.",
    features: ["Properties and calendar", "Bookings and clients", "Cleaning, maintenance and tasks", "Roles and team"],
    how: "From first booking to team control",
    steps: ["Register your company", "Add properties and choose a plan", "Run operations from your Dashboard"],
    audience: "Built for people who own the outcome",
    audienceText: "Property owners, management companies and operations teams share one source of truth instead of spreadsheets and scattered chats.",
    pricing: "Straightforward pricing",
    pricingText: "14 days free. No charge during your trial.",
    faq: "Frequently asked questions",
    final: "Start managing with confidence",
    finalText: "Create your workspace in minutes and invite your team when you are ready.",
    footer: "Property management software for owners and teams.",
  },
} as const;

type Language = keyof typeof copy;

function BusinessContent() {
  const searchParams = useSearchParams();
  const language: Language = searchParams.get("lang") === "en" ? "en" : "ru";
  const text = copy[language];

  return (
    <main className="min-h-screen overflow-hidden bg-[#f5f3ee] text-[#17251f]">
      <section className="relative bg-[#173b32] text-[#f5f3ee]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(226,178,92,0.28),transparent_32%),linear-gradient(120deg,#173b32,#245847)]" />
        <div className="relative mx-auto max-w-7xl px-5 pb-20 pt-6 sm:px-8 lg:px-12">
          <nav className="flex items-center justify-between gap-4" aria-label="Main navigation">
            <Link href="/business" className="text-lg font-bold tracking-tight">opero<span className="text-[#e2b25c]">.</span></Link>
            <div className="hidden items-center gap-8 text-sm text-[#d7e0d8] md:flex"><a href="#features">{text.nav[0]}</a><a href="#how">{text.nav[1]}</a><a href="#pricing">{text.nav[2]}</a></div>
            <div className="flex items-center gap-2 text-sm">
              <Link href={language === "ru" ? "/business?lang=en" : "/business"} className="rounded-full border border-white/20 px-3 py-2 text-[#f5f3ee]" aria-label="Switch language">{language.toUpperCase()}</Link>
              <button type="button" className="rounded-full border border-white/20 px-3 py-2 md:hidden" aria-expanded="true" aria-label="Open navigation">Menu</button>
              <Link href="/login" className="hidden rounded-full px-3 py-2 sm:block">{text.login}</Link>
            </div>
          </nav>
          <div className="grid items-end gap-12 pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:pt-32">
            <div>
              <p className="text-xs font-semibold tracking-[0.28em] text-[#e2b25c]">{text.eyebrow}</p>
              <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">{text.title}</h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-[#d7e0d8]">{text.subtitle}</p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/register" className="rounded-full bg-[#e2b25c] px-6 py-3 font-semibold text-[#173b32]">{text.start}</Link>
                <a href="#demo" className="rounded-full border border-white/25 px-6 py-3 font-semibold">{text.demo}</a>
                <Link href="/login" className="rounded-full border border-white/25 px-6 py-3 font-semibold sm:hidden">{text.login}</Link>
              </div>
            </div>
            <div id="demo" className="rounded-[2rem] border border-white/15 bg-[#f5f3ee] p-3 text-[#17251f] shadow-2xl shadow-black/20">
              <div className="rounded-[1.5rem] bg-[#e9eee8] p-5 sm:p-7">
                <div className="flex items-center justify-between"><span className="text-sm font-semibold">Overview</span><span className="rounded-full bg-[#d3e4d3] px-3 py-1 text-xs text-[#286044]">Live workspace</span></div>
                <div className="mt-6 grid grid-cols-3 gap-3">{[["24", "Properties"], ["86%", "Occupancy"], ["12", "Tasks"]].map(([value, label]) => <div key={label} className="rounded-xl bg-white p-3"><strong className="block text-xl">{value}</strong><span className="text-xs text-[#68766d]">{label}</span></div>)}</div>
                <div className="mt-4 rounded-xl bg-white p-4"><div className="flex items-end gap-2" aria-label="Occupancy chart">{[35, 54, 42, 75, 61, 88, 68, 92].map((height, index) => <span key={index} className="flex-1 rounded-t bg-[#2d7659]" style={{ height: `${height}px` }} />)}</div><p className="mt-3 text-xs text-[#68766d]">Occupancy this month</p></div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="border-b border-[#d9ded6] bg-[#e9eee8] px-5 py-5 text-center text-sm font-medium text-[#496055] sm:px-8">{text.trusted}</section>
      <section id="features" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12"><div className="max-w-2xl"><p className="text-sm font-semibold text-[#b27827]">01 / FOUNDATION</p><h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">{text.benefits}</h2><p className="mt-5 text-lg leading-8 text-[#68766d]">{text.benefitText}</p></div><div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-[#d9ded6] bg-[#d9ded6] sm:grid-cols-2 lg:grid-cols-4">{text.features.map((feature, index) => <div key={feature} className="bg-[#f5f3ee] p-7"><span className="text-3xl font-semibold text-[#b27827]">0{index + 1}</span><h3 className="mt-12 font-semibold">{feature}</h3><p className="mt-3 text-sm leading-6 text-[#68766d]">A focused workflow that keeps your team moving.</p></div>)}</div></section>
      <section id="how" className="bg-[#173b32] px-5 py-20 text-[#f5f3ee] sm:px-8 lg:px-12"><div className="mx-auto max-w-7xl"><h2 className="max-w-2xl text-3xl font-semibold sm:text-5xl">{text.how}</h2><div className="mt-12 grid gap-8 md:grid-cols-3">{text.steps.map((step, index) => <div key={step} className="border-t border-white/20 pt-5"><span className="text-[#e2b25c]">0{index + 1}</span><h3 className="mt-10 text-xl font-semibold">{step}</h3></div>)}</div></div></section>
      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:px-12"><div><p className="text-sm font-semibold text-[#b27827]">02 / FIT</p><h2 className="mt-3 text-3xl font-semibold sm:text-5xl">{text.audience}</h2></div><p className="max-w-xl text-lg leading-8 text-[#68766d] lg:pt-10">{text.audienceText}</p></section>
      <section id="pricing" className="border-y border-[#d9ded6] bg-[#e9eee8] px-5 py-20 sm:px-8 lg:px-12"><div className="mx-auto max-w-7xl"><h2 className="text-3xl font-semibold sm:text-5xl">{text.pricing}</h2><p className="mt-4 text-[#68766d]">{text.pricingText}</p><div className="mt-10 grid gap-5 lg:grid-cols-3">{plans.map((plan) => <article key={plan.code} className={`rounded-2xl border p-6 ${plan.code === "professional" ? "border-[#b27827] bg-[#173b32] text-[#f5f3ee]" : "border-[#d9ded6] bg-[#f5f3ee]"}`}><p className="text-sm font-semibold">{plan.name}</p><p className="mt-5 text-4xl font-semibold">€{plan.monthlyPrice}<span className="text-sm font-normal opacity-70"> / month</span></p><ul className="mt-6 space-y-3 text-sm opacity-80">{plan.features.slice(0, 4).map((feature) => <li key={feature}>+ {feature}</li>)}</ul><Link href={`/register?plan=${plan.code}`} className="mt-8 block rounded-full border border-current px-4 py-3 text-center text-sm font-semibold">Choose {plan.name}</Link></article>)}</div></div></section>
      <section className="mx-auto max-w-3xl px-5 py-20 sm:px-8"><h2 className="text-3xl font-semibold sm:text-5xl">{text.faq}</h2><div className="mt-10 divide-y divide-[#d9ded6]">{["Можно ли попробовать бесплатно?", "Нужно ли сразу подключать оплату?", "Можно ли сменить тариф позже?"].map((question) => <details key={question} className="py-5"><summary className="cursor-pointer font-semibold">{question}</summary><p className="mt-3 text-sm leading-6 text-[#68766d]">Да. Доступен 14-дневный trial без списания денег. Платежи подключим на следующем этапе.</p></details>)}</div></section>
      <section className="mx-5 mb-8 rounded-3xl bg-[#e2b25c] px-6 py-14 text-center sm:mx-8 lg:mx-auto lg:max-w-7xl"><h2 className="text-3xl font-semibold sm:text-5xl">{text.final}</h2><p className="mx-auto mt-4 max-w-xl text-[#4e3b1d]">{text.finalText}</p><Link href="/register" className="mt-8 inline-block rounded-full bg-[#173b32] px-7 py-3 font-semibold text-[#f5f3ee]">{text.start}</Link></section>
      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-5 pb-10 pt-4 text-sm text-[#68766d] sm:px-8 lg:px-12"><div><strong className="text-[#17251f]">opero.</strong><p className="mt-2">{text.footer}</p></div><div className="flex gap-5"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/contact">Contact</Link></div></footer>
    </main>
  );
}

export default function BusinessPage() {
  return <Suspense fallback={<main className="min-h-screen bg-[#173b32]" />}><BusinessContent /></Suspense>;
}
