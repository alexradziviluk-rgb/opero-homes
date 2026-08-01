export type PlanCode = "starter" | "professional" | "business";

export type Plan = {
  code: PlanCode;
  name: string;
  monthlyPrice: number;
  propertyLimit: number;
  staffLimit: number | null;
  features: string[];
};

export const plans: Plan[] = [
  { code: "starter", name: "Starter", monthlyPrice: 19, propertyLimit: 5, staffLimit: 3, features: ["До 5 объектов", "До 3 сотрудников", "Бронирования", "Календарь", "Задачи", "Уборка и ремонт"] },
  { code: "professional", name: "Professional", monthlyPrice: 49, propertyLimit: 30, staffLimit: 15, features: ["До 30 объектов", "До 15 сотрудников", "Check-in/check-out", "Уведомления", "Отчёты", "Расширенные роли"] },
  { code: "business", name: "Business", monthlyPrice: 99, propertyLimit: 100, staffLimit: null, features: ["До 100 объектов", "Неограниченные менеджеры", "Приоритетная поддержка", "Расширенная аналитика", "Будущие интеграции"] },
];

export function getPlan(code: string | null | undefined): Plan | null {
  return plans.find((plan) => plan.code === code) ?? null;
}