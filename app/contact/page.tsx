import Link from "next/link";
import OperoContact from "@/components/contact/OperoContact";

export default function ContactPage() {
	return (
		<main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_32%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] px-4 py-12 text-slate-100 sm:px-6 lg:px-8">
			<div className="mx-auto max-w-3xl">
				<Link href="/" className="font-bold text-white">opero<span className="text-cyan-300">.</span></Link>
				<h1 className="mt-16 text-4xl font-semibold text-white sm:text-5xl">Связаться с Opero Homes</h1>
				<p className="mt-5 max-w-2xl leading-7 text-slate-300">Посмотрите предложения на платформе или свяжитесь с нами по официальным контактам Opero Homes.</p>
				<OperoContact language="ru" placement="contact" className="mt-8" />
			</div>
		</main>
	);
}