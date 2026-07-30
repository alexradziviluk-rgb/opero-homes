import type { ReactNode } from "react";

type StatCardProps = {
  title: string;
  value: string;
  delta?: string;
  icon: ReactNode;
  accentClass?: string;
  description?: string;
};

export default function StatCard({
  title,
  value,
  delta,
  icon,
  accentClass = "from-cyan-500/20 to-indigo-500/20",
  description,
}: StatCardProps) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-[0_20px_50px_-26px_rgba(34,211,238,0.45)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-400">{title}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</p>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${accentClass} text-slate-900`}>
          {icon}
        </div>
      </div>
      <div className="mt-6 flex items-center justify-between text-sm">
        {delta ? <p className="font-medium text-cyan-300">{delta}</p> : <p className="font-medium text-cyan-300">&nbsp;</p>}
        {description ? <p className="text-slate-500">{description}</p> : null}
      </div>
    </div>
  );
}
