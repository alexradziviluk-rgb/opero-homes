"use client";

import type { ReactNode } from "react";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";

type OperationalShellProps = {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
};

export default function OperationalShell({ title, description, actions, children }: OperationalShellProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <Header showSearch={false} showNewListing={false} />
          <main className="p-4 sm:p-6 lg:p-8">
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
                <p className="mt-1 text-sm text-slate-400">{description}</p>
              </div>
              {actions}
            </header>
            <div className="mt-6">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
