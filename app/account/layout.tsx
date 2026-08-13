import GuestNav from "@/components/guest/GuestNav";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] text-slate-100"><GuestNav /><main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">{children}</main></div>;
}