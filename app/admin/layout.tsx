import type { Metadata } from "next";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { DashboardMetricsProvider } from "@/components/dashboard/dashboard-metrics-provider";
import { requireServerStaffPage } from "@/lib/supabase/server-auth";

export const metadata: Metadata = {
  title: "Opero Homes — Панель",
  description: "Современная панель управления Opero Homes",
};

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireServerStaffPage();

  return (
    <DashboardMetricsProvider>
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
        <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
          <Sidebar />
          <div className="min-w-0 flex-1">
            <Header />
            <main className="p-4 sm:p-6 lg:p-8">{children}</main>
          </div>
        </div>
      </div>
    </DashboardMetricsProvider>
  );
}
